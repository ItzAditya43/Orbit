import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { dataDir } from "./dataDir.js";

// Foundation for future multi-device P2P sync: a stable per-install identity that survives
// restarts. Nothing currently consumes this beyond the pairing handshake stub in
// routes/device.ts — there's no sync engine yet, this just establishes what a device *is*
// so that piece can be built later without re-deriving identity/trust from scratch.
const IDENTITY_FILE = path.join(dataDir, "device_identity.json");

interface DeviceIdentity {
  deviceId: string;
  deviceName: string;
  publicKey: string; // PEM, SPKI
  privateKey: string; // PEM, PKCS8 — never sent over the API
}

function generate(): DeviceIdentity {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    deviceId: crypto.randomUUID(),
    deviceName: os.hostname(),
    publicKey,
    privateKey,
  };
}

function load(): DeviceIdentity {
  if (fs.existsSync(IDENTITY_FILE)) {
    return JSON.parse(fs.readFileSync(IDENTITY_FILE, "utf-8"));
  }
  const identity = generate();
  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2), { mode: 0o600 });
  return identity;
}

export const deviceIdentity = load();

export function publicDeviceInfo() {
  return { deviceId: deviceIdentity.deviceId, deviceName: deviceIdentity.deviceName, publicKey: deviceIdentity.publicKey };
}
