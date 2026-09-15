'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchMoney,
  fetchMoneyGate,
  lockMoney,
  NeedsCodeError,
  NeedsPassphraseError,
  readMoneySession,
  refreshMoney,
  setCap,
  setMoneyPassphrase,
  setQuarterTarget,
  unlockMoney,
  type MoneyGate,
  type MoneyView,
} from '@/lib/api';
import { monthName } from '@/lib/month';
import { Icon } from './icons';

/**
 * The money area. Adults only, behind its own longer passphrase.
 *
 * This component is never rendered for a child: PersonSpace does not offer the
 * tab unless the template type is adult, and every route behind it answers a
 * child's session with a plain not-found. The area is absent rather than
 * hidden, which is the difference between a child not seeing it and a child
 * seeing a locked door with the household's bank behind it.
 *
 * Nothing here can move money. SimpleFIN is read-only by protocol and there is
 * no endpoint on the other side of any of these calls that could.
 */
export function MoneyArea({ onNeedsCode }: { onNeedsCode: () => void }) {
  const [gate, setGate] = useState<MoneyGate | null>(null);
  const [view, setView] = useState<MoneyView | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [problem, setProblem] = useState('');

  const loadGate = useCallback(async () => {
    try {
      setGate(await fetchMoneyGate());
    } catch (error) {
      if (error instanceof NeedsCodeError) {
        onNeedsCode();
        return;
      }
      setProblem(error instanceof Error ? error.message : 'That did not load.');
    }
  }, [onNeedsCode]);

  const loadView = useCallback(async () => {
    try {
      setView(await fetchMoney());
      setUnlocked(true);
    } catch (error) {
      if (error instanceof NeedsPassphraseError) {
        setUnlocked(false);
        return;
      }
      if (error instanceof NeedsCodeError) {
        onNeedsCode();
        return;
      }
      setProblem(error instanceof Error ? error.message : 'That did not load.');
    }
  }, [onNeedsCode]);

  useEffect(() => {
    void loadGate();
    // A money session may already be live from earlier in this tab.
    if (readMoneySession()) void loadView();
  }, [loadGate, loadView]);

  if (!gate) {
    return <p className="mt-6 text-[15px] text-[var(--ink-soft)]">One moment.</p>;
  }

  if (!unlocked) {
    return (
      <PassphraseGate
        gate={gate}
        onOpened={async () => {
          await loadGate();
          await loadView();
        }}
      />
    );
  }

  return (
    <MoneyScreen
      view={view}
      onLock={async () => {
        await lockMoney();
        setUnlocked(false);
        setView(null);
      }}
      onReload={loadView}
      problem={problem}
    />
  );
}

/**
 * The second door.
 *
 * Says plainly why it exists rather than just demanding a secret. Somebody who
 * has already typed their four-digit code and is then asked for something else
 * will otherwise read it as the app being broken.
 */
function PassphraseGate({ gate, onOpened }: { gate: MoneyGate; onOpened: () => Promise<void> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const setting = !gate.has_passphrase;

  const submit = async () => {
    setBusy(true);
    setProblem('');
    try {
      if (setting) {
        await setMoneyPassphrase(value);
      }
      await unlockMoney(value);
      setValue('');
      await onOpened();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <div className="flex items-center gap-2">
        <Icon name="lock" size={16} />
        <p className="kicker text-[11.5px]">
          {setting ? 'Set your money passphrase' : 'Money is behind a second lock'}
        </p>
      </div>

      <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-soft)]">
        {setting
          ? `Your four-digit code is fine for your goals. It is not enough for the bank, so the money area has a longer passphrase of its own, at least ${gate.minimum_length} characters. A short sentence you will remember works best.`
          : 'Your four-digit code opens your goals. The bank needs the longer passphrase you set.'}
      </p>

      {/*
        Deliberately says "the other adult" rather than naming one.
        This line named Danyell, which reads correctly to Tyson and absurdly to
        Danyell, who would be told she sets her own passphrase separately from
        herself. Found by opening the screen as somebody who was not Tyson. A
        name here would have to come from the server anyway, and the sentence
        does not need one.
      */}
      {setting ? (
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-soft)]">
          The other adult sets their own, separately. Either passphrase opens the same shared
          view, because it is the household&rsquo;s money and you are both looking at the same
          picture.
        </p>
      ) : null}

      {gate.locked_for_seconds > 0 ? (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--bad)' }}>
          Too many wrong tries. Try again in about{' '}
          {Math.ceil(gate.locked_for_seconds / 60)} minutes.
        </p>
      ) : (
        <>
          <input
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && value.length > 0 && !busy) void submit();
            }}
            autoComplete={setting ? 'new-password' : 'current-password'}
            placeholder="Your money passphrase"
            className="mt-4 min-h-[48px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-[16px]"
          />
          <button
            type="button"
            disabled={busy || value.length === 0}
            onClick={() => void submit()}
            className="mt-3 min-h-[48px] w-full rounded-xl px-4 text-[15px] font-bold disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {busy ? 'One moment' : setting ? 'Set it and open' : 'Open the money area'}
          </button>
        </>
      )}

      {problem ? <p className="mt-3 text-[13px]" style={{ color: 'var(--bad)' }}>{problem}</p> : null}

      <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--ink-soft)]">
        This part closes itself after about fifteen minutes, and when you close the tab.
        The children cannot see any of it.
      </p>

      {!gate.bank_connected ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--ink-soft)]">
          The bank is not connected yet, so the figures will be empty until it is.
        </p>
      ) : null}
    </div>
  );
}

/** How old the figures are, in words rather than a timestamp. */
function freshnessLine(view: MoneyView): string {
  const { freshness } = view;
  if (!freshness.connected) {
    return 'The bank is not connected yet, so there is nothing to show here.';
  }
  if (freshness.hours_old === null) {
    return 'The bank has not been read successfully yet.';
  }
  if (freshness.hours_old < 2) return 'Up to date as of the last hour.';
  if (freshness.hours_old < 24) return `As of about ${freshness.hours_old} hours ago.`;
  const days = Math.floor(freshness.hours_old / 24);
  return `As of about ${days} ${days === 1 ? 'day' : 'days'} ago.`;
}

function money(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function MoneyScreen({
  view,
  onLock,
  onReload,
  problem,
}: {
  view: MoneyView | null;
  onLock: () => Promise<void>;
  onReload: () => Promise<void>;
  problem: string;
}) {
  const [busy, setBusy] = useState(false);
  const [refreshProblem, setRefreshProblem] = useState('');

  if (!view) return <p className="mt-6 text-[15px] text-[var(--ink-soft)]">One moment.</p>;

  const refresh = async () => {
    setBusy(true);
    setRefreshProblem('');
    try {
      const result = await refreshMoney();
      if (!result.ok && result.error) setRefreshProblem(result.error);
      await onReload();
    } catch (error) {
      setRefreshProblem(error instanceof Error ? error.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      {/*
        Freshness first, above every figure on the screen.
        A number with no age on it reads as current, and these numbers are
        pulled a few times a day. Putting the age underneath the figures would
        mean somebody makes a decision before they reach it.
      */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="kicker text-[11.5px] text-[var(--ink-soft)]">
              {monthName(view.cycle_label)} so far
            </p>
            <p className="mt-1 text-[28px] font-bold leading-none">{money(view.total_spent)}</p>
          </div>
          <button
            type="button"
            onClick={() => void onLock()}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink-soft)]"
          >
            <Icon name="lock" size={14} />
            Lock
          </button>
        </div>

        <p
          className="mt-3 text-[13px] leading-relaxed"
          style={{ color: view.freshness.stale ? 'var(--bad)' : 'var(--ink-soft)' }}
        >
          {freshnessLine(view)}
          {view.freshness.stale && view.freshness.connected
            ? ' That is older than it should be, so treat these as last known rather than current.'
            : ''}
        </p>

        {view.freshness.error ? (
          <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--ink-soft)]">
            Last try did not work: {view.freshness.error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="mt-3 min-h-[44px] w-full rounded-xl border border-[var(--line)] px-4 text-[14px] font-semibold disabled:opacity-60"
        >
          {busy ? 'Reading the bank' : 'Read the bank now'}
        </button>
        {refreshProblem ? (
          <p className="mt-2 text-[13px]" style={{ color: 'var(--bad)' }}>{refreshProblem}</p>
        ) : null}
      </div>

      {/*
        The one thing costing them most against its cap.
        Named outright rather than left for somebody to find by reading a table,
        because the whole point of the screen is that nobody has time to read a
        table every month.
      */}
      {view.worst ? (
        <div
          className="rounded-2xl border p-4"
          style={{ borderColor: 'var(--bad)', background: 'var(--surface-2)' }}
        >
          <p className="kicker text-[11.5px]" style={{ color: 'var(--bad)' }}>
            The one to look at
          </p>
          <p className="mt-2 text-[15px] leading-relaxed">
            <strong>{view.worst.category}</strong> is {money(view.worst.over_by)} over what you
            set.
            {view.worst.months_over > 1
              ? ` That is ${view.worst.months_over} months running now.`
              : ' First month over.'}
          </p>
        </div>
      ) : view.categories.length > 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
          <p className="text-[14px] leading-relaxed text-[var(--ink-soft)]">
            Nothing is over its cap this month.
          </p>
        </div>
      ) : null}

      <QuarterTarget view={view} onSaved={onReload} />

      <CategoryList view={view} onSaved={onReload} />

      {problem ? <p className="text-[13px]" style={{ color: 'var(--bad)' }}>{problem}</p> : null}
    </div>
  );
}

function QuarterTarget({ view, onSaved }: { view: MoneyView; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(view.quarter.target?.toString() ?? '');
  const [baseline, setBaseline] = useState(view.quarter.baseline?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const save = async () => {
    setBusy(true);
    setProblem('');
    try {
      await setQuarterTarget(Number(target), baseline === '' ? null : Number(baseline));
      setEditing(false);
      await onSaved();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  };

  const saved = view.quarter.saved_so_far;
  const goal = view.quarter.target;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <p className="kicker text-[11.5px] text-[var(--ink-soft)]">
        {view.quarter.label.replace('-Q', ', quarter ')}
      </p>

      {goal === null ? (
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-soft)]">
          No quarterly target set. A target is how much less you mean to spend across these three
          months than you did last quarter.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[14px] leading-relaxed">
            Aiming to cut <strong>{money(goal)}</strong> this quarter.
          </p>
          {saved === null ? (
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-soft)]">
              Add what last quarter cost and this will show how far along you are.
              So far this quarter: {money(view.quarter.spent_so_far)}.
            </p>
          ) : (
            <>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--surface)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, (saved / goal) * 100))}%`,
                    background: saved >= 0 ? 'var(--good)' : 'var(--bad)',
                  }}
                />
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-soft)]">
                {saved >= 0
                  ? `${money(saved)} less than the same stretch last quarter, against a target of ${money(goal)}.`
                  : `${money(Math.abs(saved))} more than last quarter so far, so the cut has not started yet.`}
              </p>
            </>
          )}
        </>
      )}

      {editing ? (
        <div className="mt-3 space-y-2">
          <label className="block text-[13px] text-[var(--ink-soft)]">
            How much to cut this quarter
            <input
              inputMode="decimal"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              className="mt-1 min-h-[48px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-[16px]"
            />
          </label>
          <label className="block text-[13px] text-[var(--ink-soft)]">
            What last quarter cost, if you know it
            <input
              inputMode="decimal"
              value={baseline}
              onChange={(event) => setBaseline(event.target.value)}
              className="mt-1 min-h-[48px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-[16px]"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || target === ''}
              onClick={() => void save()}
              className="min-h-[44px] flex-1 rounded-xl px-4 text-[14px] font-bold disabled:opacity-60"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-[44px] rounded-xl border border-[var(--line)] px-4 text-[14px] font-semibold text-[var(--ink-soft)]"
            >
              Cancel
            </button>
          </div>
          {problem ? <p className="text-[13px]" style={{ color: 'var(--bad)' }}>{problem}</p> : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 min-h-[44px] text-[13px] font-semibold"
          style={{ color: 'var(--accent-ink)' }}
        >
          {goal === null ? 'Set a quarterly target' : 'Change the target'}
        </button>
      )}
    </div>
  );
}

function CategoryList({ view, onSaved }: { view: MoneyView; onSaved: () => Promise<void> }) {
  if (view.categories.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <p className="text-[15px] font-bold">Nothing to show for this month yet</p>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-soft)]">
          {view.freshness.connected
            ? 'The bank has been read but there is no spending recorded for this month yet.'
            : 'Once the bank is connected, what you spend shows up here grouped into categories, and you can set what each one should cost in a month.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="kicker text-[11.5px] text-[var(--ink-soft)]">Where it went</p>
      {view.categories.map((line) => (
        <CategoryRow key={line.category} line={line} onSaved={onSaved} />
      ))}
    </div>
  );
}

function CategoryRow({
  line,
  onSaved,
}: {
  line: MoneyView['categories'][number];
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(line.cap?.toString() ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await setCap(line.category, value.trim() === '' ? null : Number(value));
      setEditing(false);
      await onSaved();
    } finally {
      setBusy(false);
    }
  };

  const pct = line.cap && line.cap > 0 ? Math.min(100, (line.spent / line.cap) * 100) : null;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-semibold">{line.category}</p>
        <p className="text-[15px] font-bold">{money(line.spent)}</p>
      </div>

      {line.cap !== null ? (
        <>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct ?? 0}%`,
                background: line.over_by !== null ? 'var(--bad)' : 'var(--accent)',
              }}
            />
          </div>
          <p className="mt-1.5 text-[12.5px] text-[var(--ink-soft)]">
            {line.over_by !== null
              ? `${money(line.over_by)} over the ${money(line.cap)} cap`
              : `of ${money(line.cap)}`}
            {line.transaction_count > 0
              ? `, across ${line.transaction_count} ${line.transaction_count === 1 ? 'payment' : 'payments'}`
              : ''}
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-[12.5px] text-[var(--ink-soft)]">
          No cap set
          {line.transaction_count > 0
            ? `, across ${line.transaction_count} ${line.transaction_count === 1 ? 'payment' : 'payments'}`
            : ''}
        </p>
      )}

      {editing ? (
        <div className="mt-3 flex gap-2">
          <input
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Leave blank for no cap"
            className="min-h-[44px] flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-[16px]"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="min-h-[44px] rounded-xl px-4 text-[14px] font-bold disabled:opacity-60"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Save
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 min-h-[44px] text-[13px] font-semibold"
          style={{ color: 'var(--accent-ink)' }}
        >
          {line.cap === null ? 'Set a monthly cap' : 'Change the cap'}
        </button>
      )}
    </div>
  );
}
