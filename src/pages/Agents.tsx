import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, FolderOpen, MessageSquare, Plug, RefreshCw } from 'lucide-react';
import type { ClientInfo } from '@shared/types';
import { Card, GhostButton, Page, PrimaryButton, Section, Toggle } from '../components/ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

/** One AI app: connect it with a click (we edit its MCP config), or see where that config is. */
export function ClientRow({ c, onChanged }: { c: ClientInfo; onChanged: () => void }) {
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const run = async (connect: boolean): Promise<void> => {
    setBusy(true);
    const r = connect ? await window.marketo.mcp.connect(c.id) : await window.marketo.mcp.disconnect(c.id);
    setBusy(false);
    toast(r.ok ? 'ok' : 'error', r.message ?? (r.ok ? 'Done.' : 'Failed.'));
    onChanged();
  };
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{c.name}</span>
          {c.connected ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
              <Check className="h-3 w-3" /> connected
            </span>
          ) : c.detected ? (
            <span className="text-[11px] text-krypt-muted">installed</span>
          ) : (
            <span className="text-[11px] text-white/30">not found on this computer</span>
          )}
        </div>
        <div className="truncate font-mono text-[10px] text-white/35" title={c.configPath}>
          {c.configPath}
        </div>
        {c.connected && <div className="mt-0.5 text-[11px] text-krypt-muted">{c.hint}</div>}
      </div>
      {c.connected ? (
        <GhostButton small disabled={busy} onClick={() => void run(false)}>
          Remove
        </GhostButton>
      ) : (
        <PrimaryButton className="px-3 py-1.5 text-xs" disabled={busy} onClick={() => void run(true)}>
          <Plug className="h-3.5 w-3.5" /> {busy ? 'Connecting…' : 'Connect'}
        </PrimaryButton>
      )}
    </div>
  );
}

export default function Agents() {
  const mcp = useApp((s) => s.mcp);
  const db = useApp((s) => s.db)!;
  const toast = useApp((s) => s.toast);
  const go = useApp((s) => s.go);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [generic, setGeneric] = useState('');
  const refresh = useCallback(() => void window.marketo.mcp.clients().then(setClients), []);
  useEffect(() => {
    refresh();
    void window.marketo.mcp.genericConfig().then(setGeneric);
  }, [refresh]);

  return (
    <Page title="Connect" subtitle="Hook up the AI you already use. It gets tools to make reels, render them and run your Instagram accounts, in Marketo's own browser or your Chrome.">
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div>
          <Section title="Status">
            <Card className="flex items-center gap-3">
              <span className={cls('h-2.5 w-2.5 rounded-full', mcp?.clients.length ? 'animate-pulse-slow bg-emerald-400' : mcp?.listening && mcp.enabled ? 'bg-krypt-purple' : 'bg-rose-400')} />
              <div className="flex-1 text-sm">
                {!mcp ? 'Loading…' : mcp.error ? mcp.error : !mcp.enabled ? 'AI access is off: every tool answers with an error.' : mcp.clients.length ? `Connected now: ${mcp.clients.map((c) => `${c.name} (${c.calls} calls)`).join(', ')}` : `Ready · ${mcp.toolCount} tools · no AI connected right now`}
              </div>
              <Toggle on={!!mcp?.enabled} onChange={(on) => void window.marketo.mcp.setEnabled(on)} label="AI access" />
            </Card>
          </Section>

          <Section
            title="AI apps"
            description="Connect adds Krypt Marketo to the app's MCP settings (a backup of the file is kept next to it)."
            actions={
              <GhostButton small onClick={refresh}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </GhostButton>
            }
          >
            <Card padded={false} className="divide-y divide-white/5">
              {[...clients].sort((a, b) => Number(b.connected) - Number(a.connected) || Number(b.detected) - Number(a.detected)).map((c) => (
                <ClientRow key={c.id} c={c} onChanged={refresh} />
              ))}
            </Card>
          </Section>

          <Section title="No AI app? Use the built-in chat">
            <Card className="flex items-center gap-4">
              <div className="flex-1 text-sm text-white/80">Paste an API key (Grok, GPT, OpenRouter, or a local model) and talk to it right here. Same tools, same limits.</div>
              <GhostButton onClick={() => go('chat')}>
                <MessageSquare className="h-4 w-4" /> Open Chat
              </GhostButton>
            </Card>
          </Section>

          <Section title="Any other MCP app" description="Paste this into its MCP server settings.">
            <Card>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] text-white/70">{generic}</pre>
              <div className="mt-3 flex gap-2">
                <GhostButton small onClick={() => void window.marketo.app.copyText(generic).then(() => toast('ok', 'Copied.'))}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </GhostButton>
                <GhostButton small onClick={() => void window.marketo.app.copyText(mcp?.installCommand ?? '').then(() => toast('ok', 'Command copied.'))}>
                  <Copy className="h-3.5 w-3.5" /> Copy Claude Code command
                </GhostButton>
              </div>
            </Card>
          </Section>

          <Section title="Output">
            <Card className="space-y-3">
              <div>
                <div className="label">Render folder</div>
                <div className="flex gap-2">
                  <div className="input truncate font-mono text-xs">{db.settings.outputDir}</div>
                  <GhostButton
                    small
                    onClick={() =>
                      void window.marketo.app.pickDirectory().then((d) => {
                        if (d) void window.marketo.db.updateSettings({ outputDir: d });
                      })
                    }
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </GhostButton>
                </div>
              </div>
              <div>
                <div className="label">Frame rate</div>
                <select className="input" value={db.settings.fps} onChange={(e) => void window.marketo.db.updateSettings({ fps: Number(e.target.value) })}>
                  {[24, 30, 60].map((f) => (
                    <option key={f} value={f} className="bg-krypt-panel">
                      {f} fps
                    </option>
                  ))}
                </select>
              </div>
            </Card>
          </Section>
        </div>

        <Section title="Activity">
          <Card padded={false} className="max-h-[760px] overflow-auto">
            {(mcp?.activity ?? []).length === 0 ? (
              <div className="p-5 text-sm text-krypt-muted">Everything an AI does shows up here as it happens.</div>
            ) : (
              <div className="divide-y divide-white/5">
                {[...(mcp?.activity ?? [])].reverse().map((a) => (
                  <div key={a.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={cls('h-1.5 w-1.5 rounded-full', a.state === 'error' ? 'bg-rose-400' : a.state === 'running' ? 'animate-pulse bg-krypt-purple' : 'bg-emerald-400')} />
                      <span className="font-mono">{a.tool}</span>
                      <span className="text-xs text-krypt-muted">{a.client}</span>
                      <span className="ml-auto font-mono text-[10px] text-krypt-muted">
                        {new Date(a.ts).toLocaleTimeString()} · {a.state === 'running' ? '…' : `${a.ms}ms`}
                      </span>
                    </div>
                    {a.args && <div className="mt-1 truncate font-mono text-[11px] text-white/40">{a.args}</div>}
                    {a.result && <div className={cls('mt-0.5 truncate text-xs', a.state === 'error' ? 'text-rose-300' : 'text-white/70')}>{a.result}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Section>
      </div>
    </Page>
  );
}
