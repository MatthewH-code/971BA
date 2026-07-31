import express from "express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  getSetting,
  setSetting,
  allReservations,
  reservationsInRange,
  reservationsStartingIn,
  getReservation,
  createReservation,
  updateReservation,
  deleteReservation,
  updateInviteStatus,
  latestHobbsEnd,
  allPilots,
  getPilot,
  getPilotByEmail,
  getPilotByEmailExcept,
  insertPilot,
  updatePilot,
  deletePilot,
} from "./db.js";
import { verify, isAuthenticated, setAuthCookie, clearAuthCookie, requireAuth } from "./auth.js";
import { getSmtp, smtpConfigured, sendInvite, sendCancellation, sendTestEmail } from "./mailer.js";
import type { Invitee, PilotRow, ReservationRow } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.join(__dirname, "..", "dist");

const app = express();
app.use(express.json());

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;

function ah(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    void fn(req, res).catch(next);
  };
}

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

async function overlaps(
  start: string,
  end: string,
  excludeId: number | null
): Promise<OverlapRow | undefined> {
  const rows = await allReservations();
  return rows.find((r) => r.id !== excludeId && r.start_time < end && start < r.end_time);
}

async function smtpPayload() {
  const s = await getSmtp();
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

async function inspectionStatus() {
  const [raw, date, cur] = await Promise.all([
    getSetting("inspection_hobbs"),
    getSetting("inspection_date"),
    latestHobbsEnd(),
  ]);
  const hobbs =
    raw !== null && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : null;
  return {
    hobbs,
    date,
    currentHobbs: cur,
    nextHobbs: hobbs != null ? hobbs + INSPECTION_INTERVAL : null,
    remainingHours: hobbs != null && cur != null ? hobbs + INSPECTION_INTERVAL - cur : null,
  };
}

/* ---------- Auth ---------- */

app.get("/api/me", (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (verify(String(password))) {
    setAuthCookie(res);
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "Incorrect password" });
});

app.post("/api/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

/* ---------- Settings ---------- */

app.get("/api/settings", requireAuth, ah(async (req, res) => {
  const pilots = await allPilots();
  res.json({ pilots, smtp: await smtpPayload() });
}));

app.post("/api/settings/pilots", requireAuth, ah(async (req, res) => {
  const { name, email } = req.body || {};
  const n = String(name || "").trim();
  const e = String(email || "").trim();
  if (!n || !isValidEmail(e)) {
    return res.status(400).json({ error: "A name and a valid email are required" });
  }
  const dup = await getPilotByEmail(e);
  if (dup) return res.status(409).json({ error: "A pilot with that email already exists" });
  const row = await insertPilot(n, e);
  res.status(201).json(row);
}));

app.patch("/api/settings/pilots/:id", requireAuth, ah(async (req, res) => {
  const id = Number(req.params.id);
  const row = await getPilot(id);
  if (!row) return res.status(404).json({ error: "Pilot not found" });

  const { name, email } = req.body || {};
  const n = name !== undefined ? String(name).trim() : row.name;
  const e = email !== undefined ? String(email).trim() : row.email;
  if (!n || !isValidEmail(e)) {
    return res.status(400).json({ error: "A name and a valid email are required" });
  }
  const dup = await getPilotByEmailExcept(e, id);
  if (dup) return res.status(409).json({ error: "A pilot with that email already exists" });

  const updated = await updatePilot(id, n, e);
  if (!updated) return res.status(404).json({ error: "Pilot not found" });
  res.json(updated);
}));

app.delete("/api/settings/pilots/:id", requireAuth, ah(async (req, res) => {
  const ok = await deletePilot(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Pilot not found" });
  res.json({ ok: true });
}));

app.patch("/api/settings/smtp", requireAuth, ah(async (req, res) => {
  const { host, port, secure, user, password, from } = req.body || {};
  if (host !== undefined) await setSetting("smtp_host", String(host).trim());
  if (port !== undefined) await setSetting("smtp_port", String(port));
  if (secure !== undefined) await setSetting("smtp_secure", secure ? "1" : "0");
  if (user !== undefined) await setSetting("smtp_user", String(user).trim());
  if (password) await setSetting("smtp_pass", password);
  if (from !== undefined) await setSetting("smtp_from", String(from).trim());
  res.json({ ok: true, smtp: await smtpPayload() });
}));

app.post("/api/settings/test-email", requireAuth, ah(async (req, res) => {
  const { to } = req.body || {};
  const smtp = await getSmtp();
  if (!smtpConfigured(smtp)) return res.status(400).json({ error: "Configure SMTP first" });
  if (!isValidEmail(String(to || ""))) return res.status(400).json({ error: "Enter a valid email" });
  try {
    await sendTestEmail({ to, smtp });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}));

/* ---------- 100-hour inspection ---------- */

app.get("/api/inspection", requireAuth, ah(async (req, res) => {
  res.json(await inspectionStatus());
}));

app.patch("/api/inspection", requireAuth, ah(async (req, res) => {
  const { hobbs, date } = req.body || {};
  if (hobbs !== undefined) {
    if (hobbs === "") {
      await setSetting("inspection_hobbs", "");
    } else {
      const h = Number(hobbs);
      if (Number.isNaN(h) || h < 0) {
        return res.status(400).json({ error: "Invalid Hobbs reading" });
      }
      await setSetting("inspection_hobbs", h);
    }
  }
  if (date !== undefined) {
    const d = String(date).trim();
    if (d && !isValidDate(d)) return res.status(400).json({ error: "Invalid date" });
    await setSetting("inspection_date", d);
  }
  res.json(await inspectionStatus());
}));

/* ---------- Reservations ---------- */

app.get("/api/reservations", requireAuth, ah(async (req, res) => {
  const start = req.query.start;
  const end = req.query.end;
  let rows: ReservationRow[];
  if (start && end) {
    rows = await reservationsInRange(String(start), String(end));
  } else {
    rows = await allReservations();
  }
  res.json(rows);
}));

app.get("/api/reservations/:id", requireAuth, ah(async (req, res) => {
  const row = await getReservation(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Reservation not found" });
  res.json(row);
}));

app.post("/api/reservations", requireAuth, ah(async (req, res) => {
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
  const conflict = await overlaps(start, end, null);
  if (conflict) {
    return res.status(409).json({
      error: `Time conflicts with "${conflict.title}" (${conflict.start_time} – ${conflict.end_time})`,
    });
  }

  const parsedInvitees = parseInvitees(invitees);
  const uid = crypto.randomUUID();
  const row = await createReservation({
    title: t,
    person: p,
    start_time: start,
    end_time: end,
    bill_to: p,
    uid,
    invitees: JSON.stringify(parsedInvitees),
  });
  res.status(201).json(row);

  if (parsedInvitees.length === 0) {
    await updateInviteStatus(row.id, "skipped");
    return;
  }
  sendInvite(row, parsedInvitees)
    .then((status) => updateInviteStatus(row.id, status))
    .catch((err) => {
      console.error("Invite send failed:", (err as Error).message);
      updateInviteStatus(row.id, "failed").catch(() => {});
    });
}));

app.patch("/api/reservations/:id", requireAuth, ah(async (req, res) => {
  const id = Number(req.params.id);
  const row = await getReservation(id);
  if (!row) return res.status(404).json({ error: "Reservation not found" });

  const { billTo, hobbsStart, hobbsEnd, fuelUsed } = req.body || {};
  const cols: Record<string, string | number> = {};

  if (billTo !== undefined) {
    const b = String(billTo).trim();
    if (!b) return res.status(400).json({ error: "Bill-to cannot be empty" });
    cols.bill_to = b;
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
      cols.flight_hours = Math.round((finalHe - finalHs) * 100) / 100;
    }
    if (hs !== null) cols.hobbs_start = hs;
    if (he !== null) cols.hobbs_end = he;
  }
  if (fuelUsed !== undefined) {
    const f = Number(fuelUsed);
    if (Number.isNaN(f) || f < 0) return res.status(400).json({ error: "Invalid fuel used" });
    cols.fuel_used = f;
  }
  if (Object.keys(cols).length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  const updated = await updateReservation(id, cols);
  if (!updated) return res.status(404).json({ error: "Reservation not found" });
  res.json(updated);
}));

app.delete("/api/reservations/:id", requireAuth, ah(async (req, res) => {
  const id = Number(req.params.id);
  const row = await getReservation(id);
  if (!row) return res.status(404).json({ error: "Reservation not found" });
  await deleteReservation(id);
  res.json({ ok: true });

  const invitees = safeParseJson<Invitee[]>(row.invitees, []);
  if (invitees.length > 0 && row.invite_status !== "skipped") {
    sendCancellation(row, invitees).catch((err) => {
      console.error("Cancellation send failed:", (err as Error).message);
    });
  }
}));

/* ---------- Stats ---------- */

app.get("/api/stats", requireAuth, ah(async (req, res) => {
  const start = req.query.start;
  const end = req.query.end;
  const billTo = typeof req.query.billTo === "string" ? req.query.billTo : "";
  let rows = await reservationsStartingIn(String(start), String(end));

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
    inspection: await inspectionStatus(),
  });
}));

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`971BA scheduler listening on http://localhost:${PORT}`);
  });
}

export default app;
