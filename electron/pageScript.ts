// The script the built-in browser runs inside the Instagram page, in an
// isolated world (the page's own scripts can't see it). It turns what is on
// screen into numbered lines an AI can read without vision, and resolves a
// number back to the element when the AI wants to click it. Reading only:
// every click and keystroke is real input sent by the main process.
//
// Plain JS in a raw string: no backticks and no "${" in here.

const RAW = String.raw`
(() => {
  // A page left open across a hub update gets the new helpers (old numbered refs are dropped).
  if (window.__mk && window.__mk.v === '__MK_VERSION__') return;
  const INTER = 'a[href],button,input,textarea,select,summary,[role=button],[role=link],[role=textbox],[role=searchbox],[role=combobox],[role=menuitem],[role=menuitemradio],[role=tab],[role=checkbox],[role=radio],[role=switch],[role=option],[contenteditable=""],[contenteditable=true]';
  const FIELDS = 'textarea,input[type=text],input[type=search],input:not([type]),[contenteditable=""],[contenteditable=true],[role=textbox]';
  const M = { n: 0, els: new Map() };
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const hidden = (el) => { const s = getComputedStyle(el); return s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse'; };
  const inView = (r, m) => r.width > 1 && r.height > 1 && r.bottom > -m && r.top < innerHeight + m && r.right > 0 && r.left < innerWidth;

  // Open shadow roots (web-component apps such as X Chat): look through them like the rest of the page.
  /** The innermost element at a point, through shadow roots. */
  const deepAt = (x, y) => { let t = document.elementFromPoint(x, y); while (t && t.shadowRoot) { const i = t.shadowRoot.elementFromPoint(x, y); if (!i || i === t) break; t = i; } return t; };
  /** a contains b, across shadow boundaries. */
  const within = (a, b) => { for (let n = b; n; n = n.parentNode || n.host) if (n === a) return true; return false; };
  /** Every element matching sel in the page and in its shadow roots. */
  function deepAll(sel, root) {
    const r = root || document;
    const out = [...r.querySelectorAll(sel)];
    for (const h of r.querySelectorAll('*')) if (h.shadowRoot) out.push(...deepAll(sel, h.shadowRoot));
    return out;
  }
  /** The focused element, inside shadow roots too. */
  const deepActive = () => { let a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; return a; };
  /** An element's rendered children: its shadow tree if it has one, a slot's assigned nodes, else its own children. */
  const kidsOf = (el) => {
    if (el.shadowRoot) return [...el.shadowRoot.childNodes];
    if (el.tagName === 'SLOT') { const a = el.assignedNodes({ flatten: true }); return a.length ? a : [...el.childNodes]; }
    return [...el.childNodes];
  };

  function roleOf(el) {
    const r = el.getAttribute('role');
    if (r) return r;
    const t = el.tagName.toLowerCase();
    if (t === 'a') return 'link';
    if (t === 'button' || t === 'summary') return 'button';
    if (t === 'textarea') return 'textbox';
    if (t === 'select') return 'combobox';
    if (t === 'input') {
      const ty = (el.type || 'text').toLowerCase();
      if (ty === 'checkbox' || ty === 'radio') return ty;
      if (ty === 'submit' || ty === 'button') return 'button';
      if (ty === 'file') return 'file';
      return 'textbox';
    }
    if (el.isContentEditable) return 'textbox';
    return t;
  }

  function nameOf(el) {
    const t = el.tagName.toLowerCase();
    let n = el.getAttribute('aria-label') || '';
    if (!n) {
      const ids = el.getAttribute('aria-labelledby');
      if (ids) n = ids.split(/\s+/).map((i) => { const x = document.getElementById(i); return x ? x.textContent : ''; }).join(' ');
    }
    if (!n && (t === 'input' || t === 'textarea')) {
      n = el.getAttribute('placeholder') || '';
      if (!n && el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) n = l.textContent; }
      if (!n) { const l = el.closest('label'); if (l) n = l.textContent; }
      if (!n && (el.type === 'submit' || el.type === 'button')) n = el.value;
      if (!n) n = el.getAttribute('name') || '';
    }
    const field = t === 'input' || t === 'textarea' || t === 'select' || el.isContentEditable;
    if (!n && el.isContentEditable) n = el.getAttribute('aria-placeholder') || el.getAttribute('placeholder') || '';
    if (!n && !field) n = el.innerText;
    n = clean(n);
    // A button whose only text is a count (Threads' like / reply buttons show "3"): the icon inside says what it is
    // ("Like" or "Unlike"), so name it "Like 3".
    const countOnly = !field && /^[0-9][0-9.,]*\s*[KMB]?$/i.test(n) && !el.getAttribute('aria-label');
    if ((!n || countOnly) && !field) {
      const d = el.querySelector('[aria-label],img[alt],svg title');
      const label = d ? clean(d.getAttribute('aria-label') || d.getAttribute('alt') || d.textContent) : '';
      if (label) n = countOnly ? label + ' ' + n : label;
    }
    if (!n) n = clean(el.getAttribute('title'));
    return n;
  }

  const valueOf = (el) => { const t = el.tagName.toLowerCase(); return t === 'input' || t === 'textarea' || t === 'select' ? String(el.value || '') : clean(el.innerText); };

  function onTop(el, r) {
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
    const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const t = deepAt(x, y);
    if (!t || within(el, t) || within(t, el)) return true;
    // A suggestion list (hashtags, mentions, search) floats over the box being typed in and its layer catches the
    // hit test across the dialog: what is under it is still there and still clickable, so it is not hidden from the list.
    const lb = [...document.querySelectorAll('[role=listbox]')].find((l) => !within(l, el) && !hidden(l));
    if (!lb) return false;
    const layer = lb.closest('#layers > div') || lb;
    return within(layer, t) && !within(layer, el);
  }

  /** The handle Instagram shows as signed in (the "Profile" link in its own navigation). */
  function whoami() {
    for (const a of document.querySelectorAll('a[href^="/"]')) {
      const m = /^\/([A-Za-z0-9._]{1,30})\/$/.exec(a.getAttribute('href') || '');
      if (!m) continue;
      if (clean(a.innerText) === 'Profile') return m[1];
      const img = a.querySelector('img[alt]');
      if (img && img.alt.toLowerCase() === m[1].toLowerCase() + "'s profile picture") {
        const r = a.getBoundingClientRect();
        const nav = a.closest('nav,[role=navigation]');
        if (nav || r.left < 90 || r.top > innerHeight - 70) { if (!a.closest('article,main,[role=main],[role=dialog]')) return m[1]; }
      }
    }
    return null;
  }

  /** YouTube Studio: the channel it is working in (its id is in every Studio URL) and the name in its side bar. */
  function channel() {
    if (!/(^|\.)youtube\.com$/i.test(location.hostname)) return null;
    const m = /\/channel\/(UC[A-Za-z0-9_-]{20,24})/.exec(location.pathname);
    let name = '';
    const n = document.querySelector('#entity-name,ytcp-navigation-drawer .entity-name,[id=entity-name]');
    if (n) name = clean(n.textContent);
    return { id: m && /^studio\./i.test(location.hostname) ? m[1] : '', name: cut(name, 80) };
  }

  const onX = () => /(^|\.)(x|twitter)\.com$/i.test(location.hostname);

  /** X: the handle signed in (its own Profile link in the side navigation). */
  function whoamiX() {
    const a = document.querySelector('a[data-testid=AppTabBar_Profile_Link]');
    const m = a && /^\/([A-Za-z0-9_]{1,15})$/.exec(a.getAttribute('href') || '');
    return m ? m[1] : null;
  }

  /** X: the post an element belongs to, and who wrote it. */
  function postOfX(el) {
    const art = el.closest('article');
    let url = '';
    let creator = '';
    if (/^\/[A-Za-z0-9_]{1,15}\/status\/\d+/.test(location.pathname) && (!art || !art.closest('[role=dialog]'))) url = location.origin + location.pathname.replace(/^(\/[^/]+\/status\/\d+).*$/, '$1');
    if (art) {
      const t = art.querySelector('a[href*="/status/"] time');
      const link = t ? t.closest('a') : null;
      if (link) url = link.href.replace(/^(https:\/\/[^/]+\/[^/]+\/status\/\d+).*$/, '$1');
      const who = art.querySelector('[data-testid=User-Name] a[href^="/"]');
      const m = who && /^\/([A-Za-z0-9_]{1,15})$/.exec(who.getAttribute('href') || '');
      if (m) creator = '@' + m[1];
    } else {
      const m = /^\/([A-Za-z0-9_]{1,15})(\/|$)/.exec(location.pathname);
      if (m && !/^(home|explore|search|notifications|messages|settings|i|compose)$/i.test(m[1])) creator = '@' + m[1];
    }
    return { url: url || location.href, creator };
  }

  const onTt = () => /(^|\.)tiktok\.com$/i.test(location.hostname);

  /** TikTok: the handle signed in (its own Profile link in the side navigation). */
  function whoamiTt() {
    let a = document.querySelector('a[data-e2e=nav-profile]');
    if (!a) a = [...document.querySelectorAll('a[href^="/@"]')].find((x) => /^profile$/i.test(nameOf(x))) || null;
    const m = a && /^\/@([A-Za-z0-9._]{2,24})\/?$/.exec((a.getAttribute('href') || '').split('?')[0]);
    return m ? m[1] : null;
  }

  /** TikTok: the video an element belongs to, and who made it. */
  function postOfTt(el) {
    let url = '';
    let creator = '';
    const vm = /^\/@([A-Za-z0-9._]+)\/(video|photo)\/\d+/.exec(location.pathname);
    const box = el.closest('article,[data-e2e=recommend-list-item-container],[data-e2e=search_top-item],[data-e2e=user-post-item]');
    if (box) {
      const v = box.querySelector('a[href*="/video/"],a[href*="/photo/"]');
      if (v) url = v.href.split('?')[0];
      const who = box.querySelector('[data-e2e=video-author-uniqueid]');
      if (who && clean(who.textContent)) creator = '@' + clean(who.textContent).replace(/^@/, '');
      else {
        const l = box.querySelector('a[href^="/@"]');
        const m = l && /^\/@([A-Za-z0-9._]+)/.exec(l.getAttribute('href') || '');
        if (m) creator = '@' + m[1];
      }
    }
    if (!url && vm) url = location.origin + location.pathname.replace(/^(\/@[^/]+\/(video|photo)\/\d+).*$/, '$1');
    if (!creator && vm) creator = '@' + vm[1];
    if (!creator) {
      const m = /^\/@([A-Za-z0-9._]+)\/?$/.exec(location.pathname);
      if (m) creator = '@' + m[1];
    }
    return { url: url || location.href, creator };
  }

  const onFb = () => /(^|\.)facebook\.com$/i.test(location.hostname);
  const onTh = () => /(^|\.)threads\.(com|net)$/i.test(location.hostname);
  const onPin = () => /(^|\.)pinterest\.(com|co\.uk|ca|com\.au|de|fr|es|it|jp|com\.mx|pt|at|ch|ie|nz|se|dk|cl|co\.kr|ph)$/i.test(location.hostname);
  const onYt = () => /(^|\.)youtube\.com$/i.test(location.hostname) && !/^studio\./i.test(location.hostname);

  /** youtube.com: a Short's channel is the /@handle link in the channel bar nearest the element (none when unclear). */
  function postOfYt(el) {
    for (let e = el, i = 0; e && i < 14; e = e.parentElement, i++) {
      if (!e.querySelectorAll) continue;
      const bars = [...e.querySelectorAll('yt-reel-channel-bar-view-model a[href^="/@"]')];
      if (!bars.length) continue;
      const handles = [...new Set(bars.map((a) => (/^\/@([\w.-]+)/.exec(a.getAttribute('href') || '') || [])[1]).filter(Boolean))];
      return { url: location.href, creator: handles.length === 1 ? '@' + handles[0] : '' };
    }
    return { url: location.href, creator: '' };
  }

  /** Threads: the handle signed in (its own Profile link in the side navigation). */
  function whoamiTh() {
    for (const a of document.querySelectorAll('a[href^="/@"]')) {
      const m = /^\/@([A-Za-z0-9._]{1,30})\/?$/.exec((a.getAttribute('href') || '').split('?')[0]);
      if (!m || a.closest('article,[role=dialog],[data-pressable-container]')) continue;
      if (/^profile$/i.test(nameOf(a)) || (a.closest('nav,[role=navigation]') && /profile/i.test(nameOf(a) + ' ' + (a.querySelector('svg[aria-label]') || { getAttribute: () => '' }).getAttribute('aria-label')))) return m[1];
    }
    return null;
  }

  /** Threads: the thread an element belongs to, and who wrote it. */
  function postOfTh(el) {
    let url = '';
    let creator = '';
    const box = el.closest('[data-pressable-container],article');
    const link = box && box.querySelector('a[href*="/post/"]');
    if (link) {
      const m = /^\/@([A-Za-z0-9._]+)\/post\/([A-Za-z0-9_-]+)/.exec(link.getAttribute('href') || '');
      if (m) { url = location.origin + '/@' + m[1] + '/post/' + m[2]; creator = '@' + m[1]; }
    }
    const pm = /^\/@([A-Za-z0-9._]+)(\/post\/[A-Za-z0-9_-]+)?/.exec(location.pathname);
    if (!url && pm && pm[2]) url = location.origin + pm[0];
    if (!creator && pm) creator = '@' + pm[1];
    return { url: url || location.href, creator };
  }

  /** Pinterest: the profile signed in (the avatar link in the header). */
  function whoamiPin() {
    let a = document.querySelector('[data-test-id=header-profile] a[href],a[data-test-id=header-profile]');
    if (!a) a = [...document.querySelectorAll('a[href]')].find((x) => /^(your profile|profile)$/i.test(nameOf(x))) || null;
    const href = a ? (a.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0] : '';
    const m = /^\/([A-Za-z0-9_]{3,30})\/?(_created\/|_saved\/)?$/.exec(href);
    return m && !/^(ideas|today|search|pin|settings|business|login|_)/i.test(m[1]) ? m[1] : null;
  }

  /** Pinterest: the Pin an element belongs to. */
  function postOfPin(el) {
    const pm = /^\/pin\/([A-Za-z0-9_-]+)/.exec(location.pathname);
    const card = el.closest('[data-test-id=pin],[data-grid-item],[role=listitem]');
    const link = card && card.querySelector('a[href*="/pin/"]');
    const url = link ? link.href.split('?')[0] : pm ? location.origin + pm[0] + '/' : location.href;
    return { url, creator: '' };
  }

  /** TikTok's security check (a slider puzzle or "verify it's you") is showing. */
  function captcha() {
    const el = document.querySelector('#captcha-verify-container-main-page,#tiktok-verify-ele,.captcha_verify_container,[id*=captcha-verify],[class*=captcha_verify],[class*=captcha-verify]');
    if (!el || hidden(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 40 && r.height > 40;
  }

  /** The element's own name for itself: X's data-testid, TikTok's data-e2e (TikTok puts it on the icon inside the button). */
  function idOf(el) {
    if (onPin()) return el.getAttribute('data-test-id') || (el.closest('[data-test-id]') || { getAttribute: () => '' }).getAttribute('data-test-id') || '';
    if (onTt()) {
      const own = el.getAttribute('data-e2e');
      if (own) return own;
      const inner = el.querySelector('[data-e2e]');
      if (inner) return inner.getAttribute('data-e2e') || '';
      const up = el.parentElement && el.parentElement.closest('[data-e2e]');
      return up ? up.getAttribute('data-e2e') || '' : '';
    }
    return el.getAttribute('data-testid') || (el.closest('[data-testid]') || { getAttribute: () => '' }).getAttribute('data-testid') || '';
  }

  /**
   * The thread a comment, reply or message from this element goes into (the per-thread cap counts by it): a DM page's
   * chat; on X and Threads the post at the top of the conversation on screen (a back-and-forth is many posts, one
   * conversation); elsewhere the post itself.
   */
  function threadOf(el, post) {
    const p = location.pathname;
    // Direct messages: the chat open on the page.
    if (/^\/(direct|messages|i\/chat|inbox|latest\/inbox)(\/|$)/i.test(p) || /(^|\.)messenger\.com$/i.test(location.hostname)) {
      const q = new URLSearchParams(location.search);
      const id = q.get('u') || q.get('selected_item_id') || q.get('thread_id') || q.get('asset_id') || '';
      const tt = onTt() ? document.querySelector('[data-e2e=chat-uniqueid],[data-e2e=chat-nickname]') : null;
      return location.origin + p.replace(/\/$/, '') + (id ? '#' + id : '') + (tt ? '#@' + clean(tt.textContent).replace(/^@/, '') : '');
    }
    // On the account's own post every commenter is their own thread (2 each), so it can still answer many people.
    const mine = (root, rootBy, who, me) => (me && rootBy && rootBy.toLowerCase() === me.toLowerCase() && who && who.toLowerCase() !== rootBy.toLowerCase() ? root + '#' + who.toLowerCase() : root);
    if (onX()) {
      const dlg = el.closest('[role=dialog]');
      if (dlg || /^\/[A-Za-z0-9_]{1,15}\/status\/\d+/.test(p)) {
        const scope = dlg || document.querySelector('[data-testid=primaryColumn]') || document;
        const arts = [...scope.querySelectorAll('article')].filter((a) => a.querySelector('a[href*="/status/"] time'));
        const by = (a) => { const w = a && a.querySelector('[data-testid=User-Name] a[href^="/"]'); const m = w && /^\/([A-Za-z0-9_]{1,15})$/.exec(w.getAttribute('href') || ''); return m ? m[1] : ''; };
        if (arts.length) {
          const root = arts[0].querySelector('a[href*="/status/"] time').closest('a').href.replace(/^(https:\/\/[^/]+\/[^/]+\/status\/\d+).*$/, '$1');
          // Who is being answered: the post this element sits in, else the last one in the reply dialog, else the page's.
          const who = el.closest('article') ? by(el.closest('article')) : dlg ? by(arts[arts.length - 1]) : (post.creator || '').replace(/^@/, '');
          return mine(root, by(arts[0]), who, whoamiX());
        }
      }
      return post.url;
    }
    if (onTh() && /^\/@[^/]+\/post\//.test(p)) {
      for (const a of document.querySelectorAll('[data-pressable-container] a[href*="/post/"]')) {
        const m = /^\/@([A-Za-z0-9._]+)\/post\/([A-Za-z0-9_-]+)/.exec(a.getAttribute('href') || '');
        if (m) return mine(location.origin + '/@' + m[1] + '/post/' + m[2], m[1], (post.creator || '').replace(/^@/, ''), whoamiTh());
      }
    }
    return post.url;
  }

  /** How many words the post around an element has (its reading time; 0 when no post is found). */
  function postWords(el) {
    const box = el.closest('article, [role=article], [data-pressable-container="true"], [data-test-id="pin"], [data-grid-item="true"]');
    const text = box ? clean(box.innerText || '') : '';
    return text ? Math.min(400, text.split(' ').length) : 0;
  }

  /** The post an element belongs to (for the session log): its link and creator. */
  function postOf(el) {
    if (onX()) return postOfX(el);
    if (onTt()) return postOfTt(el);
    if (onTh()) return postOfTh(el);
    if (onPin()) return postOfPin(el);
    if (onFb()) return { url: location.href, creator: '' };
    if (onYt()) return postOfYt(el);
    const art = el.closest('article') || el.closest('[role=dialog]') || document;
    let url = '';
    const link = art.querySelector('a[href*="/p/"],a[href*="/reel/"],a[href*="/reels/"]');
    if (/\/(p|reel|reels)\/[A-Za-z0-9_-]+/.test(location.pathname)) url = location.href;
    else if (link) url = link.href;
    let creator = '';
    for (const a of art.querySelectorAll('a[href^="/"]')) {
      const m = /^\/([A-Za-z0-9._]{1,30})\/$/.exec(a.getAttribute('href') || '');
      if (m && clean(a.innerText).toLowerCase() === m[1].toLowerCase()) { creator = '@' + m[1]; break; }
    }
    return { url: url || location.href, creator };
  }

  function snap(full) {
    M.els = new Map();
    M.n = 0;
    const lines = [];
    let chars = 0, more = 0;
    const maxLines = full ? 420 : 260, maxChars = full ? 26000 : 14000;
    const margin = full ? 1e7 : 0;
    const push = (s) => { if (lines.length >= maxLines || chars > maxChars) { more++; return; } lines.push(s); chars += s.length + 1; };

    let root = document.body, modal = null;
    // An alert dialog ("Save post?", "Discard?") can be a zero-size wrapper around its visible box: its contents decide.
    const sized = (d) => { const r = d.getBoundingClientRect(); return r.width > 40 && r.height > 40; };
    const dialogs = [...document.querySelectorAll('[role=dialog],[role=alertdialog],dialog[open]')].filter((d) => !hidden(d) && (sized(d) || (d.getAttribute('role') === 'alertdialog' && [...d.querySelectorAll('div')].some(sized))));
    if (dialogs.length) {
      const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      modal = dialogs.reverse().find((d) => d.getAttribute('aria-modal') === 'true' || (top && d.contains(top))) || null;
      if (modal) root = modal;
    }

    function emit(el, r) {
      const role = roleOf(el);
      const name = nameOf(el);
      const tag = el.tagName.toLowerCase();
      const field = role === 'textbox' || role === 'searchbox' || role === 'combobox';
      if (!name && !field && role !== 'checkbox' && role !== 'radio' && role !== 'switch') return;
      const id = ++M.n;
      M.els.set(id, el);
      let s = '[' + id + '] ' + role + ' "' + cut(name, 90) + '"';
      if (field) {
        const v = clean(valueOf(el));
        if (v) s += el.type === 'password' ? ' value=(hidden)' : ' value="' + cut(v, 140) + '"';
      }
      if (tag === 'a') {
        const h = (el.getAttribute('href') || '').replace(/^https?:\/\/((www|studio|m|mobile)\.)?(instagram|youtube|x|twitter)\.com/, '');
        if (h && h !== '#') s += ' -> ' + cut(h, 70);
      }
      const st = [];
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') st.push('disabled');
      if (el.getAttribute('aria-pressed') === 'true') st.push('pressed');
      if (el.getAttribute('aria-selected') === 'true') st.push('selected');
      const ex = el.getAttribute('aria-expanded');
      if (ex) st.push(ex === 'true' ? 'expanded' : 'collapsed');
      if ((role === 'checkbox' || role === 'radio' || role === 'switch') && (el.checked || el.getAttribute('aria-checked') === 'true')) st.push('checked');
      if (deepActive() === el) st.push('focused');
      if (st.length) s += ' (' + st.join(', ') + ')';
      push(s);
    }

    function media(el) {
      const out = [];
      const list = el.matches('img,video') ? [el] : el.querySelectorAll('img[alt],video');
      for (const m of list) {
        if (m.tagName === 'IMG') { const a = clean(m.alt); if (a && a.length > 3) out.push('image: ' + cut(a, 200)); }
        else if (isFinite(m.duration) && m.duration > 0) out.push('video ' + (m.paused ? 'paused' : 'playing') + ' ' + Math.floor(m.currentTime) + 's of ' + Math.round(m.duration) + 's' + (m.muted ? ', muted' : ''));
      }
      return out;
    }

    const anyShadow = [...document.querySelectorAll('*')].some((e) => e.shadowRoot);
    const memo = new Map();
    const rootHas = (root) => !!root.querySelector(INTER) || [...root.querySelectorAll('*')].some((h) => h.shadowRoot && rootHas(h.shadowRoot));
    /** Anything clickable or typeable inside el (through shadow roots). */
    const hasI = (el) => {
      if (!anyShadow) return !!el.querySelector(INTER);
      let v = memo.get(el);
      if (v === undefined) {
        v = (el.shadowRoot ? rootHas(el.shadowRoot) : false) || rootHas(el);
        memo.set(el, v);
      }
      return v;
    };

    function walk(el, inside) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'svg' || tag === 'template') return;
      if (hidden(el)) return;
      if (tag === 'slot' || getComputedStyle(el).display === 'contents') {
        for (const c of kidsOf(el)) {
          if (c.nodeType === 1) walk(c, inside);
          else if (c.nodeType === 3 && !inside) { const t = clean(c.nodeValue); if (t) push(cut(t, 300)); }
        }
        return;
      }
      const r = el.getBoundingClientRect();
      if (tag === 'iframe') {
        if (!inside && inView(r, margin) && r.width > 150 && r.height > 150) {
          let host = '';
          try { host = new URL(el.src, location.href).hostname; } catch (e) { host = ''; }
          push('frame' + (host ? ' from ' + host : '') + ': its content is in a separate frame and is not listed here');
        }
        return;
      }
      if (!full && r.height > 0 && (r.bottom < -1500 || r.top > innerHeight + 1500)) return;
      const role = el.getAttribute('role') || '';

      if (el.matches(INTER)) {
        if (inView(r, margin) && (full || onTop(el, r))) emit(el, r);
        for (const c of el.children) walk(c, true);
        return;
      }
      if (!inside && inView(r, margin)) {
        if (tag === 'article' || role === 'article') push('--- post ---');
        else if (role === 'alert' || role === 'status') { const t = clean(el.innerText); if (t) { push('notice: ' + cut(t, 300)); return; } }
      }
      if (!el.shadowRoot && !hasI(el)) {
        if (inside || !inView(r, margin)) return;
        const t = clean(el.innerText);
        const head = /^h[1-4]$/.test(tag) || role === 'heading';
        if (t) push((head ? '## ' : '') + cut(t, full ? 1500 : 500));
        for (const m of media(el)) push(m);
        return;
      }
      for (const c of kidsOf(el)) {
        if (c.nodeType === 1) walk(c, inside);
        else if (c.nodeType === 3 && !inside) { const t = clean(c.nodeValue); if (t && inView(r, margin)) push(cut(t, 300)); }
      }
    }
    walk(root, false);
    // Suggestion lists and menus opened from a dialog are often rendered outside it (a portal on <body>):
    // list the ones on top of the page too.
    if (modal) {
      const pops = [];
      for (const c of document.body.children) {
        if (c === modal || c.contains(modal) || modal.contains(c) || hidden(c)) continue;
        const rr = c.getBoundingClientRect();
        if (rr.width < 40 || rr.height < 20) continue;
        const cands = c.matches('[role=listbox],[role=menu]') ? [c] : [...c.querySelectorAll('[role=listbox],[role=menu]')];
        if (!cands.length) {
          const hit = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, rr.left + rr.width / 2)), Math.min(innerHeight - 1, Math.max(0, rr.top + Math.min(rr.height, 200) / 2)));
          if (hit && c.contains(hit) && c.querySelector(INTER)) cands.push(c);
        }
        for (const p of cands) if (!pops.some((q) => q.contains(p))) pops.push(p);
      }
      for (const p of pops.slice(0, 3)) {
        push('--- popup ---');
        walk(p, false);
      }
    }

    const se = document.scrollingElement || document.documentElement;
    return {
      url: location.href,
      title: document.title,
      y: Math.round(se.scrollTop),
      max: Math.max(0, Math.round(se.scrollHeight - innerHeight)),
      w: innerWidth,
      h: innerHeight,
      modal: modal ? (cut(clean(modal.getAttribute('aria-label') || (modal.querySelector('h1,h2,[role=heading]') || {}).textContent || ''), 60) || 'dialog') : '',
      lang: document.documentElement.lang || '',
      me: /(^|\.)instagram\.com$/i.test(location.hostname) ? whoami() : onX() ? whoamiX() : onTt() ? whoamiTt() : onTh() ? whoamiTh() : onPin() ? whoamiPin() : null,
      captcha: onTt() ? captcha() : false,
      channel: channel(),
      lines,
      more,
    };
  }

  /** Where to click for a numbered element, and what it is (the main process decides whether the click is allowed). */
  function target(ref) {
    const el = M.els.get(ref);
    if (!el || !el.isConnected) return { gone: true };
    let r = el.getBoundingClientRect();
    if (r.top < 50 || r.bottom > innerHeight - 10) { el.scrollIntoView({ block: 'center', inline: 'nearest' }); r = el.getBoundingClientRect(); }
    if (r.width < 1 || r.height < 1) return { gone: true };
    const onIt = (px, py) => { const h = deepAt(px, py); return !h || within(el, h) || within(h, el); };
    let x = r.left + r.width * (0.35 + Math.random() * 0.3);
    let y = r.top + r.height * (0.35 + Math.random() * 0.3);
    let top = deepAt(x, y);
    // Something floats over that spot (X's Messages / Grok panels sit over the Post button in a short window): bring
    // the element to the middle of the screen, then click any spot of it that is really on top. Covered only when no
    // part of it can be reached.
    if (!onIt(x, y)) {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      r = el.getBoundingClientRect();
      const spots = [];
      for (const fy of [0.5, 0.3, 0.7, 0.15, 0.85]) for (const fx of [0.5, 0.3, 0.7, 0.15, 0.85]) spots.push([r.left + r.width * fx, r.top + r.height * fy]);
      const free = spots.find(([px, py]) => px >= 0 && py >= 0 && px < innerWidth && py < innerHeight && onIt(px, py));
      if (free) [x, y] = free;
      else [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
      top = deepAt(x, y);
    }
    const covered = top && !(within(el, top) || within(top, el));
    const tag = el.tagName.toLowerCase();
    const role = roleOf(el);
    const dlg = el.closest('[role=dialog],dialog');
    const texts = deepAll(FIELDS)
      .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 1 && b.height > 1 && e.type !== 'password'; })
      .map((e) => ({ name: nameOf(e), value: clean(valueOf(e)), dlg: !!e.closest('[role=dialog],dialog') }))
      .filter((t) => t.value && !/search/i.test(t.name));
    const post = postOf(el);
    return {
      x, y,
      name: nameOf(el),
      role,
      tag,
      type: (el.type || '').toLowerCase(),
      href: tag === 'a' ? el.href : '',
      covered: covered ? cut(nameOf(top) || top.tagName.toLowerCase(), 60) : '',
      dialog: dlg ? clean(dlg.getAttribute('aria-label') || (dlg.querySelector('h1,h2,[role=heading]') || {}).textContent || '') : '',
      dialogText: dlg ? cut(clean(dlg.innerText), 400) : '',
      testid: idOf(el),
      words: postWords(el),
      pressed: el.getAttribute('aria-pressed') === 'true',
      texts,
      editable: role === 'textbox' || role === 'searchbox' || role === 'combobox',
      value: role === 'textbox' || role === 'searchbox' || role === 'combobox' ? clean(valueOf(el)) : '',
      lang: document.documentElement.lang || '',
      url: location.href,
      postUrl: post.url,
      creator: post.creator,
      thread: threadOf(el, post),
    };
  }

  /** Mark the file picker that belongs to a numbered element (inside it, or in the nearest box around it). */
  function markFile(ref) {
    const el = M.els.get(ref);
    if (!el || !el.isConnected) return false;
    for (const old of document.querySelectorAll('[data-mk-pick]')) old.removeAttribute('data-mk-pick');
    let box = el;
    for (let i = 0; i < 7 && box; i++, box = box.parentElement) {
      const inputs = box.matches('input[type=file]') ? [box] : [...box.querySelectorAll('input[type=file]')];
      if (inputs.length === 1) { inputs[0].setAttribute('data-mk-pick', '1'); return true; }
      if (inputs.length > 1) return false;
    }
    return false;
  }

  /**
   * The number of the first visible, enabled control whose name matches (a button the main process presses itself,
   * such as an uploader's "Add Video"). 0 when there is none.
   */
  function byName(src) {
    const re = new RegExp(src, 'i');
    for (const el of deepAll(INTER)) {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true' || hidden(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || !re.test(nameOf(el))) continue;
      const id = ++M.n;
      M.els.set(id, el);
      return id;
    }
    return 0;
  }

  /** Select all text in a field (input, textarea or rich editor) so the next Backspace empties it. */
  function selectAll(ref) {
    const el = M.els.get(ref);
    if (!el || !el.isConnected) return false;
    if (typeof el.select === 'function') { el.focus(); el.select(); return true; }
    const ed = el.isContentEditable ? el : el.querySelector('[contenteditable=true],[contenteditable=""]');
    if (!ed) return false;
    ed.focus();
    const range = document.createRange();
    range.selectNodeContents(ed);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  /** The element's name now (to see whether Like became Unlike). */
  function nameNow(ref) {
    const el = M.els.get(ref);
    return el && el.isConnected ? nameOf(el) : null;
  }

  /** What has the keyboard focus (Enter in a text box can submit it). */
  function focus() {
    const el = deepActive();
    if (!el || el === document.body) return { editable: false };
    const role = roleOf(el);
    const editable = role === 'textbox' || role === 'searchbox' || role === 'combobox';
    const name = nameOf(el);
    const dlg = el.closest('[role=dialog],dialog');
    const post = postOf(el);
    return {
      editable,
      name,
      value: editable ? clean(valueOf(el)) : '',
      search: role === 'searchbox' || /search/i.test(name + ' ' + (el.type || '')),
      multiline: el.tagName === 'TEXTAREA' || el.isContentEditable,
      dialog: dlg ? clean(dlg.getAttribute('aria-label') || '') : '',
      url: location.href,
      postUrl: post.url,
      creator: post.creator,
      thread: threadOf(el, post),
      lang: document.documentElement.lang || '',
    };
  }

  window.__mk = { v: '__MK_VERSION__', snap, target, nameNow, focus, captcha, selectAll, markFile, byName };
})();
`;

/** djb2 of the script, so a changed script replaces the copy already in an open page. */
function version(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export const PAGE_SCRIPT = RAW.split('__MK_VERSION__').join(version(RAW));
