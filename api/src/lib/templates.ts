/**
 * The canonical field shape of each worksheet, used for server-side validation.
 *
 * The on-screen wording lives in web/lib/worksheets.ts. Only the ids and the
 * required-field rules live here, and the two lists must stay in step. The repo
 * root script `npm run check:worksheet-ids` compares them, and runs as web's
 * prebuild, so a drift fails the web deploy. It does not gate this one: a
 * change made here alone still reaches production unchecked, which is a real
 * gap rather than a covered path.
 */

export type TemplateName = 'adult' | 'teen' | 'young_adult';

export interface AreaSpec {
  id: string;
  label: string;
}

export interface TemplateSpec {
  /** Scored life areas, all of which require a score and a reason. */
  areas: AreaSpec[];
  /** Inclusive score range for every area on this template. */
  scoreMin: number;
  scoreMax: number;
  /** Teen and young-adult worksheets have a self-defined "my area"; adults do not. */
  hasMyArea: boolean;
  /** Inclusive score range for the "my area" score, where one exists. */
  myAreaScoreMin: number;
  myAreaScoreMax: number;
  /** Adults set exactly three goals; the other two templates set one, optionally. */
  requiresThreeGoals: boolean;
  /** Teen and young-adult worksheets require a chores rating. */
  requiresChoresRating: boolean;
  /** Number of numbered sections, used by the progress indicator. */
  sectionCount: number;
}

export const ADULT_AREAS: AreaSpec[] = [
  { id: 'health_energy', label: 'Health and energy' },
  { id: 'fitness_movement', label: 'Fitness and movement' },
  { id: 'money_security', label: 'Money and security' },
  { id: 'work_business', label: 'Work and business' },
  { id: 'growth_learning', label: 'Personal growth and learning' },
  { id: 'mind_emotional', label: 'Mind and emotional health' },
  { id: 'home', label: 'Home and where I live' },
  { id: 'fun_travel_rest', label: 'Fun, travel, and rest' },
  { id: 'faith_meaning', label: 'Faith and meaning' },
  { id: 'friendships_community', label: 'Friendships and community' },
  { id: 'creative_work', label: 'Creative work and expression' },
];

export const TEEN_AREAS: AreaSpec[] = [
  { id: 'school', label: 'School' },
  { id: 'friendships', label: 'Friendships' },
  { id: 'chores_responsibility', label: 'Chores and responsibility' },
  { id: 'self_feeling', label: 'How I feel about myself' },
  { id: 'fun_free_time', label: 'Fun and free time' },
];

export const YOUNG_ADULT_AREAS: AreaSpec[] = [
  { id: 'direction_purpose', label: 'Direction and purpose' },
  { id: 'work_income', label: 'Work or income' },
  { id: 'responsibility_home', label: 'Responsibility at home' },
  { id: 'money', label: 'Money' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'self_feeling', label: 'How I feel about myself' },
];

export const TEMPLATES: Record<TemplateName, TemplateSpec> = {
  adult: {
    areas: ADULT_AREAS,
    scoreMin: 1,
    scoreMax: 10,
    hasMyArea: false,
    myAreaScoreMin: 0,
    myAreaScoreMax: 0,
    requiresThreeGoals: true,
    requiresChoresRating: false,
    sectionCount: 6,
  },
  teen: {
    areas: TEEN_AREAS,
    scoreMin: 1,
    scoreMax: 5,
    hasMyArea: true,
    myAreaScoreMin: 1,
    myAreaScoreMax: 5,
    requiresThreeGoals: false,
    requiresChoresRating: true,
    sectionCount: 4,
  },
  young_adult: {
    areas: YOUNG_ADULT_AREAS,
    scoreMin: 1,
    scoreMax: 10,
    hasMyArea: true,
    myAreaScoreMin: 1,
    myAreaScoreMax: 5,
    requiresThreeGoals: false,
    requiresChoresRating: true,
    sectionCount: 4,
  },
};

export const GOAL_STATUSES = ['Done', 'Partly', 'Not yet'] as const;
export const CHORES_RATINGS = ['Great', 'OK', 'Rough'] as const;

export type GoalStatus = (typeof GOAL_STATUSES)[number];
export type ChoresRating = (typeof CHORES_RATINGS)[number];
