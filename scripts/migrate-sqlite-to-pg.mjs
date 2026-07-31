import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import pg from "pg";

const { Pool } = pg;

const DATA_FILE =
  process.env.DATA_FILE || path.join(process.cwd(), "data", "aircraft.db");
const CONNECTION_STRING = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!CONNECTION_STRING) {
  console.error("Set POSTGRES_URL (or DATABASE_URL) to the target Postgres database.");
  process.exit(1);
}
if (!fs.existsSync(DATA_FILE)) {
  console.error(`SQLite database not found at ${DATA_FILE}`);
  process.exit(1);
}

const sqlite = new Database(DATA_FILE, { readonly: true });
const pool = new Pool({ connectionString: CONNECTION_STRING });

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservations (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      person TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      bill_to TEXT NOT NULL DEFAULT '',
      flight_hours DOUBLE PRECISION,
      hobbs_start DOUBLE PRECISION,
      hobbs_end DOUBLE PRECISION,
      fuel_used DOUBLE PRECISION,
      created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS'),
      uid TEXT,
      invitees TEXT,
      invite_status TEXT
    );

    CREATE TABLE IF NOT EXISTS pilots (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const settings = sqlite.prepare("SELECT key, value FROM settings ORDER BY key").all();
  for (const s of settings) {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [s.key, s.value]
    );
  }
  console.log(`settings: ${settings.length} copied`);

  const pilots = sqlite.prepare("SELECT id, name, email FROM pilots ORDER BY id").all();
  for (const p of pilots) {
    await pool.query(
      `INSERT INTO pilots (id, name, email) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email`,
      [p.id, p.name, p.email]
    );
  }
  await pool.query(
    `SELECT setval(pg_get_serial_sequence('pilots', 'id'), (SELECT COALESCE(MAX(id), 1) FROM pilots))`
  );
  console.log(`pilots: ${pilots.length} copied`);

  const rows = sqlite
    .prepare(
      `SELECT id, title, person, start_time, end_time, bill_to, flight_hours,
              hobbs_start, hobbs_end, fuel_used, created_at, uid, invitees, invite_status
       FROM reservations ORDER BY id`
    )
    .all();
  for (const r of rows) {
    await pool.query(
      `INSERT INTO reservations
         (id, title, person, start_time, end_time, bill_to, flight_hours,
          hobbs_start, hobbs_end, fuel_used, created_at, uid, invitees, invite_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, person = EXCLUDED.person,
         start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
         bill_to = EXCLUDED.bill_to, flight_hours = EXCLUDED.flight_hours,
         hobbs_start = EXCLUDED.hobbs_start, hobbs_end = EXCLUDED.hobbs_end,
         fuel_used = EXCLUDED.fuel_used, created_at = EXCLUDED.created_at,
         uid = EXCLUDED.uid, invitees = EXCLUDED.invitees,
         invite_status = EXCLUDED.invite_status`,
      [
        r.id, r.title, r.person, r.start_time, r.end_time, r.bill_to,
        r.flight_hours, r.hobbs_start, r.hobbs_end, r.fuel_used,
        r.created_at, r.uid, r.invitees, r.invite_status,
      ]
    );
  }
  await pool.query(
    `SELECT setval(pg_get_serial_sequence('reservations', 'id'), (SELECT COALESCE(MAX(id), 1) FROM reservations))`
  );
  console.log(`reservations: ${rows.length} copied`);

  await pool.end();
  sqlite.close();
  console.log("Done. SQLite data copied to Postgres.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
