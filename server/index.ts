import express from "express";
import session from "express-session";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import db, { getSetting, setSetting } from "./db.js";
import { verify, requireAuth } from "./auth.js";
import { getSmtp, smtpConfigured, sendInvite, sendCancellation, sendTestEmail } from "./mailer.js";
import type { Invitee, PilotRow, ReservationRow } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.join(__dirname, "..", "dist");
const SESSION_SECRET = process.env.SESSION_SECRET || "eclipse500-dev-secret";

const app = express();
app.use(express.json());
app.use(
  session({
    name: "n971ba.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 },
  })
);

function isValidDate(s: unknown): boolean {
  return typeof s === "string" && !Number.isNaN(Date.parse(s));
}

function isValidEmail(s: unknown): boolean {
  return typeof s === "string" && /^\S+@\S+\.\S+$/.test(s);
}

function parseInvitees(input: unknown): Invitee[] {
  if (!Array.isArray(input)) return [];
  const out: Invitee[] = [];
  for (const item of input) {
    const raw = typeof item === "string" ? item : (item as { email?: unknown } | null)?.email;
    const name =
      typeof item === "string"
        ? item
        : ((item as { name?: unknown; email?: unknown } | null)?.name ||
          (item as { email?: unknown } | null)?.email ||
          "");
    if (isValidEmail(raw)) {
      out.push({ name: String(name).trim(), email: (raw as string).trim() });
    }
  }
  return out;
}

function safeParseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

interface OverlapRow {
  id: number;
  title: string;
  start_time: string;
  end_time: string;
}

function overlaps(start: string, end: string, excludeId: number | null): OverlapRow | undefined {
  const rows = db
    .prepare("SELECT id, title, start_time, end_time FROM reservations")
    .all() as OverlapRow[];
  return rows.find((r) => r.id !== excludeId && r.start_time < end && start < r.end_time);
}

function smtpPayload() {
  const s = getSmtp();
  return {
    host: s.host,
    port: s.port,
    secure: s.secure,
    user: s.user,
    from: s.from,
    hasPassword: Boolean(s.pass),
    configured: smtpConfigured(s),
  };
}

const INSPECTION_INTERVAL = 100;

function currentHobbs(): number | null {
  const row = db
    .prepare(
      "SELECT hobbs_end FROM reservations WHERE hobbs_end IS NOT NULL ORDER BY start_time DESC, id DESC LIMIT 1"
    )
    .get() as { hobbs_end: number } | undefined;
  return row ? row.hobbs_end : null;
}

function inspectionStatus() {
  const raw = getSetting("inspection_hobbs");
  const hobbs =
    raw !== null && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : null;
  const date = getSetting("inspection_date");
  const cur = currentHobbs();
  return {
    hobbs,
    date,
    currentHobbs: cur,
    nextHobbs: hobbs != null ? hobbs + INSPECTION_INTERVAL : null,
    remainingHours: hobbs != null && cur != null ? hobbs + INSPECTION_INTERVAL - cur : null,
  };
}

app.get("/api/me", (req, res) => {
  res.json({ authenticated: Boolean(req.session && req.session.authenticated) });
});

app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (verify(String(password))) {
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "Incorrect password" });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/* ---------- Settings ---------- */

app.get("/api/settings", requireAuth, (req, res) => {
  const pilots = db.prepare("SELECT * FROM pilots ORDER BY name").all() as PilotRow[];
  res.json({ pilots, smtp: smtpPayload() });
});

app.post("/api/settings/pilots", requireAuth, (req, res) => {
  const { name, email } = req.body || {};
  const n = String(name || "").trim();
  const e = String(email || "").trim();
  if (!n || !isValidEmail(e)) {
    return res.status(400).json({ error: "A name and a valid email are required" });
  }
  const dup = db.prepare("SELECT id FROM pilots WHERE email = ?").get(e);
  if (dup) return res.status(409).json({ error: "A pilot with that email already exists" });
  const info = db.prepare("INSERT INTO pilots (name, email) VALUES (?, ?)").run(n, e);
  res.status(201).json(db.prepare("SELECT * FROM pilots WHERE id = ?").get(info.lastInsertRowid));
});

app.patch("/api/settings/pilots/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM pilots WHERE id = ?").get(id) as PilotRow | undefined;
  if (!row) return res.status(404).json({ error: "Pilot not found" });

  const { name, email } = req.body || {};
  const n = name !== undefined ? String(name).trim() : row.name;
  const e = email !== undefined ? String(email).trim() : row.email;
  if (!n || !isValidEmail(e)) {
    return res.status(400).json({ error: "A name and a valid email are required" });
  }
  const dup = db.prepare("SELECT id FROM pilots WHERE email = ? AND id != ?").get(e, id);
  if (dup) return res.status(409).json({ error: "A pilot with that email already exists" });

  db.prepare("UPDATE pilots SET name = ?, email = ? WHERE id = ?").run(n, e, id);
  res.json(db.prepare("SELECT * FROM pilots WHERE id = ?").get(id));
});

app.delete("/api/settings/pilots/:id", requireAuth, (req, res) => {
  const info = db.prepare("DELETE FROM pilots WHERE id = ?").run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: "Pilot not found" });
  res.json({ ok: true });
});

app.patch("/api/settings/smtp", requireAuth, (req, res) => {
  const { host, port, secure, user, password, from } = req.body || {};
  if (host !== undefined) setSetting("smtp_host", String(host).trim());
  if (port !== undefined) setSetting("smtp_port", String(port));
  if (secure !== undefined) setSetting("smtp_secure", secure ? "1" : "0");
  if (user !== undefined) setSetting("smtp_user", String(user).trim());
  if (password) setSetting("smtp_pass", password);
  if (from !== undefined) setSetting("smtp_from", String(from).trim());
  res.json({ ok: true, smtp: smtpPayload() });
});

app.post("/api/settings/test-email", requireAuth, async (req, res) => {
  const { to } = req.body || {};
  const smtp = getSmtp();
  if (!smtpConfigured(smtp)) return res.status(400).json({ error: "Configure SMTP first" });
  if (!isValidEmail(String(to || ""))) return res.status(400).json({ error: "Enter a valid email" });
  try {
    await sendTestEmail({ to, smtp });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ---------- 100-hour inspection ---------- */

app.get("/api/inspection", requireAuth, (req, res) => {
  res.json(inspectionStatus());
});

app.patch("/api/inspection", requireAuth, (req, res) => {
  const { hobbs, date } = req.body || {};
  if (hobbs !== undefined) {
    if (hobbs === "") {
      setSetting("inspection_hobbs", "");
    } else {
      const h = Number(hobbs);
      if (Number.isNaN(h) || h < 0) {
        return res.status(400).json({ error: "Invalid Hobbs reading" });
      }
      setSetting("inspection_hobbs", h);
    }
  }
  if (date !== undefined) {
    const d = String(date).trim();
    if (d && !isValidDate(d)) return res.status(400).json({ error: "Invalid date" });
    setSetting("inspection_date", d);
  }
  res.json(inspectionStatus());
});

/* ---------- Reservations ---------- */

app.get("/api/reservations", requireAuth, (req, res) => {
  const start = req.query.start;
  const end = req.query.end;
  let rows: ReservationRow[];
  if (start && end) {
    rows = db
      .prepare(
        "SELECT * FROM reservations WHERE start_time < ? AND end_time > ? ORDER BY start_time"
      )
      .all(String(end), String(start)) as ReservationRow[];
  } else {
    rows = db.prepare("SELECT * FROM reservations ORDER BY start_time").all() as ReservationRow[];
  }
  res.json(rows);
});

app.get("/api/reservations/:id", requireAuth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM reservations WHERE id = ?")
    .get(Number(req.params.id)) as ReservationRow | undefined;
  if (!row) return res.status(404).json({ error: "Reservation not found" });
  res.json(row);
});

app.post("/api/reservations", requireAuth, (req, res) => {
  const { title, person, start, end, invitees } = req.body || {};
  const t = String(title || "").trim();
  const p = String(person || "").trim();
  if (!t || !p || !isValidDate(start) || !isValidDate(end)) {
    return res
      .status(400)
      .json({ error: "Title, person, and a valid start/end are required" });
  }
  if (start >= end) {
    return res.status(400).json({ error: "End must be after start" });
  }
  const conflict = overlaps(start, end, null);
  if (conflict) {
    return res.status(409).json({
      error: `Time conflicts with "${conflict.title}" (${conflict.start_time} – ${conflict.end_time})`,
    });
  }

  const parsedInvitees = parseInvitees(invitees);
  const uid = crypto.randomUUID();
  const info = db
    .prepare(
      "INSERT INTO reservations (title, person, start_time, end_time, bill_to, uid, invitees, invite_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(t, p, start, end, p, uid, JSON.stringify(parsedInvitees), "pending");
  const row = db
    .prepare("SELECT * FROM reservations WHERE id = ?")
    .get(info.lastInsertRowid) as ReservationRow;
  res.status(201).json(row);

  if (parsedInvitees.length === 0) {
    db.prepare("UPDATE reservations SET invite_status = ? WHERE id = ?").run("skipped", row.id);
    return;
  }
  sendInvite(row, parsedInvitees)
    .then((status) => {
      db.prepare("UPDATE reservations SET invite_status = ? WHERE id = ?").run(status, row.id);
    })
    .catch((err) => {
      console.error("Invite send failed:", (err as Error).message);
      db.prepare("UPDATE reservations SET invite_status = ? WHERE id = ?").run("failed", row.id);
    });
});

app.patch("/api/reservations/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM reservations WHERE id = ?").get(id) as
    | ReservationRow
    | undefined;
  if (!row) return res.status(404).json({ error: "Reservation not found" });

  const { billTo, hobbsStart, hobbsEnd, fuelUsed } = req.body || {};
  const sets: string[] = [];
  const params: (string | number)[] = [];

  if (billTo !== undefined) {
    const b = String(billTo).trim();
    if (!b) return res.status(400).json({ error: "Bill-to cannot be empty" });
    sets.push("bill_to = ?");
    params.push(b);
  }
  if (hobbsStart !== undefined || hobbsEnd !== undefined) {
    const hs = hobbsStart !== undefined ? Number(hobbsStart) : null;
    const he = hobbsEnd !== undefined ? Number(hobbsEnd) : null;
    if (hs !== null && (Number.isNaN(hs) || hs < 0)) {
      return res.status(400).json({ error: "Invalid Hobbs start" });
    }
    if (he !== null && (Number.isNaN(he) || he < 0)) {
      return res.status(400).json({ error: "Invalid Hobbs end" });
    }
    const finalHs = hs !== null ? hs : row.hobbs_start;
    const finalHe = he !== null ? he : row.hobbs_end;
    if (finalHs != null && finalHe != null) {
      if (finalHe < finalHs) {
        return res.status(400).json({ error: "Hobbs end must be >= start" });
      }
      sets.push("flight_hours = ?");
      params.push(Math.round((finalHe - finalHs) * 100) / 100);
    }
    if (hs !== null) {
      sets.push("hobbs_start = ?");
      params.push(hs);
    }
    if (he !== null) {
      sets.push("hobbs_end = ?");
      params.push(he);
    }
  }
  if (fuelUsed !== undefined) {
    const f = Number(fuelUsed);
    if (Number.isNaN(f) || f < 0) return res.status(400).json({ error: "Invalid fuel used" });
    sets.push("fuel_used = ?");
    params.push(f);
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  params.push(id);
  db.prepare(`UPDATE reservations SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  const updated = db
    .prepare("SELECT * FROM reservations WHERE id = ?")
    .get(id) as ReservationRow;
  res.json(updated);
});

app.delete("/api/reservations/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM reservations WHERE id = ?").get(id) as
    | ReservationRow
    | undefined;
  if (!row) return res.status(404).json({ error: "Reservation not found" });
  db.prepare("DELETE FROM reservations WHERE id = ?").run(id);
  res.json({ ok: true });

  const invitees = safeParseJson<Invitee[]>(row.invitees, []);
  if (invitees.length > 0 && row.invite_status !== "skipped") {
    sendCancellation(row, invitees).catch((err) => {
      console.error("Cancellation send failed:", (err as Error).message);
    });
  }
});

/* ---------- Stats ---------- */

app.get("/api/stats", requireAuth, (req, res) => {
  const start = req.query.start;
  const end = req.query.end;
  const billTo = typeof req.query.billTo === "string" ? req.query.billTo : "";
  let rows = db
    .prepare(
      "SELECT * FROM reservations WHERE start_time >= ? AND start_time < ? ORDER BY start_time"
    )
    .all(String(start), String(end)) as ReservationRow[];

  const billToOptions = [
    ...new Set(rows.map((r) => r.bill_to || r.person || "Unknown")),
  ].sort();

  if (billTo) {
    rows = rows.filter((r) => (r.bill_to || r.person || "Unknown") === billTo);
  }

  const hoursFor = (r: ReservationRow): number =>
    r.hobbs_start != null && r.hobbs_end != null ? r.hobbs_end - r.hobbs_start : r.flight_hours || 0;
  const isLogged = (r: ReservationRow): boolean =>
    r.hobbs_start != null && r.hobbs_end != null && r.fuel_used != null;
  const withData = rows.filter(
    (r) => r.hobbs_start != null || r.hobbs_end != null || r.flight_hours != null || r.fuel_used != null
  );
  const totalHours = withData.reduce((s, r) => s + hoursFor(r), 0);
  const totalFuel = withData.reduce((s, r) => s + (r.fuel_used || 0), 0);
  const unlogged = rows.filter((r) => !isLogged(r)).length;

  interface BillToStats {
    flights: number;
    hours: number;
    fuel: number;
  }
  const byBillTo = new Map<string, BillToStats>();
  for (const r of withData) {
    const key = r.bill_to || r.person || "Unknown";
    const cur = byBillTo.get(key) || { flights: 0, hours: 0, fuel: 0 };
    cur.flights += 1;
    cur.hours += hoursFor(r);
    cur.fuel += r.fuel_used || 0;
    byBillTo.set(key, cur);
  }

  res.json({
    flights: withData.length,
    totalHours,
    totalFuel,
    avgFuelPerHour: totalHours > 0 ? totalFuel / totalHours : 0,
    unlogged,
    billToOptions,
    byBillTo: Array.from(byBillTo, ([name, v]) => ({ name, ...v })).sort(
      (a, b) => b.hours - a.hours
    ),
    inspection: inspectionStatus(),
  });
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`971BA scheduler listening on http://localhost:${PORT}`);
});
