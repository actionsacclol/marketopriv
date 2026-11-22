import { ExternalLink, Play } from 'lucide-react';
import { PROXY_CHEAP_NOTE, PROXY_CHEAP_URL, PROXY_GUIDE_THUMB, PROXY_GUIDE_URL } from '@shared/brand';
import { Card, Page, PrimaryButton } from '../components/ui';
import { MultiRunBoard } from '../components/Profiles';
import { ChromeProxies } from '../components/ChromeProxies';
import { usePerf } from '../lib/perf';

const open = (url: string): void => void window.marketo.app.openExternal(url);

// Multi run: for running many accounts. Every profile (a separate set of accounts) on one line with its autopilot
// switch, its own proxy and its window; all of them at once in their own windows if the user wants.
export default function MultiRun() {
  const perChrome = usePerf().proxyPerChrome;
  return (
    <Page title="Multi run" subtitle="Separate sets of accounts, each with its own proxy, run one at a time or all at once.">
      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-5">
          <button
            onClick={() => open(PROXY_GUIDE_URL)}
            title="Opens on YouTube in your browser"
            className="group relative flex aspect-video w-44 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40"
          >
            {/* No internet: the picture hides and the play button stays. */}
            <img src={PROXY_GUIDE_THUMB} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/30 transition group-hover:bg-krypt-purple">
              <Play className="h-4 w-4 translate-x-px fill-current" />
            </span>
          </button>
          <div className="min-w-[260px] flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Proxies</p>
            <p className="mt-1 text-sm text-white/90">
              After about three sets of accounts, give each profile its own static residential (ISP) IP. On Proxy-Cheap, pick Static Residential (ISP), Dedicated: one IP per profile, then
              put its details in that profile's Proxy below.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <PrimaryButton onClick={() => open(PROXY_CHEAP_URL)}>
                <ExternalLink className="h-4 w-4" /> Get static residential IPs
              </PrimaryButton>
              <button onClick={() => open(PROXY_GUIDE_URL)} className="text-sm font-semibold text-krypt-purple hover:underline">
                Watch the setup guide
              </button>
            </div>
            <p className="mt-2 text-[11px] text-krypt-muted">Proxy-Cheap referral link: {PROXY_CHEAP_NOTE}.</p>
          </div>
        </div>
      </Card>
      {perChrome && <ChromeProxies />}
      <MultiRunBoard />
    </Page>
  );
}
