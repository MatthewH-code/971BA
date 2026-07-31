import pg from "pg";
import type { PilotRow, ReservationRow } from "./types.js";

const { Pool } = pg;

const CONNECTION_STRING = process.env.POSTGRES_URL || process.env.DATABASE_URL || "";

if (!CONNECTION_STRING) {
  console.warn(
    "[db] No POSTGRES_URL or DATABASE_URL set; database calls will fail until one is provided."
  );
}

const pool = new Pool({
  connectionString: CONNECTION_STRING,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export async function initDb(): Promise<void> {
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
}

interface SettingsRow {
  value: string;
}

export async function getSetting(key: string): Promise<string | null> {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key = $1", [key]);
  return rows.length ? (rows[0] as SettingsRow).value : null;
}

export async function setSetting(
  key: string,
  value: string | number | boolean
): Promise<void> {
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, String(value)]
  );
}

export async function allReservations(): Promise<ReservationRow[]> {
  const { rows } = await pool.query("SELECT * FROM reservations ORDER BY start_time");
  return rows as ReservationRow[];
}

export async function reservationsInRange(
  start: string,
  end: string
): Promise<ReservationRow[]> {
  const { rows } = await pool.query(
    "SELECT * FROM reservations WHERE start_time < $1 AND end_time > $2 ORDER BY start_time",
    [end, start]
  );
  return rows as ReservationRow[];
}

export async function reservationsStartingIn(
  start: string,
  end: string
): Promise<ReservationRow[]> {
  const { rows } = await pool.query(
    "SELECT * FROM reservations WHERE start_time >= $1 AND start_time < $2 ORDER BY start_time",
    [start, end]
  );
  return rows as ReservationRow[];
}

export async function getReservation(id: number): Promise<ReservationRow | undefined> {
  const { rows } = await pool.query("SELECT * FROM reservations WHERE id = $1", [id]);
  return rows[0] as ReservationRow | undefined;
}

export interface NewReservation {
  title: string;
  person: string;
  start_time: string;
  end_time: string;
  bill_to: string;
  uid: string;
  invitees: string;
}

export async function createReservation(input: NewReservation): Promise<ReservationRow> {
  const { rows } = await pool.query(
    `INSERT INTO reservations (title, person, start_time, end_time, bill_to, uid, invitees, invite_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`,
    [
      input.title,
      input.person,
      input.start_time,
      input.end_time,
      input.bill_to,
      input.uid,
      input.invitees,
    ]
  );
  return rows[0] as ReservationRow;
}

const RESERVATION_COLUMNS = new Set([
  "title",
  "person",
  "start_time",
  "end_time",
  "bill_to",
  "flight_hours",
  "hobbs_start",
  "hobbs_end",
  "fuel_used",
  "invite_status",
]);

export async function updateReservation(
  id: number,
  cols: Record<string, string | number>
): Promise<ReservationRow | undefined> {
  const keys = Object.keys(cols).filter((k) => RESERVATION_COLUMNS.has(k));
  if (keys.length === 0) return getReservation(id);
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const values: (string | number)[] = keys.map((k) => cols[k] as string | number);
  const { rows } = await pool.query(
    `UPDATE reservations SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
    [...values, id]
  );
  return rows[0] as ReservationRow | undefined;
}

export async function deleteReservation(id: number): Promise<boolean> {
  const { rowCount } = await pool.query("DELETE FROM reservations WHERE id = $1", [id]);
  return rowCount != null && rowCount > 0;
}

export async function updateInviteStatus(id: number, status: string): Promise<void> {
  await pool.query("UPDATE reservations SET invite_status = $1 WHERE id = $2", [status, id]);
}

export async function latestHobbsEnd(): Promise<number | null> {
  const { rows } = await pool.query(
    "SELECT hobbs_end FROM reservations WHERE hobbs_end IS NOT NULL ORDER BY start_time DESC, id DESC LIMIT 1"
  );
  return rows.length ? (rows[0].hobbs_end as number) : null;
}

export async function allPilots(): Promise<PilotRow[]> {
  const { rows } = await pool.query("SELECT * FROM pilots ORDER BY name");
  return rows as PilotRow[];
}

export async function getPilot(id: number): Promise<PilotRow | undefined> {
  const { rows } = await pool.query("SELECT * FROM pilots WHERE id = $1", [id]);
  return rows[0] as PilotRow | undefined;
}

export async function getPilotByEmail(email: string): Promise<PilotRow | undefined> {
  const { rows } = await pool.query("SELECT * FROM pilots WHERE email = $1", [email]);
  return rows[0] as PilotRow | undefined;
}

export async function getPilotByEmailExcept(
  email: string,
  id: number
): Promise<PilotRow | undefined> {
  const { rows } = await pool.query(
    "SELECT * FROM pilots WHERE email = $1 AND id != $2",
    [email, id]
  );
  return rows[0] as PilotRow | undefined;
}

export async function insertPilot(name: string, email: string): Promise<PilotRow> {
  const { rows } = await pool.query(
    "INSERT INTO pilots (name, email) VALUES ($1, $2) RETURNING *",
    [name, email]
  );
  return rows[0] as PilotRow;
}

export async function updatePilot(
  id: number,
  name: string,
  email: string
): Promise<PilotRow | undefined> {
  const { rows } = await pool.query(
    "UPDATE pilots SET name = $1, email = $2 WHERE id = $3 RETURNING *",
    [name, email, id]
  );
  return rows[0] as PilotRow | undefined;
}

export async function deletePilot(id: number): Promise<boolean> {
  const { rowCount } = await pool.query("DELETE FROM pilots WHERE id = $1", [id]);
  return rowCount != null && rowCount > 0;
}

await initDb();
