export interface PilotRow {
  id: number;
  name: string;
  email: string;
}

export interface ReservationRow {
  id: number;
  title: string;
  person: string;
  start_time: string;
  end_time: string;
  bill_to: string;
  flight_hours: number | null;
  hobbs_start: number | null;
  hobbs_end: number | null;
  fuel_used: number | null;
  created_at: string;
  uid: string | null;
  invitees: string | null;
  invite_status: string | null;
}

export interface Invitee {
  name: string;
  email: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}
