// The Krypt Marketo Chrome extension (resources/extension) and the native
// messaging host Chrome launches to reach the hub.

/**
 * Extension ids the hub accepts. The first is the unpacked build: its id is
 * fixed by the "key" in resources/extension/manifest.json. A Chrome Web Store
 * listing gets its own id; add it here when there is one.
 */
export const CHROME_EXT_IDS = ['bmelfallppaddlejniaapmofnfeccagc'];

/** Native messaging host name (the extension's background.js uses the same one). */
export const CHROME_HOST_NAME = 'cc.krypt.marketo';
