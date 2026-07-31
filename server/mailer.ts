import nodemailer from "nodemailer";
import { getSetting } from "./db.js";
import { buildInvite, buildCancel } from "./ics.js";
import type { Invitee, ReservationRow, SmtpConfig } from "./types.js";

export function getSmtp(): SmtpConfig {
  return {
    host: getSetting("smtp_host") || "",
    port: Number(getSetting("smtp_port") || 587),
    secure: getSetting("smtp_secure") === "1",
    user: getSetting("smtp_user") || "",
    pass: getSetting("smtp_pass") || "",
    from: getSetting("smtp_from") || "",
  };
}

export function smtpConfigured(smtp: SmtpConfig): boolean {
  return Boolean(smtp && smtp.host && smtp.from);
}

function makeTransporter(smtp: SmtpConfig) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass } } : {}),
  });
}

interface IcsMailInput {
  smtp: SmtpConfig;
  to: string[];
  subject: string;
  text: string;
  ics: string;
  method: "REQUEST" | "CANCEL";
}

async function sendIcsMail({ smtp, to, subject, text, ics, method }: IcsMailInput): Promise<void> {
  const transporter = makeTransporter(smtp);
  await transporter.sendMail({
    from: smtp.from,
    to: to.join(", "),
    subject,
    text,
    icalEvent: { filename: "invite.ics", method, content: ics },
  });
}

export async function sendInvite(rec: ReservationRow, invitees: Invitee[]): Promise<string> {
  const smtp = getSmtp();
  if (!smtpConfigured(smtp)) return "not_configured";
  const ics = buildInvite(rec, invitees, { from: smtp.from });
  await sendIcsMail({
    smtp,
    to: invitees.map((i) => i.email),
    subject: `N971BA: ${rec.title}`,
    text: `You have been invited to a reservation on N971BA.\n\nTitle: ${rec.title}\nReserved by: ${rec.person}\nStart: ${rec.start_time}\nEnd: ${rec.end_time}\n\nA calendar invite is attached.`,
    ics,
    method: "REQUEST",
  });
  return "sent";
}

export async function sendCancellation(rec: ReservationRow, invitees: Invitee[]): Promise<string> {
  const smtp = getSmtp();
  if (!smtpConfigured(smtp)) return "not_configured";
  const ics = buildCancel(rec, invitees, { from: smtp.from });
  await sendIcsMail({
    smtp,
    to: invitees.map((i) => i.email),
    subject: `Cancelled: ${rec.title} (N971BA)`,
    text: `The following reservation on N971BA has been cancelled:\n\nTitle: ${rec.title}\nReserved by: ${rec.person}\nStart: ${rec.start_time}\nEnd: ${rec.end_time}`,
    ics,
    method: "CANCEL",
  });
  return "cancelled";
}

export async function sendTestEmail({ to, smtp }: { to: string; smtp: SmtpConfig }): Promise<void> {
  const transporter = makeTransporter(smtp);
  await transporter.sendMail({
    from: smtp.from,
    to,
    subject: "N971BA Scheduler - SMTP test",
    text: "If you're reading this, your SMTP settings are working.",
  });
}
