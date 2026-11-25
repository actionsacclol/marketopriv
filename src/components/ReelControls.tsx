import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ListPlus, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type { IgAccount, Variety } from '@shared/types';
import { styleById, styleMix, styleName, stylesOf } from '@shared/styles';
import { cls } from '../lib/format';
import { useApp } from '../state/store';
import { Card, GhostButton, PrimaryButton } from './ui';

// The user's own say over what reels get made: a queue of reels for the runs to
// work through, ideas the AI leaves to pick from, who picks the topics, how much
// each style is used and how much the runs experiment. Every one of these can
// also be set by the AI over MCP (queue_reels, propose_reels, set_settings,
// save_account), and only when the user asks.

function Choice<T extends string>({ value, options, onPick, disabled }: { value: T; options: Array<{ id: T; label: string; hint: string }>; onPick: (v: T) => void; disabled?: boolean }) {
  return (
    <div className={cls('grid gap-2', options.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {options.map((o) => (
        <button
          key={o.id}
          disabled={disabled}
          onClick={() => o.id !== value && onPick(o.id)}
          className={cls('rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-60', o.id === value ? 'border-krypt-purple/60 bg-krypt-purple/15' : 'border-white/10 hover:border-white/25')}
        >
          <div className="text-sm font-semibold text-white">{o.label}</div>
          <div className="mt-0.5 text-xs leading-relaxed text-white/65">{o.hint}</div>
        </button>
      ))}
    </div>
  );
}

/** Who picks each reel's topic: the AI (the queue still comes first), or only the user's queue. */
export function PickCard() {
  const pick = useApp((s) => s.db!.settings.reelPick) ?? 'ai';
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const set = async (v: 'ai' | 'me'): Promise<void> => {
    setBusy(true);
    const r = await window.marketo.db.updateSettings({ reelPick: v });
    setBusy(false);
    if (!r.ok) toast('error', r.message ?? 'Could not save.');
    else toast('ok', v === 'me' ? 'Runs now make only the reels you queue.' : 'Your AI picks the topics again.');
  };
  return (
    <Card>
      <Choice
        value={pick}
        disabled={busy}
        onPick={(v) => void set(v)}
        options={[
          { id: 'ai', label: 'My AI picks', hint: 'Each run chooses the topic from what is working. Anything in your queue still comes first.' },
          { id: 'me', label: 'I pick', hint: 'Runs make only the reels in your queue. With it empty a run makes no reel: it does the rest and leaves three ideas for you to choose from.' },
        ]}
      />
    </Card>
  );
}

/** The reels after the next one: one per run, in order. */
export function QueueCard() {
  const next = useApp((s) => s.db!.nextRun);
  const toast = useApp((s) => s.toast);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const queue = next?.queue ?? [];
  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>): Promise<boolean> => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) toast('error', r.message ?? 'Could not save.');
    return r.ok;
  };
  const add = async (): Promise<void> => {
    if (!text.trim()) return;
    if (await run(() => window.marketo.db.queueRun(text))) setText('');
  };
  return (
    <Card className="space-y-3">
      {queue.length === 0 ? (
        <p className="text-sm text-krypt-muted">{next?.note ? 'Nothing after the one above.' : 'Empty. The first thing you add becomes the next run’s instructions above.'}</p>
      ) : (
        <ol className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
          {queue.map((q, i) => (
            <li key={q.id} className="flex items-start gap-2 px-3 py-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[11px] text-white/80">{i + 2}</span>
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-white/85">{q.text}</p>
              <div className="flex shrink-0 items-center gap-0.5 text-krypt-muted">
                <button aria-label="Move up" disabled={busy || i === 0} onClick={() => void run(() => window.marketo.db.moveQueued(q.id, -1))} className="rounded p-1 hover:text-white disabled:opacity-30">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button aria-label="Move down" disabled={busy || i === queue.length - 1} onClick={() => void run(() => window.marketo.db.moveQueued(q.id, 1))} className="rounded p-1 hover:text-white disabled:opacity-30">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button aria-label="Remove" disabled={busy} onClick={() => void run(() => window.marketo.db.unqueueRun(q.id))} className="rounded p-1 hover:text-rose-300 disabled:opacity-30">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex items-end gap-2">
        <textarea className="input min-h-[64px] flex-1 text-sm leading-relaxed" placeholder="e.g. A reel on Krypt Cleaner: what it removes that the built-in Windows cleanup leaves behind." value={text} maxLength={2200} onChange={(e) => setText(e.target.value)} />
        <PrimaryButton disabled={busy || !text.trim()} onClick={() => void add()}>
          <Plus className="h-4 w-4" /> Add
        </PrimaryButton>
      </div>
      <p className="text-xs leading-relaxed text-krypt-muted">One per run, top first: when a run has used the instructions above, the first of these moves up. You can also tell your AI "queue three reels about …". To clip a YouTube video, use "Clip a YouTube video" above.</p>
    </Card>
  );
}

/** Reels the AI suggests; the user queues the ones they want. */
export function IdeasCard() {
  const ideas = useApp((s) => s.db!.reelIdeas) ?? [];
  const brand = useApp((s) => s.db!.brand);
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (id: string, fn: () => Promise<{ ok: boolean; message?: string }>, done?: string): Promise<void> => {
    setBusy(id);
    const r = await fn();
    setBusy(null);
    if (!r.ok) toast('error', r.message ?? 'Could not save.');
    else if (done) toast('ok', done);
  };
  if (!ideas.length)
    return (
      <Card>
        <p className="text-sm leading-relaxed text-krypt-muted">None waiting. Ask your AI ("give me five reel ideas"), or set topics to "I pick": each run with an empty queue then leaves three here.</p>
      </Card>
    );
  return (
    <Card padded={false} className="divide-y divide-white/5">
      {ideas.map((i) => {
        const st = i.style ? styleById(i.style) : undefined;
        return (
          <div key={i.id} className="space-y-1.5 px-4 py-3">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-sm font-medium text-white">{i.topic}</p>
              <button aria-label="Dismiss" disabled={busy === i.id} onClick={() => void act(i.id, () => window.marketo.db.dropIdea(i.id))} className="rounded p-0.5 text-krypt-muted hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {i.hook && <p className="text-sm text-white/80">“{i.hook}”</p>}
            {i.why && <p className="text-xs leading-relaxed text-krypt-muted">{i.why}</p>}
            <div className="flex items-center gap-2">
              {st && <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/70">{styleName(st, brand).name}</span>}
              <GhostButton small disabled={busy === i.id} onClick={() => void act(i.id, () => window.marketo.db.queueIdea(i.id), 'Queued.')}>
                <ListPlus className="h-3.5 w-3.5" /> Queue it
              </GhostButton>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

const VARIETY: Array<{ id: Variety; label: string; hint: string }> = [
  { id: 'proven', label: 'Proven', hint: 'Every reel uses the opening, art style and voice with the best numbers so far. No testing. Best once a test has run a while: early on, the best so far rests on one or two posts.' },
  { id: 'balanced', label: 'Balanced', hint: 'Each one gets tried a few times per platform, then the winner gets about two reels in three.' },
  { id: 'experimental', label: 'Experimental', hint: 'Keeps rotating all of them evenly, even after a winner shows. Most variety, slowest to settle.' },
];

/** How much the runs experiment with openings, art styles and voices. */
export function VarietyCard() {
  const variety = useApp((s) => s.db!.settings.variety) ?? 'balanced';
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const set = async (v: Variety): Promise<void> => {
    setBusy(true);
    const r = await window.marketo.db.updateSettings({ variety: v });
    setBusy(false);
    if (!r.ok) toast('error', r.message ?? 'Could not save.');
    else toast('ok', `Variety: ${VARIETY.find((x) => x.id === v)!.label.toLowerCase()}.`);
  };
  return (
    <Card className="space-y-2">
      <div>
        <div className="text-sm font-semibold text-white">Variety</div>
        <p className="mt-0.5 text-xs text-krypt-muted">How much your reels differ from one another: the kind of opening, the art style and (with a voice test on) the voice.</p>
      </div>
      <Choice value={variety} disabled={busy} onPick={(v) => void set(v)} options={VARIETY} />
    </Card>
  );
}

function MixRow({ a }: { a: IgAccount }) {
  const brand = useApp((s) => s.db!.brand);
  const toast = useApp((s) => s.toast);
  const mix = styleMix(a);
  const saved = mix.map((m) => `${m.id}:${m.share}`).join(',');
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(mix.map((m) => [m.id, String(m.share)])));
  const [busy, setBusy] = useState(false);
  // The account's styles or mix changed elsewhere (a style switched on, the AI set a mix): show that.
  useEffect(() => setVals(Object.fromEntries(styleMix(a).map((m) => [m.id, String(m.share)]))), [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const nums = mix.map((m) => Math.max(0, Math.min(100, Math.round(Number(vals[m.id]) || 0))));
  const total = nums.reduce((n, x) => n + x, 0);
  const dirty = mix.some((m, i) => m.share !== nums[i]);
  const save = async (styleMixNext: Record<string, number>, done: string): Promise<void> => {
    setBusy(true);
    const r = await window.marketo.db.saveAccount({ id: a.id, styleMix: styleMixNext });
    setBusy(false);
    if (!r.ok) toast('error', r.message ?? 'Could not save.');
    else toast('ok', done);
  };
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium text-white">{a.handle}</div>
        <span className="text-[11px] text-krypt-muted">{a.styleMix ? 'your mix' : 'default mix: the main style half, the others share the rest'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {mix.map((m) => {
          const st = styleById(m.id);
          return (
            <label key={m.id} className="flex items-center gap-1.5 text-sm text-white/85">
              {st ? styleName(st, brand).name : m.id}
              <input className="input w-16 px-2 py-1 text-right font-mono text-sm" inputMode="numeric" value={vals[m.id] ?? ''} onChange={(e) => setVals({ ...vals, [m.id]: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })} />
              <span className="text-krypt-muted">%</span>
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <GhostButton small disabled={busy || !dirty || total === 0} onClick={() => void save(Object.fromEntries(mix.map((m, i) => [m.id, nums[i]])), `${a.handle}: mix saved.`)}>
          Save mix
        </GhostButton>
        {a.styleMix && (
          <GhostButton small disabled={busy} onClick={() => void save({}, `${a.handle}: back to the default mix.`)}>
            <RotateCcw className="h-3.5 w-3.5" /> Default
          </GhostButton>
        )}
        {dirty && total !== 100 && total > 0 && <span className="text-xs text-krypt-muted">Adds up to {total}%: it is scaled to 100 when saved.</span>}
      </div>
    </div>
  );
}

/** How often each of an account's styles is used. Only for accounts running more than one. */
export function MixCard({ accounts }: { accounts: IgAccount[] }) {
  const many = accounts.filter((a) => stylesOf(a).length > 1);
  return (
    <Card padded={false}>
      <div className="px-4 pt-3">
        <div className="text-sm font-semibold text-white">Style mix</div>
        <p className="mt-0.5 text-xs text-krypt-muted">How many of an account's reels each style that is on gets. Marketo tells every run which style is due, from the latest reels.</p>
      </div>
      {many.length === 0 ? (
        <p className="px-4 pb-3 pt-2 text-sm text-krypt-muted">Every account runs one style. Switch more on below to set a mix.</p>
      ) : (
        <div className="divide-y divide-white/5">
          {many.map((a) => (
            <MixRow key={a.id} a={a} />
          ))}
        </div>
      )}
    </Card>
  );
}
