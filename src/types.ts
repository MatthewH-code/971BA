export interface Pilot {
  id: number;
  name: string;
  email: string;
}

export interface Reservation {
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

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  hasPassword: boolean;
  configured: boolean;
}

export interface Inspection {
  hobbs: number | null;
  date: string | null;
  currentHobbs: number | null;
  nextHobbs: number | null;
  remainingHours: number | null;
}

export interface StatsByBillTo {
  name: string;
  flights: number;
  hours: number;
  fuel: number;
}

export interface Stats {
  flights: number;
  totalHours: number;
  totalFuel: number;
  avgFuelPerHour: number;
  unlogged: number;
  billToOptions: string[];
  byBillTo: StatsByBillTo[];
  inspection: Inspection;
}
