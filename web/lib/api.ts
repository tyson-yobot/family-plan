/**
 * Everything the browser asks the server for, and the one place the session
 * lives.
 *
 * Three kinds of request, and the differences between them are the privacy
 * model:
 *
 *   Board and gate requests carry a link token in the path. Holding a link into
 *   this house is all they need, because between them they return a name, a
 *   status and a date and nothing anybody wrote.
 *
 *   Family requests carry a session, and any of the five will do. They return
 *   everybody's shared goals: the commitment, not the reflection. Being signed
 *   in is required even though a goal is shared, because "shared with all five"
 *   is not the same as "readable by whoever is holding the link".
 *
 *   Space requests carry a session AND are refused unless that session belongs
 *   to the person the request is about. Answers, scores, written reflections and
 *   private goals only ever come back through these.
 */

export type TemplateName = 'adult' | 'teen' | 'young_adult';

export interface BoardPerson {
  name: string;
  slug: string;
  status: 'done' | 'started' | 'not_started';
  /** The date only. There is no time on this screen and no content anywhere in it. */
  finished_on: string | null;
  has_code: boolean;
}

export interface Board {
  current_cycle_label: string;
  days_left: number;
  family_streak: number;
  finished_count: number;
  people_count: number;
  people: BoardPerson[];
  link_person_slug: string | null;
}

export interface Gate {
  name: string;
  slug: string;
  template_type: TemplateName;
  has_code: boolean;
  locked_for_seconds: number;
}

export interface GoalStep {
  id: string;
  title: string;
  due_date: string | null;
  done: boolean;
  done_at: string | null;
}

export interface Goal {
  id: string;
  title: string;
  detail: string | null;
  life_area: string | null;
  horizon: 'ninety_day' | 'one_year' | 'three_year' | 'ten_year';
  parent_goal_id: string | null;
  target_number: string | null;
  target_unit: string | null;
  progress_number: string | null;
  weekly_habit: string | null;
  weekly_target_count: number | null;
  due_date: string | null;
  owner: string | null;
  status: 'open' | 'hit' | 'missed' | 'dropped';
  /** True when the owner has kept this one to themselves. */
  is_private: boolean;
  closed_note: string | null;
  progress_note: string | null;
  source: string;
  created_cycle_label: string;
  closed_cycle_label: string | null;
  created_at: string;
  closed_at: string | null;
  steps: GoalStep[];
}

export interface SharedGoal {
  id: string;
  person_slug: string;
  person_name: string;
  title: string;
  life_area: string | null;
  due_date: string | null;
  /** The timeframe. Shared; the parent goal it hangs off is not. */
  horizon: Goal['horizon'];
  status: Goal['status'];
  created_cycle_label: string;
  closed_cycle_label: string | null;
  /** Progress is a count of steps. The figures behind a goal are never shared. */
  steps_done: number;
  steps_total: number;
  cheers: { from_slug: string; from_name: string; reaction: string }[];
}

export interface FamilyGoals {
  viewer_slug: string;
  reactions: string[];
  people: { name: string; slug: string; goals: SharedGoal[] }[];
}

export interface Space {
  name: string;
  slug: string;
  template_type: TemplateName;
  current_cycle_label: string;
  days_left: number;
  submitted_this_cycle: { submitted_at: string } | null;
  started_this_cycle: boolean;
  own_streak: number;
  total_check_ins: number;
  goals: Goal[];
  /** Keyed by a longer goal's id. Absent where nothing is attached to it yet. */
  horizon_progress: Record<string, { done: number; total: number }>;
  /** Every area a goal can be filed under on this tier. Not the scored list. */
  goal_areas: { id: string; label: string }[];
}

export interface HabitDay {
  date: string;
  label: string;
  done: boolean;
  is_today: boolean;
  is_future: boolean;
}

export interface HabitWeek {
  goal_id: string;
  title: string;
  weekly_habit: string;
  weekly_target_count: number | null;
  days: HabitDay[];
  done_this_week: number;
  streak_weeks: number;
  days_since_last: number | null;
  nudge: string | null;
}

export interface CoachNote {
  id: string;
  body: string;
  cycle_label: string;
  created_at: string;
  suggested_step: string | null;
  suggested_goal_id: string | null;
  accepted: boolean;
}

export interface MoneyCategory {
  category: string;
  spent: number;
  cap: number | null;
  transaction_count: number;
  over_by: number | null;
  months_over: number;
}

export interface MoneyView {
  cycle_label: string;
  categories: MoneyCategory[];
  total_spent: number;
  worst: { category: string; over_by: number; months_over: number } | null;
  quarter: {
    label: string;
    target: number | null;
    baseline: number | null;
    spent_so_far: number;
    saved_so_far: number | null;
  };
  freshness: {
    connected: boolean;
    last_success_at: string | null;
    last_attempt_at: string | null;
    hours_old: number | null;
    stale: boolean;
    error: string | null;
  };
}

export interface MoneyGate {
  has_passphrase: boolean;
  minimum_length: number;
  locked_for_seconds: number;
  bank_connected: boolean;
}

export interface HistoryMonth {
  cycle_label: string;
  submitted_at: string;
  scores: Record<string, number | null>;
  my_area: { name: string | null; score: number | null } | null;
}

export interface History {
  name: string;
  template_type: TemplateName;
  months: HistoryMonth[];
  goals: Goal[];
}

export interface OpenGoal {
  id: string;
  title: string;
  due_date: string | null;
  created_cycle_label: string;
}

export interface FormInfo {
  name: string;
  slug: string;
  template_type: TemplateName;
  current_cycle_label: string;
  submitted_this_cycle: { id: string; submitted_at: string } | null;
  has_earlier_submissions: boolean;
  open_goals: OpenGoal[];
  my_area: string | null;
  last_initiative_note: string | null;
  note_to_self: string | null;
}

export interface GoalStatusEntry {
  goal_id: string;
  goal: string;
  status: 'Still working on it' | 'Hit it' | 'Missed it' | 'Changed my mind' | '';
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
    throw new Error('NEXT_PUBLIC_API_BASE_URL is not set, so this page cannot reach its data.');
  }
  return `${base.replace(/\/$/, '')}${path}`;
}

/**
 * Where the session is kept, and why here rather than in a cookie.
 *
 * The site and the API are on two different origins, which a cookie can be made
 * to cross but only by loosening SameSite on every request, and the set of
 * allowed origins here includes preview deployments that come and go. An
 * Authorization header is explicit: every private request carries it on
 * purpose, nothing carries it by accident, and a request that forgets it is
 * refused rather than quietly succeeding.
 *
 * The trade is that this is readable by script on this origin, where an
 * httpOnly cookie would not be. That is a real cost and worth naming. It is
 * accepted here because this app loads no third-party script at all, its
 * Content Security posture is "nothing external", and the alternative failed
 * more often in the place that matters, which is a shared phone.
 */
const SESSION_KEY = 'family-plan.session';

export interface StoredSession {
  token: string;
  slug: string;
  expires_at: string;
}

export function readSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.token || !parsed?.slug) return null;
    if (parsed.expires_at && new Date(parsed.expires_at) <= new Date()) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(session: StoredSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // A phone with storage turned off still works; it just asks for the code
    // again next time. Nothing here is worth failing the page over.
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Same reasoning as above.
  }
}

/** Thrown when the server says a code is needed, so a screen can show the gate. */
export class NeedsCodeError extends Error {
  constructor() {
    super('Enter your code to open this.');
    this.name = 'NeedsCodeError';
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.auth) {
    const session = readSession();
    if (!session) throw new NeedsCodeError();
    headers.authorization = `Bearer ${session.token}`;
  }

  const response = await fetch(apiUrl(path), {
    method: options.method ?? 'GET',
    cache: 'no-store',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  /*
   * A 401 only means "your session has gone" on a request that CARRIED one.
   *
   * Signing in answers 401 for a wrong code, and the first version of this
   * treated that the same way: it threw the session away and replaced the
   * server's message with "Enter your code to open this." Three things followed
   * and all three were visible on screen. Every wrong code said the wrong
   * thing. The lockout countdown never appeared, because locked_for_seconds was
   * discarded with the body, so after five wrong tries the button stayed
   * cheerfully enabled and nothing explained the silence. And on a shared phone
   * one person mistyping their own code signed the other one out.
   */
  if (response.status === 401 && options.auth) {
    clearSession();
    throw new NeedsCodeError();
  }

  const parsed = (await response.json().catch(() => null)) as
    | (T & { error?: string; locked_for_seconds?: number })
    | null;

  if (!response.ok) {
    const error = new Error(parsed?.error ?? 'That did not work just now.') as Error & {
      lockedForSeconds?: number;
      status?: number;
    };
    error.lockedForSeconds = parsed?.locked_for_seconds;
    error.status = response.status;
    throw error;
  }
  return parsed as T;
}

// --- the shared link -------------------------------------------------------

export async function fetchLink(
  token: string,
): Promise<{ kind: 'house' | 'person'; slug?: string } | null> {
  try {
    return await request(`/api/link/${encodeURIComponent(token)}`);
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
}

export async function fetchBoard(token: string): Promise<Board | null> {
  try {
    return await request(`/api/board/${encodeURIComponent(token)}`);
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
}

// --- the gate --------------------------------------------------------------

export async function fetchGate(token: string, slug: string): Promise<Gate | null> {
  try {
    return await request(`/api/gate/${encodeURIComponent(token)}/${encodeURIComponent(slug)}`);
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
}

async function gateAndStore(
  path: string,
  slug: string,
  code: string,
): Promise<void> {
  const result = await request<{ session_token: string; expires_at: string }>(path, {
    method: 'POST',
    body: { code },
  });
  writeSession({ token: result.session_token, slug, expires_at: result.expires_at });
}

export async function setCode(token: string, slug: string, code: string): Promise<void> {
  await gateAndStore(
    `/api/gate/${encodeURIComponent(token)}/${encodeURIComponent(slug)}/set-code`,
    slug,
    code,
  );
}

export async function signIn(token: string, slug: string, code: string): Promise<void> {
  await gateAndStore(
    `/api/gate/${encodeURIComponent(token)}/${encodeURIComponent(slug)}/signin`,
    slug,
    code,
  );
}

export async function signOut(): Promise<void> {
  const session = readSession();
  clearSession();
  if (!session) return;
  try {
    await fetch(apiUrl('/api/space/signout'), {
      method: 'POST',
      headers: { authorization: `Bearer ${session.token}` },
    });
  } catch {
    // The token is already gone from this phone, which is the part that matters
    // to whoever pressed the button. The row expires on its own.
  }
}

// --- somebody's own space --------------------------------------------------

export async function fetchFamilyGoals(): Promise<FamilyGoals> {
  return request('/api/family/goals', { auth: true });
}

export async function sendCheer(
  goalId: string,
  reaction: string,
): Promise<{ reaction: string | null }> {
  return request(`/api/family/goals/${encodeURIComponent(goalId)}/cheer`, {
    method: 'POST',
    body: { reaction },
    auth: true,
  });
}

export async function fetchMyCheers(
  slug: string,
): Promise<{ cheers: { goal_id: string; reaction: string; from_name: string; from_slug: string }[] }> {
  return request(`/api/family/cheers/${encodeURIComponent(slug)}`, { auth: true });
}

export async function fetchSpace(slug: string): Promise<Space> {
  return request(`/api/space/${encodeURIComponent(slug)}`, { auth: true });
}

export async function fetchHistory(slug: string): Promise<History> {
  return request(`/api/space/${encodeURIComponent(slug)}/history`, { auth: true });
}

export async function addGoal(
  slug: string,
  goal: {
    title: string;
    due_date?: string | null;
    life_area?: string | null;
    first_step?: string | null;
    is_private?: boolean;
    horizon?: Goal['horizon'];
    parent_goal_id?: string | null;
    weekly_habit?: string | null;
    weekly_target_count?: number | null;
  },
): Promise<{ goal: Goal }> {
  return request(`/api/space/${encodeURIComponent(slug)}/goals`, {
    method: 'POST',
    body: goal,
    auth: true,
  });
}

export async function editGoal(
  slug: string,
  goalId: string,
  patch: Partial<{
    title: string;
    due_date: string | null;
    life_area: string | null;
    detail: string | null;
    status: Goal['status'];
    closed_note: string | null;
    is_private: boolean;
    horizon: Goal['horizon'];
    parent_goal_id: string | null;
    weekly_habit: string | null;
    weekly_target_count: number | null;
  }>,
): Promise<{ goal: Goal }> {
  return request(`/api/space/${encodeURIComponent(slug)}/goals/${encodeURIComponent(goalId)}`, {
    method: 'PATCH',
    body: patch,
    auth: true,
  });
}

export async function addStep(
  slug: string,
  goalId: string,
  step: { title: string; due_date?: string | null },
): Promise<{ goal: Goal }> {
  return request(
    `/api/space/${encodeURIComponent(slug)}/goals/${encodeURIComponent(goalId)}/steps`,
    { method: 'POST', body: step, auth: true },
  );
}

export async function editStep(
  slug: string,
  goalId: string,
  stepId: string,
  patch: Partial<{ title: string; due_date: string | null; done: boolean }>,
): Promise<{ goal: Goal }> {
  return request(
    `/api/space/${encodeURIComponent(slug)}/goals/${encodeURIComponent(goalId)}/steps/${encodeURIComponent(stepId)}`,
    { method: 'PATCH', body: patch, auth: true },
  );
}

export async function resetSomebodysCode(slug: string, targetSlug: string): Promise<{ name: string }> {
  return request(`/api/space/${encodeURIComponent(slug)}/reset-code`, {
    method: 'POST',
    body: { slug: targetSlug },
    auth: true,
  });
}

// --- the check-in ----------------------------------------------------------

export async function fetchForm(slug: string): Promise<FormInfo> {
  return request(`/api/space/${encodeURIComponent(slug)}/form`, { auth: true });
}

export async function fetchDraft(slug: string): Promise<StoredDraft | null> {
  return request(`/api/space/${encodeURIComponent(slug)}/draft`, { auth: true });
}

export async function saveDraft(
  slug: string,
  draft: { payload: Record<string, unknown>; started_at: string },
): Promise<void> {
  await request(`/api/space/${encodeURIComponent(slug)}/draft`, {
    method: 'PUT',
    body: draft,
    auth: true,
  });
}

export async function submitCheckIn(
  slug: string,
  body: { payload: Record<string, unknown>; started_at: string },
): Promise<{ submitted_at: string; created_goals: { id: string; title: string }[] }> {
  return request(`/api/space/${encodeURIComponent(slug)}/submit`, {
    method: 'POST',
    body,
    auth: true,
  });
}

// --- the weekly drumbeat ---------------------------------------------------

export async function fetchWeek(slug: string): Promise<{ habits: HabitWeek[] }> {
  return request(`/api/space/${encodeURIComponent(slug)}/week`, { auth: true });
}

export async function toggleHabit(
  slug: string,
  goalId: string,
  date: string,
): Promise<{ done: boolean; habits: HabitWeek[] }> {
  return request(
    `/api/space/${encodeURIComponent(slug)}/goals/${encodeURIComponent(goalId)}/habit`,
    { method: 'POST', body: { date }, auth: true },
  );
}

// --- the private note ------------------------------------------------------

export async function fetchCoachNote(
  slug: string,
): Promise<{ note: CoachNote | null; configured: boolean }> {
  return request(`/api/space/${encodeURIComponent(slug)}/coach`, { auth: true });
}

export async function acceptCoachStep(slug: string, noteId: string): Promise<{ goals: Goal[] }> {
  return request(
    `/api/space/${encodeURIComponent(slug)}/coach/${encodeURIComponent(noteId)}/accept`,
    { method: 'POST', auth: true },
  );
}

export async function dismissCoachStep(slug: string, noteId: string): Promise<void> {
  await request(
    `/api/space/${encodeURIComponent(slug)}/coach/${encodeURIComponent(noteId)}/dismiss`,
    { method: 'POST', auth: true },
  );
}

// --- the money area, adults only -------------------------------------------

/**
 * The money session is kept SEPARATELY from the ordinary one, in sessionStorage
 * rather than localStorage, and the difference is deliberate.
 *
 * sessionStorage dies with the tab. An ordinary session is meant to survive a
 * phone being put down for a fortnight; a money session is meant not to. Even
 * inside its fifteen minutes, closing the tab should end it, because the thing
 * being guarded is a household's bank history on a shared phone.
 */
const MONEY_KEY = 'family-plan.money';

export function readMoneySession(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(MONEY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token: string; expires_at: string };
    if (!parsed?.token) return null;
    if (parsed.expires_at && new Date(parsed.expires_at) <= new Date()) {
      window.sessionStorage.removeItem(MONEY_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

function writeMoneySession(token: string, expiresAt: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(MONEY_KEY, JSON.stringify({ token, expires_at: expiresAt }));
  } catch {
    // Same reasoning as the ordinary session: a phone with storage off still
    // works, it just asks for the passphrase again.
  }
}

export function clearMoneySession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(MONEY_KEY);
  } catch {
    // Nothing worth failing a page over.
  }
}

/** Thrown when the money passphrase is needed, so the screen can show its gate. */
export class NeedsPassphraseError extends Error {
  constructor() {
    super('Enter your money passphrase.');
    this.name = 'NeedsPassphraseError';
  }
}

/**
 * A money request carries BOTH secrets: the ordinary session in Authorization
 * and the money session in its own header. Either one missing is a refusal.
 */
async function moneyRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const session = readSession();
  if (!session) throw new NeedsCodeError();
  const money = readMoneySession();
  if (!money) throw new NeedsPassphraseError();

  const headers: Record<string, string> = {
    authorization: `Bearer ${session.token}`,
    'x-money-session': money,
  };
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(apiUrl(path), {
    method: options.method ?? 'GET',
    cache: 'no-store',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const parsed = (await response.json().catch(() => null)) as
    | (T & { error?: string; code?: string })
    | null;

  if (response.status === 401) {
    if (parsed?.code === 'passphrase_required') {
      clearMoneySession();
      throw new NeedsPassphraseError();
    }
    clearSession();
    throw new NeedsCodeError();
  }
  if (!response.ok) {
    throw new Error(parsed?.error ?? 'That did not work just now.');
  }
  return parsed as T;
}

export async function fetchMoneyGate(): Promise<MoneyGate> {
  return request('/api/money/gate', { auth: true });
}

export async function setMoneyPassphrase(passphrase: string): Promise<void> {
  await request('/api/money/passphrase', { method: 'POST', body: { passphrase }, auth: true });
}

export async function unlockMoney(passphrase: string): Promise<void> {
  const result = await request<{ money_session: string; expires_at: string }>('/api/money/unlock', {
    method: 'POST',
    body: { passphrase },
    auth: true,
  });
  writeMoneySession(result.money_session, result.expires_at);
}

export async function lockMoney(): Promise<void> {
  const money = readMoneySession();
  clearMoneySession();
  const session = readSession();
  if (!money || !session) return;
  try {
    await fetch(apiUrl('/api/money/lock'), {
      method: 'POST',
      headers: { authorization: `Bearer ${session.token}`, 'x-money-session': money },
    });
  } catch {
    // Already gone from this phone, which is what matters here. The row expires.
  }
}

export async function fetchMoney(): Promise<MoneyView> {
  return moneyRequest('/api/money');
}

export async function setCap(category: string, monthlyCap: number | null): Promise<void> {
  await moneyRequest('/api/money/caps', {
    method: 'PUT',
    body: { category, monthly_cap: monthlyCap },
  });
}

export async function setQuarterTarget(
  targetAmount: number,
  baselineAmount: number | null,
): Promise<void> {
  await moneyRequest('/api/money/target', {
    method: 'PUT',
    body: { target_amount: targetAmount, baseline_amount: baselineAmount },
  });
}

export async function addCategoryRule(matchText: string, category: string): Promise<void> {
  await moneyRequest('/api/money/rules', {
    method: 'POST',
    body: { match_text: matchText, category },
  });
}

export async function refreshMoney(): Promise<{
  ok: boolean;
  error: string | null;
  view: MoneyView;
}> {
  return moneyRequest('/api/money/refresh', { method: 'POST' });
}
