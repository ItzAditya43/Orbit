import express, { Router } from "express";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { db } from "./db.js";

// Using Orbit from other devices (a phone, another computer) without copying data anywhere:
// they open a link to THIS server and use the same web UI on the same database, so there is
// nothing to reconcile and nothing can drift out of sync.
//
// Two listeners, deliberately separate:
//   - the main one (index.ts), on loopback, trusts whatever reaches it — the desktop app and
//     CLI on this machine.
//   - the remote one below trusts nothing: every request must carry the access key. It only
//     exists while remote access is switched on.
// Which listener a request arrived on is what decides whether it needs the key — not its
// source address, which says nothing useful here.
//
// Other devices reach the remote listener over Tailscale, and only that way: it binds to this
// machine's Tailscale address, so only devices on the user's own private Tailscale network can
// connect at all, over WireGuard encryption that runs device to device. No third party can
// read the traffic and there is no public address. If Tailscale isn't connected, nothing
// listens — it never falls back to a wider interface. Nothing is opened on the ordinary local
// network either.

export const REMOTE_PORT = process.env.ORBIT_REMOTE_PORT ? Number(process.env.ORBIT_REMOTE_PORT) : 4311;
const COOKIE = "orbit_key";

function getSetting<T>(key: string, fallback: T): T {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}
function setSetting(key: string, value: unknown) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
}

// ---- access key -----------------------------------------------------------------------------

function accessKey(): string {
  let key = getSetting<string>("_remoteAccessKey", "");
  if (!key) {
    key = randomBytes(24).toString("base64url");
    setSetting("_remoteAccessKey", key);
  }
  return key;
}

function keyMatches(candidate: unknown): boolean {
  if (typeof candidate !== "string" || !candidate) return false;
  // Compared as fixed-length digests so neither the length nor the content leaks via timing.
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(accessKey()).digest();
  return timingSafeEqual(a, b);
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

// Wrong-key attempts per caller. The key is 192 random bits so guessing is hopeless anyway;
// this just stops something hammering the endpoint from costing anything.
const failures = new Map<string, { count: number; resetAt: number }>();
const MAX_FAILURES = 20;
const FAILURE_WINDOW_MS = 10 * 60_000;

function callerId(req: express.Request): string {
  // The connecting address itself — connections arrive directly, so forwarding headers would
  // only be something a caller made up to dodge the limit.
  return req.socket.remoteAddress ?? "unknown";
}

const DENIED_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Orbit</title><body style="font-family:system-ui,sans-serif;max-width:28rem;margin:18vh auto;padding:0 1.5rem;line-height:1.5">
<h1 style="font-size:1.1rem">This Orbit needs its access link</h1>
<p style="color:#666">Scan the QR code (or open the link) shown in Orbit on the computer, under Settings → Other devices.
If you used an older link, the key may have been reset.</p></body>`;

function requireKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const who = callerId(req);
  const record = failures.get(who);
  if (record && record.resetAt > Date.now() && record.count >= MAX_FAILURES) {
    return res.status(429).json({ error: "too many attempts — try again later" });
  }

  const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
  if (keyMatches(cookieValue(req.headers.cookie, COOKIE)) || keyMatches(bearer)) return next();

  // First visit: the link carries ?key=. Swap it for a cookie and redirect to the clean URL so
  // the key isn't left sitting in the address bar, history, or anything the page loads.
  if (keyMatches(req.query.key)) {
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${encodeURIComponent(accessKey())}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`
    );
    const url = new URL(req.originalUrl, "http://x");
    url.searchParams.delete("key");
    return res.redirect(302, url.pathname + url.search);
  }

  const now = Date.now();
  if (!record || record.resetAt <= now) failures.set(who, { count: 1, resetAt: now + FAILURE_WINDOW_MS });
  else record.count++;
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "access key required" });
  res.status(401).type("html").send(DENIED_PAGE);
}

// ---- key-protected listener -----------------------------------------------------------------

let server: http.Server | null = null;
let boundHost: string | null = null;
let listenError: string | null = null;

function startListener(app: express.Express, host: string) {
  if (server && boundHost === host) return;
  stopListener();
  const guarded = express();
  guarded.disable("x-powered-by");
  guarded.use(requireKey);
  guarded.use(app);
  const s = http.createServer(guarded);
  s.on("error", (err: NodeJS.ErrnoException) => {
    listenError = err.code === "EADDRINUSE" ? `port ${REMOTE_PORT} is already in use` : err.message;
    if (server === s) {
      server = null;
      boundHost = null;
    }
  });
  s.listen(REMOTE_PORT, host, () => {
    listenError = null;
  });
  server = s;
  boundHost = host;
}

function stopListener() {
  server?.close();
  server?.closeAllConnections?.();
  server = null;
  boundHost = null;
  listenError = null;
}

function findOnPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(dir, name);
    if (dir && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function findTailscale(): string | null {
  if (process.platform !== "win32") return findOnPath("tailscale");
  // The Windows installer doesn't always put it on PATH for already-running programs.
  const standard = path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Tailscale", "tailscale.exe");
  return findOnPath("tailscale.exe") ?? (fs.existsSync(standard) ? standard : null);
}

// Runs a helper program without ever blocking the server on it: these are other people's
// tools talking to system services, and one of them hanging must not freeze every request
// Orbit is handling. Resolves to the
// output, or null on any failure or timeout.
function probe(cmd: string, args: string[], timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout)));
  });
}

// Caches an async lookup for a while and shares one in-flight run between concurrent callers.
function cached<T>(ttlMs: number, load: () => Promise<T>) {
  let at = 0;
  let value: T | undefined;
  let running: Promise<T> | null = null;
  const get = (): Promise<T> => {
    if (value !== undefined && Date.now() - at < ttlMs) return Promise.resolve(value);
    running ??= load()
      .then((v) => {
        value = v;
        at = Date.now();
        return v;
      })
      .finally(() => {
        running = null;
      });
    return running;
  };
  get.forget = () => {
    at = 0;
  };
  return get;
}

// ---- Tailscale ------------------------------------------------------------------------------
//
// Orbit doesn't manage Tailscale — the user installs it and signs in — it only asks the local
// client what this machine's address on the private network is, and listens there.

interface TailscaleState {
  installed: boolean;
  running: boolean; // signed in and connected
  ip: string | null;
  name: string | null;
}

const tailscaleState = cached<TailscaleState>(4000, async () => {
  const override = process.env.ORBIT_TAILSCALE;
  const bin = override ? (fs.existsSync(override) ? override : null) : findTailscale();
  if (!bin) return { installed: false, running: false, ip: null, name: null };
  try {
    const info = JSON.parse((await probe(bin, ["status", "--json"], 4000)) ?? "");
    const ip = (info?.Self?.TailscaleIPs ?? []).find((a: string) => /^\d+\.\d+\.\d+\.\d+$/.test(a)) ?? null;
    const name = typeof info?.Self?.DNSName === "string" ? info.Self.DNSName.replace(/\.$/, "") || null : null;
    return { installed: true, running: info?.BackendState === "Running" && !!ip, ip, name };
  } catch {
    // not running, not signed in, or the service is stopped — reported as "not connected"
    return { installed: true, running: false, ip: null, name: null };
  }
});

// ---- firewall hint --------------------------------------------------------------------------
//
// A host firewall is the usual reason a device on the Tailscale network still can't connect:
// it treats the Tailscale interface like any other and drops the port. Orbit can't change
// firewall rules (that needs admin rights) — it works out the exact commands and shows them.
// The rule they add opens this one port to Tailscale's address range only.

interface FirewallStep {
  name: string;
  commands: string[];
}

// Only *whether* a firewall is running is looked up (a plain service query). Asking the
// firewall what it currently allows was tried and dropped: firewall-cmd goes through polkit,
// which can hang for many seconds or pop up a password prompt on the user's desktop. So this
// is always advice for "if a device can't connect", never a claim that the rule is missing.
const firewallStep = cached<FirewallStep | null>(60_000, async () => {
  if (process.platform !== "linux") return null;
  const active = async (unit: string) => (await probe("systemctl", ["is-active", unit], 3000))?.trim() === "active";
  if (await active("firewalld")) {
    return {
      name: "firewalld",
      commands: [
        `sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="100.64.0.0/10" port port="${REMOTE_PORT}" protocol="tcp" accept'`,
        "sudo firewall-cmd --reload",
      ],
    };
  }
  if (await active("ufw")) return { name: "ufw", commands: [`sudo ufw allow in on tailscale0 to any port ${REMOTE_PORT} proto tcp`] };
  return null;
});

async function apply(app: express.Express) {
  const ts = getSetting("remoteAccessEnabled", false) ? await tailscaleState() : null;
  // The setting can have flipped while waiting on the lookup; honour what it says now.
  if (ts?.running && ts.ip && getSetting("remoteAccessEnabled", false)) startListener(app, ts.ip);
  else stopListener();
}

async function status() {
  const enabled = getSetting("remoteAccessEnabled", false);
  const ts = await tailscaleState();
  const listening = enabled && !!server && !listenError && boundHost === ts.ip;
  return {
    enabled,
    // The numeric address rather than the device's name: it's just as permanent and works
    // whether or not the network has name lookup (MagicDNS) switched on.
    link: listening ? `http://${ts.ip}:${REMOTE_PORT}/?key=${accessKey()}` : null,
    error: enabled ? listenError : null,
    tailscale: { installed: ts.installed, connected: ts.running, name: ts.name },
    // Commands to let Tailscale devices through this machine's firewall, if one is running.
    firewall: enabled ? await firewallStep() : null,
    platform: process.platform,
  };
}

export function remoteAccessRouter(app: express.Express) {
  const router = Router();

  router.get("/", async (_req, res) => {
    // Re-evaluated on every look, so signing in to Tailscale after switching this on is
    // picked up as soon as the Settings page next checks.
    await apply(app);
    res.json(await status());
  });

  router.post("/", async (req, res) => {
    if (typeof req.body?.enabled === "boolean") setSetting("remoteAccessEnabled", req.body.enabled);
    tailscaleState.forget();
    firewallStep.forget();
    await apply(app);
    res.json(await status());
  });

  // New key: every link handed out so far, and every device already signed in, stops working.
  router.post("/reset-key", async (_req, res) => {
    setSetting("_remoteAccessKey", randomBytes(24).toString("base64url"));
    res.json(await status());
  });

  return router;
}

export function startRemoteAccess(app: express.Express) {
  void apply(app);
  // Tailscale can come up after Orbit does (both start at login), or reconnect with the
  // listener gone — keep the listener matched to it without anyone opening Settings.
  setInterval(() => {
    if (getSetting("remoteAccessEnabled", false)) void apply(app);
  }, 20_000).unref();
}

// ---- change feed ----------------------------------------------------------------------------
//
// With more than one device looking at the same data, each needs to notice what the others
// changed. Every successful write bumps a revision and remembers which client made it; clients
// poll cheaply and refresh only when someone *else* changed something (refreshing on your own
// writes would yank state out from under whatever you're in the middle of editing).

let revision = 0;
const recent: { revision: number; client: string }[] = [];
// Polled housekeeping calls and pure lookups that go over POST — not user-visible changes.
const NOT_A_CHANGE = /^\/(notifications\/check-|boundaries\/check$|ai\/|sync\/export|remote|device\/pairing)/;

export function changeFeed(): Router {
  const router = Router();
  router.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "OPTIONS" && !NOT_A_CHANGE.test(req.path)) {
      res.on("finish", () => {
        if (res.statusCode >= 400) return;
        recent.push({ revision: ++revision, client: String(req.headers["x-orbit-client"] ?? "") });
        if (recent.length > 200) recent.shift();
      });
    }
    next();
  });
  router.get("/revision", (req, res) => {
    const since = Number(req.query.since);
    const client = String(req.query.client ?? "");
    // No baseline yet is not a change. A server restart (counter went backwards) or a gap older
    // than the buffer mean "can't tell" — and the safe answer to that is to refresh.
    const hasBaseline = req.query.since !== undefined && Number.isFinite(since);
    const covered = since <= revision && (since === revision || (recent[0]?.revision ?? Infinity) <= since + 1);
    const changedByOthers = !hasBaseline ? false : covered ? recent.some((c) => c.revision > since && c.client !== client) : true;
    res.json({ revision, changedByOthers });
  });
  return router;
}
