import { create } from 'zustand';
import { perfNow } from '../lib/perf';
import { setCustomStyles } from '@shared/styles';
import type { Approval, AutopilotStatus, BrowserStatus, ChatState, ChromeStatus, Db, KipState, McpStatus, PageId, ProfileInfo, Reel, RenderShape } from '@shared/types';
import { renderMp4 } from '../render/export';
import { ensureVoiceover } from '../render/voice';
import { setSayAs } from '@shared/pronounce';
import { setElevenNames } from '@shared/voice';
import { bannerOf } from '@shared/campaigns';

// Renderer state: a live mirror of the main-process DB, navigation, the render
// job and toasts. The DB is never edited here directly; changes go through
// window.marketo.db and come back via db:changed.

export interface Toast {
  id: number;
  kind: 'ok' | 'warn' | 'error';
  text: string;
}

export interface RenderJob {
  reelId: string;
  ratio: number;
  phase: string;
}

interface State {
  db: Db | null;
  page: PageId;
  selectedReel: string | null;
  /** The style page open on the Styles page (null = the grid). */
  selectedStyle: string | null;
  openStyle: (id: string | null) => void;
  /** Account shown on the Warming page (null = the active one). */
  selectedAccount: string | null;
  /** Each account's Instagram session (in the user's Chrome). */
  browser: BrowserStatus[];
  /** The Chrome extension: which Chrome profiles are connected. */
  chrome: ChromeStatus | null;
  /** What AIs are waiting for the user to allow (newest last). */
  approvals: Approval[];
  chat: ChatState | null;
  /** Kip's chat (the Kip page). */
  kip: KipState | null;
  mcp: McpStatus | null;
  /** Last autopilot status read (Windows takes a second or two to answer, so pages show this meanwhile). */
  autopilot: AutopilotStatus | null;
  /** The hub's profiles (complete, separate sets); one is open. */
  profiles: ProfileInfo[];
  job: RenderJob | null;
  /** A reference video being read right now. */
  refJob: { name: string; ratio: number; phase: string } | null;
  toasts: Toast[];
  /** The setup wizard is open (it also opens by itself until the brand is set up). */
  wizard: boolean;
  setWizard(on: boolean): void;
  go(page: PageId, reelId?: string): void;
  select(id: string | null): void;
  selectAccount(id: string | null): void;
  toast(kind: Toast['kind'], text: string): void;
  dismiss(id: number): void;
}

let toastId = 1;

export const useApp = create<State>((set) => ({
  db: null,
  page: 'dashboard',
  selectedReel: null,
  selectedStyle: null,
  openStyle: (id) => set({ selectedStyle: id }),
  selectedAccount: null,
  browser: [],
  chrome: null,
  approvals: [],
  chat: null,
  kip: null,
  mcp: null,
  autopilot: null,
  profiles: [],
  job: null,
  refJob: null,
  toasts: [],
  wizard: false,
  setWizard: (on) => set({ wizard: on }),
  // Going to Styles (the sidebar) always lands on the grid.
  go: (page, reelId) => set((s) => ({ page, selectedReel: reelId ?? s.selectedReel, selectedStyle: page === 'styles' ? null : s.selectedStyle })),
  select: (id) => set({ selectedReel: id }),
  selectAccount: (id) => set({ selectedAccount: id }),
  toast: (kind, text) => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => useApp.getState().dismiss(id), kind === 'error' ? 9000 : 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function initStore(): () => void {
  const api = window.marketo;
  void api.db.get().then((db) => {
    // A fresh install starts on Setup.
    setSayAs(db.settings.sayAs);
    setCustomStyles(db.customStyles);
    setElevenNames(db.settings.eleven?.voices ?? []);
    useApp.setState({ db, ...(db.brand.setupDone ? {} : { page: 'setup' as PageId }) });
  });
  void api.app.profiles().then((profiles) => useApp.setState({ profiles }));
  void api.mcp.status().then((mcp) => useApp.setState({ mcp }));
  void api.browser.status().then((browser) => useApp.setState({ browser }));
  void api.chrome.status().then((chrome) => useApp.setState({ chrome }));
  void api.approvals.list().then((approvals) => useApp.setState({ approvals }));
  void api.agent.state().then((chat) => useApp.setState({ chat }));
  void api.kip.state().then((kip) => useApp.setState({ kip }));
  void refreshAutopilot();
  // Each read starts processes in the main process (the scheduled task, the AI apps): while the window is hidden
  // (minimized, in the tray) one every 10 minutes is enough (the read also re-picks the day's run minutes, so it never
  // stops), and one as soon as it shows again.
  const onVisible = (): void => {
    if (!document.hidden) void refreshAutopilot();
  };
  document.addEventListener('visibilitychange', onVisible);
  const apTimer = window.setInterval(() => {
    if (document.hidden) {
      if (Date.now() - lastAutopilotRead >= HIDDEN_POLL_MS) void refreshAutopilot();
      return;
    }
    const ap = useApp.getState().autopilot;
    const soon = !!ap && (ap.running || (!!ap.task.nextRun && Math.abs(Date.parse(ap.task.nextRun) - Date.now()) < 5 * 60_000));
    if (soon || Date.now() % 60_000 < 15_000) void refreshAutopilot();
  }, 15_000);
  const offs = [
    api.db.onChanged((db) => {
      // Before the state changes: timing and cache keys read the list while rendering.
      setSayAs(db.settings.sayAs);
      setCustomStyles(db.customStyles);
      setElevenNames(db.settings.eleven?.voices ?? []);
      useApp.setState({ db });
    }),
    api.mcp.onStatus((mcp) => useApp.setState({ mcp })),
    api.browser.onStatus((browser) => useApp.setState({ browser })),
    api.chrome.onStatus((chrome) => useApp.setState({ chrome })),
    api.approvals.onChanged((approvals) => useApp.setState({ approvals })),
    api.agent.onState((chat) => useApp.setState({ chat })),
    api.kip.onState((kip) => useApp.setState({ kip })),
    api.ui.onFocus((f) => useApp.getState().go(f.page, f.reelId)),
  ];
  return () => {
    window.clearInterval(apTimer);
    document.removeEventListener('visibilitychange', onVisible);
    offs.forEach((o) => o());
  };
}

/** When the autopilot's state was last asked for, and how often while the window is hidden. */
let lastAutopilotRead = 0;
const HIDDEN_POLL_MS = 10 * 60_000;

/** Read the autopilot's state (scheduled task, reports) into the store. */
export async function refreshAutopilot(): Promise<AutopilotStatus | null> {
  lastAutopilotRead = Date.now();
  try {
    const autopilot = await window.marketo.autopilot.status();
    useApp.setState({ autopilot });
    return autopilot;
  } catch {
    return null;
  }
}

export const reelById = (id: string | null): Reel | undefined => (id ? useApp.getState().db?.reels.find((r) => r.id === id) : undefined);

let cancelRender = false;
export const cancelCurrentRender = (): void => {
  cancelRender = true;
};

type RenderResult = { path: string; seconds: number; bytes: number };
type RenderProgress = (ratio: number, phase: string) => void;
/** The render going now: the same one asked for again waits for it instead of being refused. */
let current: { key: string; done: Promise<RenderResult>; listeners: Set<RenderProgress> } | null = null;
const renderKey = (reel: Reel, shape: RenderShape): string => JSON.stringify([reel.id, shape, reel.updatedAt, reel.fields]);

/**
 * Render a reel to MP4 and save it. One at a time; the UI and the agent share this. The same reel, unchanged, asked for
 * again while it renders (an AI app whose call timed out tries again) waits for that render and gets its file.
 */
export async function renderReel(reel: Reel, onProgress?: RenderProgress, shape: RenderShape = 'vertical'): Promise<RenderResult> {
  const job = useApp.getState().job;
  if (current && current.key === renderKey(reel, shape)) {
    const same = current;
    if (onProgress) same.listeners.add(onProgress);
    try {
      return await same.done;
    } finally {
      if (onProgress) same.listeners.delete(onProgress);
    }
  }
  if (job) {
    const title = reelById(job.reelId)?.title;
    throw new Error(`A render is already running${title ? ` ("${title}", ${Math.round(job.ratio * 100)}%, ${job.phase})` : ''}. Wait for it to finish.`);
  }
  const listeners = new Set<RenderProgress>(onProgress ? [onProgress] : []);
  const done = renderNow(reel, (ratio, phase) => listeners.forEach((f) => f(ratio, phase)), shape);
  const mine = { key: renderKey(reel, shape), done, listeners };
  current = mine;
  try {
    return await done;
  } finally {
    if (current === mine) current = null;
  }
}

async function renderNow(reel: Reel, onProgress: RenderProgress, shape: RenderShape): Promise<RenderResult> {
  cancelRender = false;
  const fps = useApp.getState().db?.settings.fps ?? 30;
  useApp.setState({ job: { reelId: reel.id, ratio: 0, phase: 'starting' } });
  // Low-priority rendering (Setup > Performance): the hub's own processes step back while this runs.
  let turn = false;
  try {
    // One render at a time across profiles (Setup > Performance): wait for another profile's render to end.
    if (perfNow().oneRenderAtATime && window.marketo.perf) {
      for (;;) {
        if (cancelRender) throw new Error('Render cancelled.');
        const t = await window.marketo.perf.renderTurn();
        if (t.ok) break;
        const phase = `waiting for ${t.holder ?? 'another profile'}'s render`;
        useApp.setState({ job: { reelId: reel.id, ratio: 0, phase } });
        onProgress?.(0, phase);
        await new Promise((r) => setTimeout(r, 3000));
      }
      turn = true;
    }
    if (perfNow().lowPriorityRender) void window.marketo.perf?.rendering(true).catch(() => {});
    // The final render is when paid voices (ElevenLabs) are bought (previews have no narration); if they can't be, it stops here.
    reel = await ensureVoiceover(
      reel,
      (phase) => {
        useApp.setState({ job: { reelId: reel.id, ratio: 0, phase } });
        onProgress?.(0, phase);
      },
      { final: true },
    );
    const { data, seconds, bannerPath } = await renderMp4(reel, {
      fps,
      shape,
      cancelled: () => cancelRender,
      onProgress: (ratio, phase) => {
        useApp.setState({ job: { reelId: reel.id, ratio, phase } });
        onProgress?.(ratio, phase);
      },
    });
    const r = await window.marketo.render.save(reel.id, data, seconds, shape);
    if (!r.ok || !r.data) throw new Error(r.message ?? 'Saving the render failed.');
    // The campaign's banner was set or changed while this ran: the file has the old one (or none), so it is
    // not ready to post. Back to draft (the banner change only sent back reels already rendered), render again.
    const db = useApp.getState().db;
    const now = db?.reels.find((x) => x.id === reel.id);
    if (now && (bannerOf(now, db?.campaigns) ?? '').trim() !== bannerPath) {
      // (This copy of the db may not show the save's 'rendered' yet: anything not posted goes back.)
      if (now.status !== 'posted') await window.marketo.db.updateReel(reel.id, { status: 'draft' }).catch(() => undefined);
      throw new Error(`The campaign's ad banner changed while "${reel.title}" was rendering, so this file has the old one. Render it again.`);
    }
    return { path: r.data, seconds, bytes: data.byteLength };
  } finally {
    useApp.setState({ job: null });
    void window.marketo.perf?.rendering(false).catch(() => {});
    if (turn) void window.marketo.perf?.renderDone().catch(() => {});
  }
}
