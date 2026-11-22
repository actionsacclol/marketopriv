import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { Approval, BrowserStatus, ChatState, ChromeStatus, Db, KipState, MarketoApi, McpStatus, McpToolCall, UiFocus, VoiceStatus, WhisperStatus } from '../shared/types';

// The only seam between renderer and main. Every invoke here has a matching
// ipcMain.handle in electron/main.ts or electron/mcp/host.ts.

function sub<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: unknown, payload: T): void => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: MarketoApi = {
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    update: () => ipcRenderer.invoke('app:update'),
    profiles: () => ipcRenderer.invoke('profiles:list'),
    createProfile: (name, copySettings, copyKnowledge) => ipcRenderer.invoke('profiles:create', name, copySettings, copyKnowledge),
    renameProfile: (id, name) => ipcRenderer.invoke('profiles:rename', id, name),
    deleteProfile: (id) => ipcRenderer.invoke('profiles:delete', id),
    useProfile: (id) => ipcRenderer.invoke('profiles:use', id),
    setProfileAutopilot: (id, on) => ipcRenderer.invoke('profiles:autopilot', id, on),
    setProfileBackground: (id, on) => ipcRenderer.invoke('profiles:background', id, on),
    stopProfile: (id) => ipcRenderer.invoke('profiles:stop', id),
    startBackground: () => ipcRenderer.invoke('profiles:startBackground'),
    profilesMulti: () => ipcRenderer.invoke('profiles:multi'),
    setProfilesMulti: (on) => ipcRenderer.invoke('profiles:setMulti', on),
    restart: () => ipcRenderer.invoke('app:restart'),
    examples: () => ipcRenderer.invoke('app:examples'),
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
    showItemInFolder: (p) => ipcRenderer.invoke('app:showItemInFolder', p),
    openMediaFolder: (kind) => ipcRenderer.invoke('app:openMediaFolder', kind),
    openCampaignFolder: (title) => ipcRenderer.invoke('app:openCampaignFolder', title),
    resolveYtChannel: (input) => ipcRenderer.invoke('app:resolveYtChannel', input),
    exportLogs: () => ipcRenderer.invoke('app:exportLogs'),
    pickFile: (kind) => ipcRenderer.invoke('app:pickFile', kind),
    pickDirectory: () => ipcRenderer.invoke('app:pickDirectory'),
    copyText: (t) => ipcRenderer.invoke('app:copyText', t),
    mediaUrl: (p) => `marketo://media/${encodeURIComponent(p)}`,
    pathForFile: (file) => webUtils.getPathForFile(file),
  },
  db: {
    get: () => ipcRenderer.invoke('db:get'),
    onChanged: (cb) => sub<Db>('db:changed', cb),
    updateReel: (id, patch) => ipcRenderer.invoke('db:updateReel', id, patch),
    createReel: (preset, title, format) => ipcRenderer.invoke('db:createReel', preset, title, format),
    deleteLearning: (id) => ipcRenderer.invoke('db:deleteLearning', id),
    reelFeedback: (id, patch) => ipcRenderer.invoke('db:reelFeedback', id, patch),
    addTrainingNote: (note) => ipcRenderer.invoke('db:addTrainingNote', note),
    deleteTrainingNote: (id) => ipcRenderer.invoke('db:deleteTrainingNote', id),
    setTrainingTopic: (topic) => ipcRenderer.invoke('db:setTrainingTopic', topic),
    askBrief: () => ipcRenderer.invoke('db:askBrief'),
    duplicateReel: (id) => ipcRenderer.invoke('db:duplicateReel', id),
    deleteReel: (id) => ipcRenderer.invoke('db:deleteReel', id),
    deleteLongVideo: (id) => ipcRenderer.invoke('db:deleteLongVideo', id),
    deleteReels: (ids, trashFiles) => ipcRenderer.invoke('db:deleteReels', ids, trashFiles),
    updateSettings: (patch) => ipcRenderer.invoke('db:updateSettings', patch),
    deleteReference: (id) => ipcRenderer.invoke('db:deleteReference', id),
    saveAccount: (a) => ipcRenderer.invoke('db:saveAccount', a),
    addYtChannel: (from, link) => ipcRenderer.invoke('db:addYtChannel', from, link),
    setNextRun: (text) => ipcRenderer.invoke('db:setNextRun', text),
    saveStyle: (input) => ipcRenderer.invoke('db:saveStyle', input),
    deleteStyle: (id) => ipcRenderer.invoke('db:deleteStyle', id),
    queueRun: (text) => ipcRenderer.invoke('db:queueRun', text),
    unqueueRun: (id) => ipcRenderer.invoke('db:unqueueRun', id),
    moveQueued: (id, by) => ipcRenderer.invoke('db:moveQueued', id, by),
    queueIdea: (id) => ipcRenderer.invoke('db:queueIdea', id),
    dropIdea: (id) => ipcRenderer.invoke('db:dropIdea', id),
    deleteAccount: (id) => ipcRenderer.invoke('db:deleteAccount', id),
    markPosted: (id, site, url) => ipcRenderer.invoke('db:markPosted', id, site, url),
    saveCampaign: (input) => ipcRenderer.invoke('db:saveCampaign', input),
    deleteCampaign: (id) => ipcRenderer.invoke('db:deleteCampaign', id),
    setCampaignBanner: (id, source) => ipcRenderer.invoke('db:setCampaignBanner', id, source),
    setSubmission: (id, status) => ipcRenderer.invoke('db:setSubmission', id, status),
  },
  research: {
    docs: () => ipcRenderer.invoke('research:docs'),
    deleteNote: (file) => ipcRenderer.invoke('research:deleteNote', file),
  },
  voice: {
    model: () => ipcRenderer.invoke('voice:model'),
    status: () => ipcRenderer.invoke('voice:status'),
    onStatus: (cb) => sub<VoiceStatus>('voice:status', cb),
    install: () => ipcRenderer.invoke('voice:install'),
    find: (name) => ipcRenderer.invoke('voice:find', name),
    save: (name, data) => ipcRenderer.invoke('voice:save', name, data),
    saveVoice: (v) => ipcRenderer.invoke('voice:saveVoice', v),
    deleteVoice: (id) => ipcRenderer.invoke('voice:deleteVoice', id),
  },
  whisper: {
    status: () => ipcRenderer.invoke('whisper:status'),
    onStatus: (cb) => sub<WhisperStatus>('whisper:status', cb),
    install: () => ipcRenderer.invoke('whisper:install'),
  },
  browser: {
    status: () => ipcRenderer.invoke('browser:status'),
    onStatus: (cb) => sub<BrowserStatus[]>('browser:status', cb),
    open: (id, url, site) => ipcRenderer.invoke('browser:open', id, url, site),
    close: (id, site) => ipcRenderer.invoke('browser:close', id, site),
    ytChannels: (id) => ipcRenderer.invoke('browser:ytChannels', id),
  },
  refs: {
    add: (input) => ipcRenderer.invoke('refs:add', input),
    update: (id, patch) => ipcRenderer.invoke('refs:update', id, patch),
    delete: (id) => ipcRenderer.invoke('refs:delete', id),
  },
  perf: {
    get: () => ipcRenderer.invoke('perf:get'),
    set: (patch) => ipcRenderer.invoke('perf:set', patch),
    onChanged: (cb) => sub('perf:changed', cb),
    readout: () => ipcRenderer.invoke('perf:readout'),
    measure: () => ipcRenderer.invoke('perf:measure'),
    rendering: (on) => ipcRenderer.invoke('perf:rendering', on),
    renderTurn: () => ipcRenderer.invoke('perf:renderTurn'),
    renderDone: () => ipcRenderer.invoke('perf:renderDone'),
  },
  autopilot: {
    status: () => ipcRenderer.invoke('autopilot:status'),
    enable: (input) => ipcRenderer.invoke('autopilot:enable', input),
    disable: () => ipcRenderer.invoke('autopilot:disable'),
    setModel: (model) => ipcRenderer.invoke('autopilot:setModel', model),
    setSaver: (on) => ipcRenderer.invoke('autopilot:setSaver', on),
    setExtraRuns: (n) => ipcRenderer.invoke('autopilot:setExtraRuns', n),
    setTier: (tier) => ipcRenderer.invoke('autopilot:setTier', tier),
    runNow: () => ipcRenderer.invoke('autopilot:runNow'),
    openFolder: () => ipcRenderer.invoke('autopilot:openFolder'),
  },
  proxy: {
    list: () => ipcRenderer.invoke('proxy:list'),
    chromeRows: () => ipcRenderer.invoke('proxy:chromeRows'),
    save: (id, input) => ipcRenderer.invoke('proxy:save', id, input),
    check: (id) => ipcRenderer.invoke('proxy:check', id),
    acceptIp: (id) => ipcRenderer.invoke('proxy:acceptIp', id),
  },
  chrome: {
    status: () => ipcRenderer.invoke('chrome:status'),
    onStatus: (cb) => sub<ChromeStatus>('chrome:status', cb),
    open: (dir) => ipcRenderer.invoke('chrome:open', dir),
    scan: (dir) => ipcRenderer.invoke('chrome:scan', dir),
  },
  approvals: {
    list: () => ipcRenderer.invoke('approvals:list'),
    onChanged: (cb) => sub<Approval[]>('approvals:changed', cb),
    answer: (id, approve) => ipcRenderer.invoke('approvals:answer', id, approve),
  },
  brand: {
    save: (patch) => ipcRenderer.invoke('brand:save', patch),
  },
  kip: {
    state: () => ipcRenderer.invoke('kip:state'),
    onState: (cb) => sub<KipState>('kip:state', cb),
    send: (text) => ipcRenderer.invoke('kip:send', text),
    stop: () => ipcRenderer.invoke('kip:stop'),
    reset: () => ipcRenderer.invoke('kip:reset'),
  },
  agent: {
    state: () => ipcRenderer.invoke('agent:state'),
    onState: (cb) => sub<ChatState>('agent:state', cb),
    saveConfig: (patch, apiKey) => ipcRenderer.invoke('agent:saveConfig', patch, apiKey),
    models: () => ipcRenderer.invoke('agent:models'),
    send: (text) => ipcRenderer.invoke('agent:send', text),
    stop: () => ipcRenderer.invoke('agent:stop'),
    reset: () => ipcRenderer.invoke('agent:reset'),
  },
  clips: {
    fetch: (url, span) => ipcRenderer.invoke('clips:fetch', url, span),
    save: (bytes, name) => ipcRenderer.invoke('clips:save', bytes, name),
    check: (url, seconds, said) => ipcRenderer.invoke('clips:check', url, seconds, said),
  },
  screen: {
    toolClips: () => ipcRenderer.invoke('app:toolClips'),
    sources: () => ipcRenderer.invoke('screen:sources'),
    launch: (target) => ipcRenderer.invoke('screen:launch', target),
    save: (bytes, name) => ipcRenderer.invoke('screen:save', bytes, name),
  },
  eleven: {
    status: (refresh) => ipcRenderer.invoke('eleven:status', refresh),
    setKey: (key) => ipcRenderer.invoke('eleven:setKey', key),
    voices: () => ipcRenderer.invoke('eleven:voices'),
    addVoice: (input, name, owner) => ipcRenderer.invoke('eleven:addVoice', input, name, owner),
    library: (sort, useCase) => ipcRenderer.invoke('eleven:library', sort, useCase),
    tts: (req) => ipcRenderer.invoke('eleven:tts', req),
  },
  render: {
    save: (reelId, data, seconds, shape) => ipcRenderer.invoke('render:save', reelId, data, seconds, shape),
    saveImage: (reelId, png, t, shape) => ipcRenderer.invoke('render:saveImage', reelId, png, t, shape),
    saveLongThumb: (id, png) => ipcRenderer.invoke('render:saveLongThumb', id, png),
    saveLongFile: (id, name, data, section) => ipcRenderer.invoke('render:saveLongFile', id, name, data, section),
  },
  ui: {
    onFocus: (cb) => sub<UiFocus>('ui:focus', cb),
  },
  mcp: {
    status: () => ipcRenderer.invoke('mcp:status'),
    onStatus: (cb) => sub<McpStatus>('mcp:status', cb),
    setEnabled: (on) => ipcRenderer.invoke('mcp:setEnabled', on),
    clients: () => ipcRenderer.invoke('mcp:clients'),
    connect: (id) => ipcRenderer.invoke('mcp:connect', id),
    disconnect: (id) => ipcRenderer.invoke('mcp:disconnect', id),
    genericConfig: () => ipcRenderer.invoke('mcp:genericConfig'),
    serve: (run) => {
      const onCall = (_e: unknown, call: McpToolCall): void => {
        const progress = (fraction: number, message: string): void => ipcRenderer.send('mcp:progress', call.rid, fraction, message);
        void run(call, progress)
          .catch((e: unknown) => ({ ok: false, text: (e as Error)?.message ?? String(e) }))
          .then((result) => ipcRenderer.send('mcp:result', call.rid, result));
      };
      ipcRenderer.on('mcp:call', onCall);
      ipcRenderer.send('mcp:ready', true);
      return () => {
        ipcRenderer.removeListener('mcp:call', onCall);
        ipcRenderer.send('mcp:ready', false);
      };
    },
  },
};

contextBridge.exposeInMainWorld('marketo', api);
