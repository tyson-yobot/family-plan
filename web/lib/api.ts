export interface FormInfo {
  name: string;
  slug: string;
  template_type: 'adult' | 'teen' | 'young_adult';
  current_cycle_label: string;
  /** Set when this month is already finished, so it is not offered blank again. */
  submitted_this_cycle: { id: string; submitted_at: string } | null;
  /** Whether they have ever finished one, which is not the same question. */
  has_earlier_submissions: boolean;
  previous_goals: string[];
  my_area: string | null;
  last_cycle_status: GoalStatusEntry[] | null;
  last_initiative_note: string | null;
  note_to_self: string | null;
}

export interface GoalStatusEntry {
  goal: string;
  status: 'Done' | 'Partly' | 'Not yet' | '';
  reflection?: string;
}

export interface StoredDraft {
  cycle_label: string;
  payload: Record<string, unknown>;
  started_at: string;
}

const base = process.env.NEXT_PUBLIC_API_BASE_URL;

function apiUrl(path: string): string {
  if (!base) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is not set, so the worksheet cannot reach its data.');
  }
  return `${base.replace(/\/$/, '')}${path}`;
}

export async function fetchForm(token: string): Promise<FormInfo | null> {
  const response = await fetch(apiUrl(`/api/form/${encodeURIComponent(token)}`), {
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`The worksheet could not be loaded (${response.status}).`);
  return (await response.json()) as FormInfo;
}

export async function fetchDraft(token: string): Promise<StoredDraft | null> {
  const response = await fetch(apiUrl(`/api/form/${encodeURIComponent(token)}/draft`), {
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Your saved answers could not be loaded (${response.status}).`);
  const body = (await response.json()) as StoredDraft | null;
  return body;
}

export async function saveDraft(
  token: string,
  draft: { cycle_label: string; payload: Record<string, unknown>; started_at: string },
): Promise<void> {
  const response = await fetch(apiUrl(`/api/form/${encodeURIComponent(token)}/draft`), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(draft),
  });
  if (!response.ok) throw new Error('Your answers could not be saved just now.');
}

export async function submitWorksheet(
  token: string,
  body: { cycle_label: string; payload: Record<string, unknown>; started_at: string },
): Promise<{ ok: true; submitted_at: string }> {
  const response = await fetch(apiUrl(`/api/form/${encodeURIComponent(token)}/submit`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json().catch(() => null)) as
    | { ok?: true; submitted_at?: string; error?: string }
    | null;
  if (!response.ok) {
    throw new Error(parsed?.error ?? 'The worksheet could not be submitted just now.');
  }
  return { ok: true, submitted_at: parsed?.submitted_at ?? new Date().toISOString() };
}
