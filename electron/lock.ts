import { app, Menu } from 'electron';

// Light protection for the installed app. It is not a vault: it keeps the
// casual routes into the app's code shut (developer tools, debugging switches,
// a swapped code file), nothing more. A copy run from the source folder is
// left open, so development works as before.
//
// The rest of it is set at build time in package.json ("electronFuses"): the
// app only starts from its own app.asar, that file is checked against a hash
// stored in the exe, and --inspect / NODE_OPTIONS are ignored.

/** True for the installed app, false for a copy run from source. */
export const locked = app.isPackaged;

/** Switches that open the app to a debugger or switch off the page's protections. */
const REFUSED = ['inspect', 'inspect-brk', 'inspect-port', 'inspect-publish-uid', 'remote-debugging-port', 'remote-debugging-pipe', 'remote-debugging-address', 'remote-allow-origins', 'js-flags', 'disable-web-security', 'allow-running-insecure-content'];

/** The installed app was started with a debugging switch: it should not run that way. */
export function startedForDebugging(): boolean {
  if (!locked) return false;
  const given = process.argv.slice(1).map((a) => a.toLowerCase());
  return REFUSED.some((s) => app.commandLine.hasSwitch(s) || given.some((a) => a === `--${s}` || a.startsWith(`--${s}=`)));
}

const DEV_KEYS = new Set(['i', 'j', 'c']);

/** No developer tools in any window of the installed app: no menu entry, no shortcut, and closed at once if one opens anyway. */
export function lockWindows(): void {
  if (!locked) return;
  // The default menu is where "Toggle Developer Tools" and "Reload" live. macOS keeps the menus it needs for copy and paste.
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
  app.on('web-contents-created', (_e, wc) => {
    wc.on('devtools-opened', () => wc.closeDevTools());
    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      const key = input.key.toLowerCase();
      if (key === 'f12' || ((input.control || input.meta) && (input.shift || input.alt) && DEV_KEYS.has(key))) e.preventDefault();
    });
  });
}
