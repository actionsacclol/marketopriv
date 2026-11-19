import { useEffect, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, CircleDashed, Copy, ExternalLink, FolderOpen } from 'lucide-react';
import type { ChromeStatus } from '@shared/types';
import { GhostButton } from './ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

// Adding the Krypt Marketo extension to Chrome, step by step, with a live
// check under it: is it in a Chrome profile, is that Chrome talking to the
// hub, is it the version this copy of Marketo ships. Used by the setup wizard
// and the Accounts page. While it is on screen the hub is asked again every
// few seconds, so each line turns green by itself as the user goes.

type Local = ChromeStatus['local'][number];

/** A Chrome profile in a picker: its name and the partly hidden email (the hub never hands the window the full one). */
export const chromeLabel = (p: Local): string => (p.email ? `${p.name} · ${p.email}` : p.name);

/** 0.10.0 is newer than 0.9.2: compare number by number. */
const older = (a: string, b: string): boolean => {
  const x = a.split('.').map((n) => parseInt(n, 10) || 0);
  const y = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  }
  return false;
};

export interface ExtensionCheck {
  /** In a Chrome profile on this computer (the picked one, when one is picked). */
  added: boolean;
  /** That Chrome is talking to the hub. */
  connected: boolean;
  /** A connected Chrome is running an older copy than this Marketo ships. */
  outdated: boolean;
  /** Added, connected and current. */
  ready: boolean;
}

/** `dir`: the Chrome profile the user picked for the account ('' or missing = any). */
export function extensionCheck(chrome: ChromeStatus | null | undefined, dir?: string): ExtensionCheck {
  const picked = dir ? chrome?.local.find((p) => p.dir === dir) : undefined;
  const live = (chrome?.profiles.length ?? 0) > 0;
  // An older extension in several Chrome profiles cannot be placed: with the picked one having it, take a live connection as its.
  const connected = picked ? picked.connected || (picked.hasExtension && live && (chrome?.unplaced ?? 0) > 0) : live;
  const added = picked ? picked.hasExtension : connected || !!chrome?.local.some((p) => p.hasExtension);
  const want = chrome?.extensionVersion;
  const outdated = !!want && !!chrome?.profiles.some((p) => p.version && older(p.version, want));
  return { added, connected, outdated, ready: added && connected && !outdated };
}

function Line({ state, children }: { state: 'ok' | 'wait' | 'bad'; children: ReactNode }) {
  const Icon = state === 'ok' ? CircleCheck : state === 'bad' ? CircleAlert : CircleDashed;
  return (
    <div className={cls('flex items-start gap-2 text-xs leading-relaxed', state === 'ok' ? 'text-emerald-300' : state === 'bad' ? 'text-amber-300' : 'text-white/55')}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 text-[11px] font-semibold text-white">{n}</span>
      <div className="min-w-0 flex-1 space-y-1.5">{children}</div>
    </div>
  );
}

const B = ({ children }: { children: ReactNode }) => <span className="font-semibold text-white">{children}</span>;

/** `dir`: the Chrome profile picked for the account; the steps and the checks are then about that one. */
export function ExtensionSetup({ many, dir }: { many?: boolean; dir?: string }) {
  const chrome = useApp((s) => s.chrome);
  const toast = useApp((s) => s.toast);
  // Ask again every few seconds while this is on screen: a Chrome profile that has the extension but is not
  // talking to the hub never announces itself.
  useEffect(() => {
    const ask = (): void => void window.marketo.chrome.status().then((c) => useApp.setState({ chrome: c }));
    ask();
    const t = setInterval(ask, 3000);
    return () => clearInterval(t);
  }, []);

  const check = extensionCheck(chrome, dir);
  const local = chrome?.local ?? [];
  const picked = dir ? local.find((p) => p.dir === dir) : undefined;
  const withIt = local.filter((p) => p.hasExtension);
  const closed = (picked ? [picked] : withIt).filter((p) => p.hasExtension && !p.connected);
  const want = chrome?.extensionVersion;
  const running = chrome?.profiles.map((p) => p.version).filter(Boolean) ?? [];
  const copy = (text: string, done: string): void => void window.marketo.app.copyText(text).then(() => toast('ok', done));
  const open = (d: string): void =>
    void window.marketo.chrome.open(d).then((r) => {
      if (!r.ok) toast('error', r.message ?? 'Could not open Chrome.');
    });

  return (
    <div className="space-y-4">
      <div className="space-y-3 text-sm text-white/80">
        <Step n={1}>
          <p>
            Open <B>Chrome</B>, in {picked ? 'the profile you picked above' : 'the profile where your accounts are signed in'}. Click the address bar, paste <span className="font-mono text-xs text-white">chrome://extensions</span> and press Enter.
          </p>
          <div className="flex flex-wrap gap-2">
            {picked && (
              <GhostButton small onClick={() => open(picked.dir)}>
                <ExternalLink className="h-3.5 w-3.5" /> Open that Chrome profile
              </GhostButton>
            )}
            <GhostButton small onClick={() => copy('chrome://extensions', "Copied. Paste it into Chrome's address bar.")}>
              <Copy className="h-3.5 w-3.5" /> Copy chrome://extensions
            </GhostButton>
          </div>
        </Step>
        <Step n={2}>
          <p>
            Turn on <B>Developer mode</B>: the switch at the top right of that page. Three buttons appear at the top left.
          </p>
        </Step>
        <Step n={3}>
          <p>
            Press <B>Load unpacked</B>. A folder window opens: click its address bar at the top, paste the folder path, press Enter, then press <B>Select Folder</B>.
          </p>
          {chrome?.extensionDir ? (
            <div className="flex flex-wrap gap-2">
              <GhostButton small onClick={() => copy(chrome.extensionDir!, 'Folder path copied. Paste it into the address bar of the folder window.')}>
                <Copy className="h-3.5 w-3.5" /> Copy the folder path
              </GhostButton>
              <GhostButton small onClick={() => void window.marketo.app.showItemInFolder(`${chrome.extensionDir}/manifest.json`)}>
                <FolderOpen className="h-3.5 w-3.5" /> Show the folder
              </GhostButton>
            </div>
          ) : (
            <p className="text-xs text-rose-300">The extension folder is missing from this install. Install Marketo again.</p>
          )}
        </Step>
        <Step n={4}>
          <p>
            <B>Krypt Marketo</B> now shows in Chrome's list, switched on. Leave Chrome open and come back here: the checks below turn green by themselves.
            {many ? ' Accounts in another Chrome profile: do the same there.' : ''}
          </p>
        </Step>
      </div>

      <div className="space-y-1.5 border-t border-white/5 pt-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-krypt-muted">Check</div>
        {picked && !picked.hasExtension && withIt.length > 0 ? (
          <Line state="bad">
            The extension is in another Chrome profile, but not in the one you picked above. Do steps 1 to 3 in the picked profile, or pick the other one.
          </Line>
        ) : (
          <Line state={check.added ? 'ok' : 'wait'}>
            {check.added
              ? 'Extension added to Chrome'
              : 'Extension not in Chrome yet (steps 1 to 3). This can take a few seconds to show after you add it.'}
          </Line>
        )}
        <Line state={check.connected ? 'ok' : check.added ? 'bad' : 'wait'}>
          {check.connected ? (
            'Chrome is connected to Marketo'
          ) : check.added ? (
            <div className="space-y-1.5">
              <div>The extension is in Chrome, but that Chrome is not talking to Marketo. It connects a few seconds after that Chrome profile opens. If it is open already, go to chrome://extensions and press the round reload arrow on Krypt Marketo.</div>
              <div className="flex flex-wrap gap-2">
                {closed.slice(0, 1).map((p) => (
                  <GhostButton key={p.dir} small onClick={() => open(p.dir)}>
                    <ExternalLink className="h-3.5 w-3.5" /> Open that Chrome profile
                  </GhostButton>
                ))}
              </div>
            </div>
          ) : (
            'Chrome not connected yet'
          )}
        </Line>
        {check.connected && (
          <Line state={check.outdated ? 'bad' : 'ok'}>
            {check.outdated
              ? `Chrome is running an older copy of the extension (${running.join(', ')}; this Marketo has ${want}). Go to chrome://extensions and press the round reload arrow on Krypt Marketo, or restart Chrome.`
              : `Extension is up to date${want ? ` (${want})` : ''}`}
          </Line>
        )}
        {!picked && check.connected && closed.length > 0 && <Line state="wait">{closed.length === 1 ? 'Another Chrome profile has the extension too and is' : `${closed.length} other Chrome profiles have the extension too and are`} not open right now.</Line>}
        {chrome && !chrome.registered && <Line state="bad">Marketo could not tell Chrome where its helper is, so Chrome cannot connect. {chrome.error ?? 'Close Marketo and open it again.'}</Line>}
        {chrome?.registered && chrome.error && <div className="text-xs text-rose-300">{chrome.error}</div>}
        {check.ready && <div className="pt-1 text-xs font-semibold text-emerald-300">All set. Chrome is ready for your accounts.</div>}
      </div>
      <p className="text-xs text-krypt-muted">While your AI is working, Chrome shows a "Krypt Marketo started debugging this browser" bar. That is normal; pressing Cancel on it stops the AI.</p>
    </div>
  );
}
