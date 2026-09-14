export interface DashboardPerson {
  name: string;
  slug: string;
  template_type: 'adult' | 'teen' | 'young_adult';
  submission_id: string | null;
  submitted_at: string | null;
  started_at: string | null;
  last_touched: string | null;
  total_submissions: number;
}

export interface DashboardOverview {
  viewer_name: string;
  current_cycle_label: string;
  people: DashboardPerson[];
}

export interface PersonHistory {
  name: string;
  slug: string;
  template_type: 'adult' | 'teen' | 'young_adult';
  current_cycle_label: string;
  submissions: {
    id: string;
    cycle_label: string;
    started_at: string;
    submitted_at: string;
  }[];
}

export interface FullSubmission {
  id: string;
  name: string;
  slug: string;
  template_type: 'adult' | 'teen' | 'young_adult';
  cycle_label: string;
  started_at: string;
  submitted_at: string;
  payload: Record<string, unknown>;
}

const base = process.env.NEXT_PUBLIC_API_BASE_URL;

function apiUrl(path: string): string {
  if (!base) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is not set, so the parent view cannot reach its data.');
  }
  return `${base.replace(/\/$/, '')}${path}`;
}

async function read<T>(path: string): Promise<T | null> {
  const response = await fetch(apiUrl(path), { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`That could not be loaded (${response.status}).`);
  return (await response.json()) as T;
}

export function fetchOverview(token: string) {
  return read<DashboardOverview>(`/api/dashboard/${encodeURIComponent(token)}`);
}

export function fetchPerson(token: string, slug: string) {
  return read<PersonHistory>(
    `/api/dashboard/${encodeURIComponent(token)}/person/${encodeURIComponent(slug)}`,
  );
}

export function fetchSubmission(token: string, id: string) {
  return read<FullSubmission>(
    `/api/dashboard/${encodeURIComponent(token)}/submission/${encodeURIComponent(id)}`,
  );
}

/** Turns 2026-09 into "September 2026". Read back in UTC, see the worksheet. */
export function monthName(cycleLabel: string): string {
  const [year, month] = cycleLabel.split('-').map(Number);
  if (!year || !month) return cycleLabel;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** "14 September", for a day inside the current year. */
export function dayAndMonth(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long' }).format(new Date(iso));
}
