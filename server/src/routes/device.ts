import { Router } from "express";
import { randomUUID, randomBytes } from "node:crypto";
import { db } from "../db.js";
import { publicDeviceInfo } from "../deviceIdentity.js";

export const deviceRouter = Router();

// In-memory only — a pairing code is meant to be scanned within ~60s of being shown, not
// something that should survive a server restart or be persisted anywhere.
const pendingPairings = new Map<string, { expiresAt: number }>();
const PAIRING_TTL_MS = 60_000;

deviceRouter.get("/", (_req, res) => {
  res.json(publicDeviceInfo());
});

// Generates the payload a second device would scan (as a QR code, once there's a client
// capable of scanning one) to begin pairing. This is a foundation stub: it hands out a
// short-lived token and this device's public identity, but nothing yet verifies a real
// cryptographic handshake back — see routes/device.ts's `complete` endpoint and the
// paired_devices table for what's actually wired up so far.
deviceRouter.post("/pairing/start", (_req, res) => {
  const token = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + PAIRING_TTL_MS;
  pendingPairings.set(token, { expiresAt });

  // Clean up expired tokens opportunistically rather than on a timer.
  for (const [t, v] of pendingPairings) {
    if (v.expiresAt < Date.now()) pendingPairings.delete(t);
  }

  res.json({ ...publicDeviceInfo(), token, expiresAt });
});

deviceRouter.post("/pairing/complete", (req, res) => {
  const { token, peerDeviceName, peerPublicKey } = req.body ?? {};
  const pending = pendingPairings.get(token);
  if (!pending || pending.expiresAt < Date.now()) {
    return res.status(400).json({ error: "pairing code expired or invalid" });
  }
  if (!peerDeviceName || !peerPublicKey) {
    return res.status(400).json({ error: "peerDeviceName and peerPublicKey required" });
  }
  pendingPairings.delete(token);

  const id = randomUUID();
  db.prepare("INSERT INTO paired_devices (id, device_name, public_key, paired_at) VALUES (?,?,?,?)").run(
    id, peerDeviceName, peerPublicKey, new Date().toISOString()
  );
  res.status(201).json(db.prepare("SELECT * FROM paired_devices WHERE id = ?").get(id));
});

deviceRouter.get("/paired", (_req, res) => {
  res.json(db.prepare("SELECT * FROM paired_devices ORDER BY paired_at DESC").all());
});

deviceRouter.delete("/paired/:id", (req, res) => {
  db.prepare("DELETE FROM paired_devices WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
