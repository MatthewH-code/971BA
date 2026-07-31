import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "aircraft.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    person TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    bill_to TEXT NOT NULL DEFAULT '',
    flight_hours REAL,
    hobbs_start REAL,
    hobbs_end REAL,
    fuel_used REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    uid TEXT,
    invitees TEXT,
    invite_status TEXT
  );

  CREATE TABLE IF NOT EXISTS pilots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

interface TableInfoRow {
  name: string;
}

function migrate(): void {
  const cols = (db.prepare("PRAGMA table_info(reservations)").all() as TableInfoRow[]).map(
    (c) => c.name
  );
  const adds: Record<string, string> = {
    uid: "TEXT",
    invitees: "TEXT",
    invite_status: "TEXT",
    hobbs_start: "REAL",
    hobbs_end: "REAL",
  };
  for (const [name, type] of Object.entries(adds)) {
    if (!cols.includes(name)) {
      db.exec(`ALTER TABLE reservations ADD COLUMN ${name} ${type}`);
    }
  }
}
migrate();

interface SettingsRow {
  value: string;
}

const getSettingStmt = db.prepare("SELECT value FROM settings WHERE key = ?");
const setSettingStmt = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
);

export function getSetting(key: string): string | null {
  const row = getSettingStmt.get(key) as SettingsRow | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string | number | boolean): void {
  setSettingStmt.run(key, String(value));
}

export default db;
