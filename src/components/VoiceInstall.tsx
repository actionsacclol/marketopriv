import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { VoiceStatus } from '@shared/types';
import { Card, PrimaryButton } from './ui';

/** Live state of the on-device voice model. */
export function useVoiceStatus(): VoiceStatus | null {
  const [st, setSt] = useState<VoiceStatus | null>(null);
  useEffect(() => {
    void window.marketo.voice.status().then(setSt);
    return window.marketo.voice.onStatus(setSt);
  }, []);
  return st;
}

/** The narrator voices: one download, then they run on this computer. */
export function VoiceInstall({ st }: { st: VoiceStatus | null }) {
  const mb = (n: number): string => `${Math.round(n / 1e6)} MB`;
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 text-sm text-white/80">
          {!st ? 'Checking…' : st.installed ? 'Installed. Story reels are narrated on this computer; nothing is sent anywhere.' : st.installing ? `Downloading… ${mb(st.done)} of ${mb(st.total)}` : `Not installed. Story reels need it for narration (${mb(st.total)}, one time, every voice included).`}
        </div>
        {st && !st.installed && (
          <PrimaryButton disabled={st.installing} onClick={() => void window.marketo.voice.install()}>
            {st.installing ? `${Math.round((st.done / st.total) * 100)}%` : 'Download voices'}
          </PrimaryButton>
        )}
        {st?.installed && <Check className="h-5 w-5 text-emerald-300" />}
      </div>
      {st?.installing && (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-krypt-gradient" style={{ width: `${(st.done / st.total) * 100}%` }} />
        </div>
      )}
      {st?.error && <div className="text-xs text-rose-300">{st.error}</div>}
    </Card>
  );
}
