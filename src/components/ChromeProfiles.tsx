import { Chrome, CircleAlert, CircleCheck, ExternalLink } from 'lucide-react';
import type { IgAccount } from '@shared/types';
import { Card, GhostButton, Section } from './ui';
import { useApp } from '../state/store';
import { chromeLabel } from './ExtensionSetup';

// Which of the user's Chrome profiles each account runs in. The list is
// Chrome's own (the same names as its profile picker), read on this computer by
// the hub. Emails arrive partly hidden ("sk***ow@gmail.com"): the full address
// never reaches this window.

const label = chromeLabel;

export function ChromeProfilesSection() {
  const chrome = useApp((s) => s.chrome);
  const accounts = useApp((s) => s.db!.igAccounts);
  const toast = useApp((s) => s.toast);
  const go = useApp((s) => s.go);
  const local = chrome?.local ?? [];
  const inChrome = accounts.filter((a) => a.browser === 'chrome');

  const pick = async (a: IgAccount, dir: string): Promise<void> => {
    const r = await window.marketo.db.saveAccount({ id: a.id, chromeDir: dir });
    if (!r.ok) return toast('error', r.message ?? 'Could not save.');
    const p = local.find((x) => x.dir === dir);
    toast('ok', p ? `${a.handle} now runs only in the Chrome profile "${p.name}".` : `${a.handle} is back on automatic: the Chrome profile signed in as it.`);
  };
  const open = async (dir: string): Promise<void> => {
    const r = await window.marketo.chrome.open(dir);
    if (!r.ok) toast('error', r.message ?? 'Could not open Chrome.');
  };

  return (
    <Section title="Chrome profile" description="Which of your Chrome profiles each account runs in. Automatic uses the one signed in as the account; pick one to keep the account to that profile.">
      <Card padded={false} className="divide-y divide-white/5">
        {inChrome.length === 0 && (
          <div className="flex items-center gap-3 px-4 py-3 text-sm text-white/75">
            <span className="min-w-0 flex-1">No account in this profile runs in Chrome. Set one to "My Chrome" on the Accounts page.</span>
            <GhostButton small onClick={() => go('accounts')}>
              Accounts
            </GhostButton>
          </div>
        )}
        {inChrome.length > 0 && local.length === 0 && <div className="px-4 py-3 text-sm text-white/75">Google Chrome's profiles were not found on this computer, so there is nothing to pick from. Accounts run in the Chrome profile signed in as them.</div>}
        {inChrome.length > 0 &&
          local.length > 0 &&
          inChrome.map((a) => {
            const p = local.find((x) => x.dir === a.chromeDir);
            const lost = !!a.chromeDir && !p;
            return (
              <div key={a.id} className="space-y-2 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Chrome className="h-3.5 w-3.5 shrink-0 text-krypt-muted" />
                  <span className="truncate font-mono text-xs text-white/85">{a.handle}</span>
                </div>
                <select value={a.chromeDir ?? ''} onChange={(e) => void pick(a, e.target.value)} className="input w-full py-1.5 text-xs" title="The Chrome profile this account runs in">
                  <option value="" className="bg-krypt-panel">
                    Automatic (the one signed in as {a.handle})
                  </option>
                  {local.map((x) => (
                    <option key={x.dir} value={x.dir} className="bg-krypt-panel">
                      {label(x)}
                      {x.hasExtension ? '' : ' (no extension yet)'}
                    </option>
                  ))}
                  {lost && (
                    <option value={a.chromeDir} className="bg-krypt-panel">
                      A Chrome profile that was removed
                    </option>
                  )}
                </select>
                {lost && (
                  <div className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-300">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Chrome no longer has that profile. Pick another, or Automatic.
                  </div>
                )}
                {p && p.connected && (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                    <CircleCheck className="h-3.5 w-3.5 shrink-0" /> Open and connected.
                  </div>
                )}
                {p && !p.connected && p.hasExtension && (
                  <div className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-300">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">{chrome?.unplaced ? 'Not confirmed yet: reload the extension in that Chrome profile (see below).' : 'Not open right now. Marketo opens it by itself when your AI needs it.'}</span>
                    <GhostButton small onClick={() => void open(p.dir)}>
                      <ExternalLink className="h-3.5 w-3.5" /> Open it
                    </GhostButton>
                  </div>
                )}
                {p && !p.hasExtension && (
                  <div className="space-y-2 text-[11px] leading-relaxed text-amber-300">
                    <div className="flex items-start gap-1.5">
                      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        The Krypt Marketo extension is not added in that Chrome profile, so the account cannot run there yet. Open the profile, go to <span className="font-mono">chrome://extensions</span>, turn on Developer mode, press Load unpacked and pick the
                        extension folder.
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <GhostButton small onClick={() => void open(p.dir)}>
                        <ExternalLink className="h-3.5 w-3.5" /> Open that Chrome profile
                      </GhostButton>
                      {chrome?.extensionDir && (
                        <GhostButton small onClick={() => void window.marketo.app.copyText(chrome.extensionDir!).then(() => toast('ok', 'Folder path copied. Paste it into the Load unpacked window.'))}>
                          Copy the extension folder path
                        </GhostButton>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        {(chrome?.unplaced ?? 0) > 0 && (
          <div className="flex items-start gap-1.5 px-4 py-3 text-[11px] leading-relaxed text-amber-300">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              More than one of your Chrome profiles has the Krypt Marketo extension, and {chrome!.unplaced === 1 ? 'one that is connected runs' : `${chrome!.unplaced} that are connected run`} an older version Marketo cannot tell apart. In each, open{' '}
              <span className="font-mono">chrome://extensions</span> and press the reload arrow on Krypt Marketo (or restart Chrome). Until then those work as on Automatic.
            </span>
          </div>
        )}
      </Card>
      <p className="mt-3 text-[11px] leading-relaxed text-krypt-muted">
        These are your Chrome profiles as Chrome lists them. The emails are read on this computer and shown partly hidden: your AI is told the profile's name, never the email. Whichever is picked, Marketo still refuses to act unless the right account is signed in there.
      </p>
    </Section>
  );
}
