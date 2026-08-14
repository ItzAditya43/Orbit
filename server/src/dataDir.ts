import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Where Orbit's SQLite database and backups live. Resolution order:
//   1. ORBIT_DATA_DIR env var — set by the Tauri desktop shell when it spawns this server,
//      since a bundled/AppImage install can't write next to its own (read-only) code.
//   2. XDG_DATA_HOME/orbit, or ~/.local/share/orbit — the standard Linux location, used
//      when the server is run directly (not spawned by the desktop app).
//   3. <repo>/server/data — legacy path from before this existed, kept as a same-run
//      fallback so a dev checkout with existing data keeps working untouched.
function resolveDataDir(): string {
  if (process.env.ORBIT_DATA_DIR) return process.env.ORBIT_DATA_DIR;

  const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  const standardDir = path.join(xdgDataHome, "orbit");
  const legacyDir = path.join(__dirname, "..", "data");

  // First run against the standard location: if it's empty but a legacy dev-checkout
  // database already exists, migrate it once instead of silently starting fresh.
  const standardDbExists = fs.existsSync(path.join(standardDir, "productivity.sqlite"));
  const legacyDbExists = fs.existsSync(path.join(legacyDir, "productivity.sqlite"));
  if (!standardDbExists && legacyDbExists) {
    fs.mkdirSync(standardDir, { recursive: true });
    for (const file of fs.readdirSync(legacyDir)) {
      const src = path.join(legacyDir, file);
      if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(standardDir, file));
    }
    console.log(`Migrated existing data from ${legacyDir} to ${standardDir}`);
  }

  return standardDir;
}

export const dataDir = resolveDataDir();
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
