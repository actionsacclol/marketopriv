// Glue between the MCP server (index.ts), the main-process store tools
// (tools.ts) and the renderer that previews/renders reels
// (src/render/agentTools.ts via window.marketo.mcp.serve).

import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { McpStatus, McpToolResult, UiFocus } from '../../shared/types';
import { startMcp, type McpHandle, type ToolOutcome } from './index';
import { MAIN_HANDLERS, TOOLS, checkRendererArgs } from './tools';
import { connectClient, disconnectClient, genericConfig, installCommand, listClients } from './clients';
import * as instance from '../instance';

interface HostDeps {
  getMainWindow: () => BrowserWindow | null;
  showMainWindow: () => BrowserWindow;
  focus: (f: UiFocus) => void;
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => void;
  log: (level: 'info' | 'warn' | 'error', message: string) => void;
  /** Added to the pipe name so a development copy doesn't collide with the installed hub. */
  pipeSuffix?: string;
  /** An autopilot run is working right now (checked on every Kip call: a run can start in the middle of his message). */
  runGoing?: () => boolean;
}

const READY_TIMEOUT_MS = 30_000;

/** What belongs to an autopilot run while it works: Kip is refused these until it ends (his instructions say the same). */
const RUN_ONLY = (name: string): boolean => name.startsWith('browser_') || name === 'get_today' || name === 'mark_posted' || name === 'render_reel';

/**
 * Claude Code refuses a tool result over 25,000 tokens (MAX_MCP_OUTPUT_TOKENS), and every AI pays for it in full: a read
 * tool's text is cut well before that (the lists put the newest first, so the oldest go).
 */
const READ_TEXT_CAP = 60_000;
const capRead = (r: ToolOutcome): ToolOutcome =>
  r.text.length > READ_TEXT_CAP ? { ...r, text: `${r.text.slice(0, READ_TEXT_CAP)}\n… (${(r.text.length - READ_TEXT_CAP).toLocaleString('en-US')} more characters left out: ask for less, with a limit, an offset or one item)` } : r;

function shimPath(): string | null {
  const p = app.isPackaged ? path.join(process.resourcesPath, 'resources', 'mcp', 'marketo-mcp.cjs') : path.join(app.getAppPath(), 'resources', 'mcp', 'marketo-mcp.cjs');
  return fs.existsSync(p) ? p : null;
}

export async function startAgentHost(deps: HostDeps): Promise<McpHandle | null> {
  let readyFor: number | null = null;
  const readyWaiters: Array<() => void> = [];
  let nextRid = 1;
  const pending = new Map<number, { resolve: (r: ToolOutcome) => void; progress: (f: number, m: string) => void; wc: number }>();

  const failPending = (wcId: number, why: string): void => {
    for (const [rid, p] of pending) {
      if (p.wc !== wcId) continue;
      pending.delete(rid);
      p.resolve({ ok: false, text: why });
    }
  };

  ipcMain.on('mcp:ready', (e, on: boolean) => {
    const wc = e.sender;
    if (on) {
      readyFor = wc.id;
      readyWaiters.splice(0).forEach((f) => f());
      const reset = (): void => {
        if (readyFor === wc.id) readyFor = null;
        failPending(wc.id, 'Krypt Marketo reloaded while running this tool. Retry it.');
      };
      wc.once('did-start-loading', reset);
      wc.once('render-process-gone', reset);
      wc.once('destroyed', reset);
    } else if (readyFor === wc.id) {
      readyFor = null;
    }
  });
  ipcMain.on('mcp:result', (_e, rid: number, result: McpToolResult) => {
    const p = pending.get(rid);
    if (!p) return;
    pending.delete(rid);
    p.resolve({ ok: !!result?.ok, text: String(result?.text ?? ''), images: result?.images });
  });
  ipcMain.on('mcp:progress', (_e, rid: number, fraction: number, message: string) => {
    pending.get(rid)?.progress(Number(fraction), String(message ?? ''));
  });

  const executor = async (): Promise<BrowserWindow> => {
    const win = deps.getMainWindow() ?? deps.showMainWindow();
    if (readyFor !== null && readyFor === win.webContents.id) return win;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('The hub window didn\'t become ready in time. Retry in a moment.')), READY_TIMEOUT_MS);
      readyWaiters.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
    return win;
  };

  const exe = process.execPath;
  const shim = shimPath();
  // Unpackaged: electron.exe + the app folder relaunches a *built* hub. In
  // dev-server mode there's nothing standalone to launch.
  const devServer = !!process.env.VITE_DEV_SERVER_URL;
  const appExePath = app.isPackaged ? exe : devServer ? null : exe;
  // Another profile's window (multi-instance mode) is started again as itself.
  const appArgs = [...(app.isPackaged || devServer ? [] : [app.getAppPath()]), ...(instance.INSTANCE ? [`--profile=${instance.INSTANCE}`] : [])];
  const cmd = installCommand(exe, shim);

  const broadcast = (s: McpStatus): void => {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('mcp:status', s);
  };

  let handle: McpHandle | null = null;
  try {
    handle = await startMcp({
      userData: app.getPath('userData'),
      pipeSuffix: deps.pipeSuffix,
      version: app.getVersion(),
      shimPath: shim,
      exePath: exe,
      appExePath,
      appArgs,
      installCommand: cmd,
      isEnabled: deps.isEnabled,
      onStatus: broadcast,
      log: deps.log,
      runTool: async (name, args, client, onProgress, signal) => {
        const def = TOOLS.find((t) => t.name === name);
        if (!def) return { ok: false, text: `Unknown tool ${name}` };
        if (client === 'Kip' && RUN_ONLY(name) && deps.runGoing?.())
          return { ok: false, text: `An autopilot run is working in this hub right now and ${name} belongs to it (the browser tabs, today's plan, posting, rendering). Do not call browser_*, get_today, mark_posted or render_reel until the run ends; tell the user this part has to wait for the run to end. Reading numbers, the queue, ideas, styles and settings is fine.` };
        try {
          if (def.where === 'main') {
            const r = await MAIN_HANDLERS[name](args as never, { focus: client === 'Kip' && name !== 'show' ? () => undefined : deps.focus, client });
            return def.kind === 'read' ? capRead(r) : r;
          }
          checkRendererArgs(name, args);
        } catch (e) {
          return { ok: false, text: (e as Error).message };
        }
        const win = await executor();
        const rid = nextRid++;
        return new Promise<ToolOutcome>((resolve) => {
          pending.set(rid, { resolve, progress: onProgress, wc: win.webContents.id });
          signal.addEventListener('abort', () => !win.isDestroyed() && win.webContents.send('mcp:cancel', rid), { once: true });
          win.webContents.send('mcp:call', { rid, tool: name, args, client });
        });
      },
    });
  } catch (e) {
    deps.log('error', `MCP: failed to start: ${(e as Error).message}`);
  }

  const emptyStatus = (): McpStatus => ({ enabled: deps.isEnabled(), listening: false, error: 'The agent server failed to start (see the log).', clients: [], activity: [], shimPath: shim, exePath: exe, toolCount: 0, installCommand: cmd });
  ipcMain.handle('mcp:status', () => handle?.status() ?? emptyStatus());
  ipcMain.handle('mcp:setEnabled', (_e, on: boolean) => {
    deps.setEnabled(!!on);
    const s = handle?.status() ?? emptyStatus();
    broadcast(s);
    return s;
  });
  ipcMain.handle('mcp:clients', () => listClients(exe, shim));
  ipcMain.handle('mcp:connect', (_e, id: string) => connectClient(String(id), exe, shim));
  ipcMain.handle('mcp:disconnect', (_e, id: string) => disconnectClient(String(id)));
  ipcMain.handle('mcp:genericConfig', () => genericConfig(exe, shim));
  return handle;
}
