import express, { Router } from "express";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { db } from "./db.js";

// Using Orbit from other devices (a phone, another computer) without copying data anywhere:
// they open a link to THIS server and use the same web UI on the same database, so there is
// nothing to reconcile and nothing can drift out of sync.
//
// Two listeners, both bound to loopback, deliberately separate:
//   - the main one (index.ts) trusts whatever reaches it — the desktop app and CLI on this
//     machine.
//   - the remote one below trusts nothing: every request must carry the access key. It only
//     exists while remote access is switched on, and the only thing that connects to it is the
//     tunnel helper running on this same machine, which carries traffic in from outside.
// Nothing is opened on the local network. Which listener a request arrived on is what decides
// whether it needs the key — not its source address, which is useless here (the tunnel
// delivers internet traffic from 127.0.0.1).

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
// this just stops something hammering the public address from costing anything.
const failures = new Map<string, { count: number; resetAt: number }>();
const MAX_FAILURES = 20;
const FAILURE_WINDOW_MS = 10 * 60_000;

function callerId(req: express.Request): string {
  const forwarded = req.headers["cf-connecting-ip"] ?? req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return (first ?? req.socket.remoteAddress ?? "unknown").trim();
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
    const https = req.headers["x-forwarded-proto"] === "https";
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${encodeURIComponent(accessKey())}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${https ? "; Secure" : ""}`
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
let listenError: string | null = null;

function startListener(app: express.Express) {
  if (server) return;
  const guarded = express();
  guarded.disable("x-powered-by");
  guarded.use(requireKey);
  guarded.use(app);
  const s = http.createServer(guarded);
  s.on("error", (err: NodeJS.ErrnoException) => {
    listenError = err.code === "EADDRINUSE" ? `port ${REMOTE_PORT} is already in use` : err.message;
    if (server === s) server = null;
  });
  s.listen(REMOTE_PORT, "127.0.0.1", () => {
    listenError = null;
  });
  server = s;
}

function stopListener() {
  server?.close();
  server?.closeAllConnections?.();
  server = null;
  listenError = null;
}

// ---- tunnel ---------------------------------------------------------------------------------
//
// Reaching this machine from outside needs something to carry traffic in. A Cloudflare quick
// tunnel does that with no account and no router setup: the cloudflared program (installed by
// the user — Orbit never downloads it) dials out and hands back a public https address that
// forwards to the listener above, so everything arriving through it still has to present the
// access key. The address is random and changes every time the tunnel starts.

function helperPath(): string | null {
  if (process.env.ORBIT_CLOUDFLARED) return fs.existsSync(process.env.ORBIT_CLOUDFLARED) ? process.env.ORBIT_CLOUDFLARED : null;
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(dir, "cloudflared");
    if (dir && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

let tunnel: ChildProcess | null = null;
let tunnelUrl: string | null = null;
let tunnelError: string | null = null;

function startTunnel() {
  if (tunnel) return;
  const bin = helperPath();
  if (!bin) {
    tunnelError = null;
    return;
  }
  tunnelUrl = null;
  tunnelError = null;
  // Run under a tiny shell watchdog that stops the helper when this server process goes away.
  // The desktop app stops the server with SIGKILL, which gives it no chance to clean up its
  // own children — without this an orphaned tunnel would keep the public address alive.
  const script = '"$0" tunnel --no-autoupdate --url "$1" & child=$!; while kill -0 "$2" 2>/dev/null && kill -0 $child 2>/dev/null; do sleep 2; done; kill $child 2>/dev/null';
  const child = spawn("sh", ["-c", script, bin, `http://127.0.0.1:${REMOTE_PORT}`, String(process.pid)], {
    stdio: ["ignore", "pipe", "pipe"],
    // Its own process group, so stopping it takes the helper down along with the shell. Killing
    // just the shell left the helper running — and the public address live — after "Turn off".
    detached: true,
  });
  const onOutput = (chunk: Buffer) => {
    const match = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) tunnelUrl = match[0];
  };
  child.stdout?.on("data", onOutput);
  child.stderr?.on("data", onOutput);
  child.on("error", (err) => {
    tunnelError = err.message;
  });
  child.on("exit", () => {
    if (tunnel !== child) return;
    tunnel = null;
    tunnelError = tunnelUrl ? "the tunnel stopped — switch this off and on again to get a new link" : "the tunnel couldn't start — check the internet connection";
    tunnelUrl = null;
  });
  tunnel = child;
}

function killGroup(child: ChildProcess | null) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // already gone
  }
}

function stopTunnel() {
  const child = tunnel;
  tunnel = null;
  tunnelUrl = null;
  tunnelError = null;
  killGroup(child);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    killGroup(tunnel);
    process.exit(0);
  });
}

// ---- wiring ---------------------------------------------------------------------------------

function apply(app: express.Express) {
  if (getSetting("remoteAccessEnabled", false)) {
    startListener(app);
    startTunnel();
  } else {
    stopTunnel();
    stopListener();
  }
}

function status() {
  const enabled = getSetting("remoteAccessEnabled", false);
  return {
    enabled,
    helperInstalled: !!helperPath(),
    // "starting" covers the few seconds between switching on and the address coming back.
    starting: enabled && !!tunnel && !tunnelUrl,
    link: enabled && tunnelUrl ? `${tunnelUrl}/?key=${accessKey()}` : null,
    error: enabled ? listenError ?? tunnelError : null,
  };
}

export function remoteAccessRouter(app: express.Express) {
  const router = Router();

  router.get("/", (_req, res) => res.json(status()));

  router.post("/", (req, res) => {
    if (typeof req.body?.enabled === "boolean") setSetting("remoteAccessEnabled", req.body.enabled);
    apply(app);
    res.json(status());
  });

  // New key: every link handed out so far, and every device already signed in, stops working.
  router.post("/reset-key", (_req, res) => {
    setSetting("_remoteAccessKey", randomBytes(24).toString("base64url"));
    res.json(status());
  });

  return router;
}

export function startRemoteAccess(app: express.Express) {
  apply(app);
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
