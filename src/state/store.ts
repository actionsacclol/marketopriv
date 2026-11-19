import { create } from 'zustand';
import { setCustomStyles } from '@shared/styles';
import type { Approval, AutopilotStatus, BrowserStatus, ChatState, ChromeStatus, Db, KipState, McpStatus, PageId, ProfileInfo, Reel, RenderShape } from '@shared/types';
import { renderMp4 } from '../render/export';
import { ensureVoiceover } from '../render/voice';
import { setSayAs } from '@shared/pronounce';
import { setElevenNames } from '@shared/voice';

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
  /** Each account's Instagram session (built-in browser or the user's Chrome). */
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
  const apTimer = window.setInterval(() => {
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
    offs.forEach((o) => o());
  };
}

/** Read the autopilot's state (scheduled task, reports) into the store. */
export async function refreshAutopilot(): Promise<AutopilotStatus | null> {
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

/** Render a reel to MP4 and save it. One at a time; the UI and the agent share this. */
export async function renderReel(reel: Reel, onProgress?: (ratio: number, phase: string) => void, shape: RenderShape = 'vertical'): Promise<{ path: string; seconds: number; bytes: number }> {
  if (useApp.getState().job) throw new Error('A render is already running. Wait for it to finish.');
  cancelRender = false;
  const fps = useApp.getState().db?.settings.fps ?? 30;
  useApp.setState({ job: { reelId: reel.id, ratio: 0, phase: 'starting' } });
  try {
    // The final render is when paid voices (ElevenLabs) are bought (previews have no narration); if they can't be, it stops here.
    reel = await ensureVoiceover(
      reel,
      (phase) => {
        useApp.setState({ job: { reelId: reel.id, ratio: 0, phase } });
        onProgress?.(0, phase);
      },
      { final: true },
    );
    const { data, seconds } = await renderMp4(reel, {
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
    return { path: r.data, seconds, bytes: data.byteLength };
  } finally {
    useApp.setState({ job: null });
  }
}
