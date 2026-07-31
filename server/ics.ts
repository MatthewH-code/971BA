import type { Invitee, ReservationRow } from "./types.js";

function escapeText(s: string): string {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toIcsDate(isoLocal: string): string {
  return new Date(isoLocal).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function nowStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function fold(line: string): string {
  const max = 75;
  if (line.length <= max) return line;
  const lines: string[] = [];
  let rest = line;
  while (rest.length > max) {
    lines.push(rest.slice(0, max));
    rest = " " + rest.slice(max);
  }
  lines.push(rest);
  return lines.join("\r\n");
}

function attendeeLine(invitee: Invitee): string {
  const email = invitee.email;
  const name = invitee.name && invitee.name !== email ? invitee.name : "";
  const cn = name ? `;CN=${escapeText(name)}` : "";
  return `ATTENDEE${cn};PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${email}`;
}

interface BuildOptions {
  from: string;
}

export function buildInvite(rec: ReservationRow, invitees: Invitee[], { from }: BuildOptions): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//N971BA Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${rec.uid}`,
    `DTSTAMP:${nowStamp()}`,
    `DTSTART:${toIcsDate(rec.start_time)}`,
    `DTEND:${toIcsDate(rec.end_time)}`,
    "SEQUENCE:0",
    `SUMMARY:${escapeText(rec.title)}`,
    `DESCRIPTION:${escapeText(
      `Reserved by ${rec.person} for N971BA. Times are shown in your local timezone.`
    )}`,
    `ORGANIZER;CN=${escapeText("N971BA Scheduler")}:mailto:${from}`,
    ...invitees.map(attendeeLine),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n");
}

export function buildCancel(rec: ReservationRow, invitees: Invitee[], { from }: BuildOptions): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//N971BA Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:CANCEL",
    "BEGIN:VEVENT",
    `UID:${rec.uid}`,
    `DTSTAMP:${nowStamp()}`,
    `DTSTART:${toIcsDate(rec.start_time)}`,
    "SEQUENCE:1",
    `SUMMARY:${escapeText(rec.title)}`,
    "STATUS:CANCELLED",
    "TRANSP:TRANSPARENT",
    `ORGANIZER;CN=${escapeText("N971BA Scheduler")}:mailto:${from}`,
    ...invitees.map(attendeeLine),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n");
}
