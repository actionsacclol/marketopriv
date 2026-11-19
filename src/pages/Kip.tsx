import { useEffect, useRef, useState } from 'react';
import { Moon, RotateCcw, Send, Square, Sun } from 'lucide-react';
import type { ChatStep } from '@shared/types';
import { Card, GhostButton, Page, PrimaryButton } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { runWhen } from '../lib/autopilotWindow';
import { cls } from '../lib/format';
import { useHubActive } from '../lib/hubActive';
import { renderCharacter } from '../render/char3d';
import { refreshAutopilot, useApp } from '../state/store';

// Kip: the hub's manager, and the purple character from its videos. One page
// to talk to Marketo: numbers, ideas, the reel queue, styles, settings. He
// thinks with the user's own Claude Code (no API key); without it, the built-in
// chat's model stands in when one is set up. Awake = the autopilot is on and he
// works by himself on its schedule; asleep = nothing runs until he is woken.

const STARTERS = ['How are my reels doing, and what should we change?', 'Give me five reel ideas I can pick from.', 'Queue a reel about my best tool for the next run.', 'Make my reels more varied.', 'What needs me right now?'];

/** The mascot, drawn live by the same code that draws him in the reels. */
function Figure({ mood }: { mood: 'asleep' | 'idle' | 'working' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [broken, setBroken] = useState(false);
  const active = useHubActive();
  useEffect(() => {
    let raf = 0;
    let off = false;
    let last = 0;
    const t0 = performance.now();
    const draw = (now: number): void => {
      if (off) return;
      // Asleep, or nobody is using the hub: he holds still, one frame is enough.
      if ((mood !== 'asleep' && active) || !last) raf = requestAnimationFrame(draw);
      if (now - last < 1000 / 14 || document.hidden) return;
      last = now;
      const cv = ref.current;
      const ctx = cv?.getContext('2d');
      if (!cv || !ctx) return;
      const t = (now - t0) / 1000;
      try {
        const out = renderCharacter({
          art: 'cartoon',
          action: mood === 'working' ? 'think' : mood === 'idle' ? (t % 12 < 3 ? 'wave' : 'present') : 'sad',
          local: mood === 'asleep' ? 3 : mood === 'working' ? t % 6 : t % 12 < 3 ? t % 12 : (t % 12) - 3,
          t,
          talk: 0,
          place: 'stage',
          side: 0,
          zoom: 0.35,
          accent: '#22d3ee',
          color: '#8B5CF6',
        });
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.drawImage(out.canvas, 0, 0, cv.width, cv.height);
      } catch {
        off = true;
        setBroken(true);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      off = true;
      cancelAnimationFrame(raf);
    };
  }, [mood, active]);
  return (
    <div className="relative mx-auto aspect-[9/13] w-full max-w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-krypt-purple/20 to-black/40">
      {broken ? (
        <img src="./krypt.png" alt="" className="absolute inset-0 m-auto h-20 w-20 rounded-xl opacity-80" />
      ) : (
        <canvas ref={ref} width={360} height={640} className={cls('absolute left-0 top-1/2 w-full -translate-y-1/2 transition duration-700', mood === 'asleep' && 'opacity-45 grayscale')} />
      )}
      {mood === 'asleep' && <div className="absolute right-4 top-3 select-none font-mono text-lg tracking-widest text-white/60">z z z</div>}
      {mood === 'working' && <div className="absolute left-3 top-3 animate-pulse text-[11px] text-white/70">working…</div>}
    </div>
  );
}

function Steps({ steps, busy }: { steps: ChatStep[]; busy: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  // Braces matter: scrollIntoView returns a promise in current Chromium, and an effect must not return one.
  useEffect(() => {
    void end.current?.scrollIntoView({ block: 'end' });
  }, [steps.length, busy]);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      {steps.map((s) =>
        s.role === 'user' ? (
          <div key={s.id} className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-krypt-purple/25 px-4 py-2.5 text-sm text-white">
            {s.text}
          </div>
        ) : s.role === 'assistant' ? (
          <div key={s.id} className="max-w-[90%] text-sm text-white/90">
            <Markdown source={s.text} />
          </div>
        ) : s.role === 'tool' ? (
          <div key={s.id} className="max-w-[90%] rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className={cls('h-1.5 w-1.5 rounded-full', s.state === 'error' ? 'bg-rose-400' : s.state === 'running' ? 'animate-pulse bg-krypt-purple' : 'bg-emerald-400')} />
              <span className="font-mono text-white/80">{s.tool}</span>
            </div>
            {s.text && <div className={cls('mt-1 line-clamp-3 whitespace-pre-wrap break-words font-mono text-[11px]', s.state === 'error' ? 'text-rose-300' : 'text-white/45')}>{s.text}</div>}
            {s.images && s.images.length > 0 && (
              <div className="mt-2 flex gap-2 overflow-auto">
                {s.images.map((im, i) => (
                  <img key={i} src={`data:${im.mimeType};base64,${im.data}`} alt="" className="h-40 rounded-lg border border-white/10" />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div key={s.id} className="max-w-[90%] rounded-xl border border-rose-400/30 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
            {s.text}
          </div>
        ),
      )}
      {busy && <div className="animate-pulse text-xs text-krypt-muted">Kip is on it…</div>}
      <div ref={end} />
    </div>
  );
}

export default function Kip() {
  const kip = useApp((s) => s.kip);
  const chat = useApp((s) => s.chat);
  const cfg = useApp((s) => s.db!.agent);
  const ap = useApp((s) => s.autopilot);
  const toast = useApp((s) => s.toast);
  const go = useApp((s) => s.go);
  const [text, setText] = useState('');
  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    void refreshAutopilot();
    void window.marketo.kip.state().then((k) => useApp.setState({ kip: k }));
  }, []);

  // His own brain is Claude Code. Without it, the built-in chat's model stands in when the user has set one up.
  const keyReady = !!chat?.hasKey && !!cfg.model && /^https?:/i.test(cfg.baseUrl);
  const engine: 'claude' | 'key' | 'none' = kip?.available ? 'claude' : keyReady ? 'key' : 'none';
  const steps = engine === 'key' ? (chat?.steps ?? []) : (kip?.steps ?? []);
  const busy = engine === 'key' ? !!chat?.busy : !!kip?.busy;
  const awake = !!ap?.on;
  const onRun = !!ap?.running;

  const send = (t: string): void => {
    const say = t.trim();
    if (!say || busy || engine === 'none') return;
    setText('');
    void (engine === 'key' ? window.marketo.agent.send(say) : window.marketo.kip.send(say));
  };
  const stop = (): void => void (engine === 'key' ? window.marketo.agent.stop() : window.marketo.kip.stop());
  const fresh = (): void => void (engine === 'key' ? window.marketo.agent.reset() : window.marketo.kip.reset());

  const wake = async (on: boolean): Promise<void> => {
    if (!ap) return;
    setSwitching(true);
    const r = on ? await window.marketo.autopilot.enable({ ai: ap.ai, times: ap.times }) : await window.marketo.autopilot.disable();
    setSwitching(false);
    if (r.ok && r.data) {
      useApp.setState({ autopilot: r.data });
      toast('ok', on ? `Kip is awake: ${r.data.times.length} run${r.data.times.length === 1 ? '' : 's'} a day.` : 'Kip is asleep. Nothing runs by itself until you wake him.');
    } else toast('error', r.message ?? (on ? 'Could not wake him.' : 'Could not put him to sleep.'));
  };

  const status = !ap ? 'Checking…' : onRun ? 'On a run right now. You can still talk to him; anything that needs the browser waits until the run ends.' : awake ? `Awake. Next run ${runWhen(ap.task.nextRun)}.` : 'Asleep. He answers when you talk to him, and does nothing by himself.';

  return (
    <Page
      title="Kip"
      subtitle="Your Marketo manager. Ask him for numbers, ideas, new reels, or to change how things run."
      actions={
        <GhostButton small onClick={fresh} disabled={!steps.length}>
          <RotateCcw className="h-3.5 w-3.5" /> New chat
        </GhostButton>
      }
      flush
    >
      <div className="flex h-full min-h-0 gap-5 px-8 pb-6">
        <div className="hidden w-[250px] shrink-0 flex-col gap-3 overflow-auto lg:flex">
          <Card className="space-y-3">
            <Figure mood={busy || onRun ? 'working' : awake ? 'idle' : 'asleep'} />
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-base font-bold text-white">
                Kip
                <span className={cls('h-2 w-2 rounded-full', onRun ? 'animate-pulse bg-krypt-purple' : awake ? 'bg-emerald-400' : 'bg-white/25')} />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-white/70">{status}</p>
            </div>
            {awake ? (
              <GhostButton disabled={switching || !ap} onClick={() => void wake(false)}>
                <Moon className="h-4 w-4" /> Put to sleep
              </GhostButton>
            ) : (
              <PrimaryButton disabled={switching || !ap} onClick={() => void wake(true)}>
                <Sun className="h-4 w-4" /> Wake up
              </PrimaryButton>
            )}
            <p className="text-[11px] leading-relaxed text-krypt-muted">
              Awake, he runs your accounts by himself{ap ? ` ${ap.times.length} time${ap.times.length === 1 ? '' : 's'} a day` : ''}: this is the Autopilot switch.{' '}
              <button className="underline-offset-2 hover:text-white hover:underline" onClick={() => go('autopilot')}>
                Times and reports
              </button>
            </p>
          </Card>
          <Card className="space-y-1.5 text-[11px] leading-relaxed text-krypt-muted">
            <div className="text-xs font-semibold text-white">What he can do</div>
            <p>Show how your reels and accounts are doing, and what to change.</p>
            <p>Make, change and queue reels; leave ideas for you to pick from.</p>
            <p>Make new styles from a description; change the style mix, variety, voices and your rules.</p>
            <p>He asks before anything that posts, deletes or spends voice credits.</p>
            <p className="pt-1">
              {engine === 'claude' ? 'Thinks with your Claude Code, on your plan.' : engine === 'key' ? `Thinks with the built-in chat's model (${cfg.model}).` : ''}{' '}
              <button className="underline-offset-2 hover:text-white hover:underline" onClick={() => go('usage')}>
                Usage
              </button>
            </p>
          </Card>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-white/10 bg-krypt-panel/60 p-4">
            {engine === 'none' ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <div className="max-w-md text-sm leading-relaxed text-krypt-muted">{kip ? `${kip.reason ?? 'Kip is not ready.'} Connect Claude Code, or give the built-in chat a model with an API key, and he can talk.` : 'Waking Kip…'}</div>
                {kip && (
                  <div className="flex gap-2">
                    <GhostButton small onClick={() => go('agents')}>
                      Connect Claude Code
                    </GhostButton>
                    <GhostButton small onClick={() => go('chat')}>
                      Use an API key
                    </GhostButton>
                  </div>
                )}
              </div>
            ) : steps.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <div className="text-sm text-krypt-muted">Ask Kip for anything the hub can do.</div>
                <div className="flex max-w-xl flex-wrap justify-center gap-2">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:border-krypt-purple/50">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <Steps steps={steps} busy={busy} />
            )}
          </div>
          <div className="mx-auto mt-3 flex w-full max-w-3xl items-end gap-2">
            <textarea
              className="input max-h-40 min-h-[46px] flex-1 resize-none"
              rows={1}
              placeholder={engine === 'none' ? 'Kip is not ready yet' : 'Message Kip…'}
              value={text}
              disabled={engine === 'none'}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(text);
                }
              }}
            />
            {busy ? (
              <GhostButton onClick={stop}>
                <Square className="h-4 w-4" /> Stop
              </GhostButton>
            ) : (
              <PrimaryButton onClick={() => send(text)} disabled={engine === 'none' || !text.trim()}>
                <Send className="h-4 w-4" /> Send
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}
