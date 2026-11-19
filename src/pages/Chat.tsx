import { useEffect, useRef, useState } from 'react';
import { KeyRound, RotateCcw, Send, Settings, Square } from 'lucide-react';
import { PROVIDERS, providerById } from '@shared/providers';
import { Card, GhostButton, Page, PrimaryButton, Toggle } from '../components/ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';
import { Markdown } from '../components/Markdown';

// The built-in chat: bring an API key for any OpenAI-compatible model and it
// drives the hub with the same tools an MCP app gets.

const STARTERS = ['Read the playbook and make a reel about my product.', 'Show me how my posted reels are doing and what we learned.', "Run today's warm-up for my active account."];

function ModelSetup({ onDone }: { onDone?: () => void }) {
  const cfg = useApp((s) => s.db!.agent);
  const hasKey = useApp((s) => !!s.chat?.hasKey);
  const toast = useApp((s) => s.toast);
  const [key, setKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const p = providerById(cfg.provider);
  const save = (patch: Parameters<typeof window.marketo.agent.saveConfig>[0], apiKey?: string): Promise<unknown> => window.marketo.agent.saveConfig(patch, apiKey);

  const fetchModels = async (): Promise<void> => {
    setLoading(true);
    if (key.trim()) await save({}, key);
    const r = await window.marketo.agent.models();
    setLoading(false);
    if (!r.ok || !r.data) return toast('error', r.message ?? 'Could not list models.');
    setModels(r.data);
    setKey('');
    toast('ok', `${r.data.length} models found. Pick one.`);
  };

  return (
    <Card className="space-y-3">
      <div className="text-sm font-semibold">Model</div>
      <div>
        <label className="label">Provider</label>
        <select
          className="input"
          value={p.id}
          onChange={(e) => {
            const next = providerById(e.target.value);
            setModels([]);
            void save({ provider: next.id, baseUrl: next.baseUrl, model: '' });
          }}
        >
          {PROVIDERS.map((x) => (
            <option key={x.id} value={x.id} className="bg-krypt-panel">
              {x.name}
            </option>
          ))}
        </select>
      </div>
      {(p.id === 'custom' || p.local) && (
        <div>
          <label className="label">API address</label>
          <input className="input font-mono text-xs" defaultValue={cfg.baseUrl} key={p.id} placeholder="https://…/v1" onBlur={(e) => void save({ baseUrl: e.target.value })} />
        </div>
      )}
      {!p.local && (
        <div>
          <label className="label">API key {hasKey && <span className="normal-case tracking-normal text-emerald-300">· saved</span>}</label>
          <div className="flex gap-2">
            <input className="input font-mono text-xs" type="password" value={key} placeholder={hasKey ? 'Paste a new key to replace it' : 'Paste your key'} onChange={(e) => setKey(e.target.value)} />
            <GhostButton small disabled={!key.trim()} onClick={() => void save({}, key).then(() => (setKey(''), toast('ok', 'Key saved, encrypted on this computer.')))}>
              <KeyRound className="h-3.5 w-3.5" /> Save
            </GhostButton>
          </div>
          <p className="mt-1 text-[11px] text-krypt-muted">
            Stored encrypted on this computer and sent only to {p.id === 'custom' ? 'the address above' : p.name}.
            {p.keyUrl && (
              <>
                {' '}
                <button className="text-krypt-purple hover:underline" onClick={() => void window.marketo.app.openExternal(p.keyUrl!)}>
                  Get a key
                </button>
              </>
            )}
          </p>
        </div>
      )}
      <div>
        <label className="label">Model</label>
        <div className="flex gap-2">
          {models.length ? (
            <select className="input font-mono text-xs" value={cfg.model} onChange={(e) => void save({ model: e.target.value })}>
              <option value="" className="bg-krypt-panel">
                Pick a model
              </option>
              {models.map((m) => (
                <option key={m} value={m} className="bg-krypt-panel">
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input className="input font-mono text-xs" defaultValue={cfg.model} key={`${p.id}-${cfg.model}`} placeholder="Model name, or press List" onBlur={(e) => void save({ model: e.target.value })} />
          )}
          <GhostButton small disabled={loading} onClick={() => void fetchModels()}>
            {loading ? '…' : 'List'}
          </GhostButton>
        </div>
        <p className="mt-1 text-[11px] text-krypt-muted">Pick one that supports tool calling (most current chat models do).</p>
      </div>
      <Toggle on={cfg.vision} onChange={(v) => void save({ vision: v })} label="This model can see images (send it preview frames and screenshots)" />
      {onDone && (
        <GhostButton small onClick={onDone}>
          Done
        </GhostButton>
      )}
    </Card>
  );
}

export default function Chat() {
  const chat = useApp((s) => s.chat);
  const cfg = useApp((s) => s.db!.agent);
  const [text, setText] = useState('');
  const [settings, setSettings] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const ready = !!chat?.hasKey && !!cfg.model && /^https?:/i.test(cfg.baseUrl);
  const steps = chat?.steps ?? [];
  // Braces matter: scrollIntoView returns a promise in current Chromium, and an effect must not return one.
  useEffect(() => {
    void end.current?.scrollIntoView({ block: 'end' });
  }, [steps.length, chat?.busy]);

  const send = (t: string): void => {
    const say = t.trim();
    if (!say || chat?.busy) return;
    setText('');
    void window.marketo.agent.send(say);
  };

  return (
    <Page
      title="Chat"
      subtitle={ready ? `${providerById(cfg.provider).name} · ${cfg.model}` : 'Bring your own model: Grok, GPT, anything on OpenRouter, or a local one.'}
      actions={
        <>
          <GhostButton small onClick={() => void window.marketo.agent.reset()} disabled={!steps.length}>
            <RotateCcw className="h-3.5 w-3.5" /> New chat
          </GhostButton>
          <GhostButton small onClick={() => setSettings((v) => !v)}>
            <Settings className="h-3.5 w-3.5" /> Model
          </GhostButton>
        </>
      }
      flush
    >
      <div className="flex h-full min-h-0 flex-col px-8 pb-6">
        {(!ready || settings) && (
          <div className="mb-4 max-w-xl">
            <ModelSetup onDone={ready ? () => setSettings(false) : undefined} />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-white/10 bg-krypt-panel/60 p-4">
          {steps.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="text-sm text-krypt-muted">{ready ? 'Ask for anything the hub can do.' : 'Set up a model above to start.'}</div>
              {ready && (
                <div className="flex max-w-xl flex-wrap justify-center gap-2">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:border-krypt-purple/50">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
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
              {chat?.busy && <div className="animate-pulse text-xs text-krypt-muted">Working…</div>}
              <div ref={end} />
            </div>
          )}
        </div>
        <div className="mx-auto mt-3 flex w-full max-w-3xl items-end gap-2">
          <textarea
            className="input max-h-40 min-h-[46px] flex-1 resize-none"
            rows={1}
            placeholder={ready ? 'Message your AI…' : 'Set up a model first'}
            value={text}
            disabled={!ready}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
          />
          {chat?.busy ? (
            <GhostButton onClick={() => void window.marketo.agent.stop()}>
              <Square className="h-4 w-4" /> Stop
            </GhostButton>
          ) : (
            <PrimaryButton onClick={() => send(text)} disabled={!ready || !text.trim()}>
              <Send className="h-4 w-4" /> Send
            </PrimaryButton>
          )}
        </div>
      </div>
    </Page>
  );
}
