(() => {
  if (window.__ssbLoaded) return;
  window.__ssbLoaded = true;

  const IS_TOP = window === window.top;
  const HOST = location.hostname.replace(/^www\./, '');

  // Per-site "card" selectors, so a whole post/video tile gets blurred instead of one line.
  const SITE_CONTAINERS = [
    ['youtube.com', 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-playlist-renderer, ytd-radio-renderer, ytd-reel-item-renderer, ytd-comment-thread-renderer, ytd-comment-view-model, ytd-post-renderer, ytd-backstage-post-thread-renderer, ytd-channel-renderer, ytd-notification-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2'],
    ['reddit.com', 'shreddit-post, shreddit-comment, search-telemetry-tracker, faceplate-tracker[noun="post"], .thing, article'],
    ['x.com', 'article[data-testid="tweet"], [data-testid="trend"], [data-testid="UserCell"], [data-testid="cellInnerDiv"]'],
    ['twitter.com', 'article[data-testid="tweet"], [data-testid="trend"], [data-testid="UserCell"], [data-testid="cellInnerDiv"]'],
    ['facebook.com', '[role="article"]'],
    ['instagram.com', 'article, li'],
    ['tiktok.com', '[data-e2e="recommend-list-item-container"], [data-e2e="search_top-item"], [data-e2e="comment-level-1"], [data-e2e="user-post-item"]'],
    ['twitch.tv', '.chat-line__message, article, [data-a-target="side-nav-card"]'],
    ['google.', '.MjjYud, .g, g-inner-card, g-section-with-header, .WlydOe, .SoaBEf, article, li'],
    ['bing.com', 'li.b_algo, .news-card, li'],
    ['news.ycombinator.com', 'tr.athing, .comtr'],
    ['discord.com', 'li[id^="chat-messages"]']
  ];
  let siteSelector = null;
  for (const [h, sel] of SITE_CONTAINERS) {
    if (HOST === h || HOST.endsWith('.' + h) || (h.endsWith('.') && HOST.includes(h))) { siteSelector = sel; break; }
  }

  const GENERIC_CARD = 'article, [role="article"], li, tr, figure, blockquote, [role="listitem"], [role="option"], [role="row"]';
  const BLOCK_TAGS = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'TD', 'TH', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'FIGCAPTION', 'FIGURE', 'DD', 'DT', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'TR', 'UL', 'OL', 'TABLE']);
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'HEAD', 'TITLE', 'META', 'LINK', 'SSB-GUARD']);
  const ATTRS = ['alt', 'title', 'aria-label'];
  const ATTR_SEL = 'img[alt], [aria-label], [title]';
  const MEDIA_TAGS = new Set(['IMG', 'VIDEO', 'PICTURE', 'A', 'BUTTON']);

  let settings = { ...self.SSB_DEFAULTS };
  let re = null, loose = null;
  buildRegexes();
  let active = computeActive();
  let count = 0;
  const revealedText = new WeakMap();
  const allowedUrls = new Set();

  function buildRegexes() {
    re = self.SSB_buildRegex(settings.keywords, false);
    loose = self.SSB_buildRegex(settings.keywords, true);
  }

  function computeActive() {
    return !!(settings.enabled && re && !(settings.disabledSites || []).includes(HOST));
  }

  // ---------- matching ----------

  function test(str) {
    return !!(str && str.length > 1 && re && re.test(str));
  }
  function looseTest(str) {
    return !!(str && str.length > 1 && loose && loose.test(str));
  }

  function attrMatch(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && test(v)) return true;
    }
    return false;
  }

  function isSkippable(el) {
    if (!el || el.nodeType !== 1) return true;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.isContentEditable) return true;
    return false;
  }

  const walkerFilter = {
    acceptNode(n) {
      if (n.nodeType === 3) return NodeFilter.FILTER_ACCEPT;
      if (SKIP_TAGS.has(n.tagName) || n.hasAttribute('data-ssb') || n.hasAttribute('contenteditable')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_SKIP;
    }
  };

  // Nearest block-level ancestor, never climbing above `cap`.
  function nearestBlock(el, cap) {
    let n = el;
    while (n && n !== cap && !BLOCK_TAGS.has(n.tagName)) {
      const p = n.parentElement;
      if (!p || p === document.body || p === document.documentElement) break;
      n = p;
    }
    return n;
  }

  // A block's own inline text (nested blocks are checked on their own), built two ways:
  //  tight:  text nodes glued together, so "Leo<mark>nida</mark>" still reads "Leonida"
  //  spaced: a space between every text node, so "#GTA6<small>48K</small>" doesn't become
  //          "#GTA648K" (sites often style inline tags as separate lines)
  // A nested block or <br> always counts as a space. A block matches if either version does.
  const GAP_TAGS = new Set(['BR', 'HR', 'IMG']);
  function ownTexts(block) {
    let tight = '', spaced = '', gap = false;
    const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode(n) {
        if (n.nodeType === 3) return NodeFilter.FILTER_ACCEPT;
        if (SKIP_TAGS.has(n.tagName) || BLOCK_TAGS.has(n.tagName)) { gap = true; return NodeFilter.FILTER_REJECT; }
        if (GAP_TAGS.has(n.tagName)) gap = true;
        return NodeFilter.FILTER_SKIP;
      }
    });
    let t;
    while ((t = w.nextNode())) {
      tight += (gap ? ' ' : '') + t.nodeValue;
      spaced += ' ' + t.nodeValue;
      gap = false;
    }
    return [tight, spaced];
  }
  function blockTextMatches(block) {
    const [tight, spaced] = ownTexts(block);
    return test(tight) || test(spaced);
  }

  function blocksIn(root) {
    const blocks = new Set();
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, walkerFilter);
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeValue.trim().length < 2) continue;
      blocks.add(nearestBlock(n.parentElement, root));
    }
    return blocks;
  }

  function containsMatch(el) {
    if (attrMatch(el)) return true;
    for (const c of el.querySelectorAll(ATTR_SEL)) if (attrMatch(c)) return true;
    if (!looseTest(el.textContent)) return false;
    if (blockTextMatches(el)) return true;
    for (const b of blocksIn(el)) if (blockTextMatches(b)) return true;
    return false;
  }

  // ---------- choosing what to blur ----------

  function findContainer(el) {
    if (siteSelector) {
      const c = el.closest(siteSelector);
      if (c && c !== document.body) return c;
    }
    const card = el.closest(GENERIC_CARD);
    if (card && card !== document.body && (card.textContent || '').length < 1500) return card;

    // Climb to the nearest block element, then keep climbing while the block stays small,
    // so a headline + thumbnail tile gets covered as one unit.
    let node = el;
    while (node && !BLOCK_TAGS.has(node.tagName) && node.parentElement && node.parentElement !== document.body) {
      node = node.parentElement;
    }
    for (let i = 0; i < 5; i++) {
      if (node.querySelector('img, video, picture')) break;          // tile already includes its thumbnail
      const p = node.parentElement;
      if (!p || p === document.body || p === document.documentElement) break;
      if ((p.textContent || '').length > 300) break;                 // parent is a big text block
      if (p.querySelectorAll('img, video, picture').length > 1) break; // parent spans several tiles
      node = p;
    }
    return node;
  }

  function hide(container) {
    if (!container || container === document.body || container === document.documentElement) return;
    if (container.closest('[data-ssb]')) return;
    container.setAttribute('data-ssb', settings.mode === 'hide' ? 'hide' : 'blur');
    count++;
    scheduleReport();
  }

  function unhide(container) {
    const state = container.getAttribute('data-ssb');
    container.removeAttribute('data-ssb');
    revealedText.delete(container);
    if (state === 'blur' || state === 'hide') { count = Math.max(0, count - 1); scheduleReport(); }
  }

  function checkBlock(block) {
    if (!block || block.nodeType !== 1 || block.closest('[data-ssb], head, ssb-guard')) return;
    if (!looseTest(block.textContent)) return;
    if (!blockTextMatches(block)) return;
    hide(findContainer(block));
  }

  function handleAttrElement(el) {
    if (isSkippable(el) || !attrMatch(el)) return;
    if (el.closest('[data-ssb], head, ssb-guard')) return;
    // Don't blur a huge region just because its aria-label mentions a keyword.
    if (!MEDIA_TAGS.has(el.tagName) && (el.textContent || '').length > 300) return;
    hide(findContainer(el));
  }

  function scan(root) {
    if (!active || !root) return;
    if (root.nodeType === 3) {
      const p = root.parentElement;
      if (p && !isSkippable(p) && root.nodeValue.trim()) checkBlock(nearestBlock(p, null));
      return;
    }
    if (root.nodeType !== 1 || isSkippable(root) || root.closest('head, ssb-guard')) return;

    // Fast path: most inserted subtrees contain no keyword at all.
    if (looseTest(root.textContent)) {
      for (const b of blocksIn(root)) checkBlock(b);
    }
    if (root.matches(ATTR_SEL)) handleAttrElement(root);
    for (const el of root.querySelectorAll(ATTR_SEL)) handleAttrElement(el);
  }

  // Sites like YouTube recycle elements, so a blurred tile can get new, harmless content
  // (unblur it) and a revealed tile can get new spoiler content (blur it again).
  function recheck(container) {
    const state = container.getAttribute('data-ssb');
    if (!state) return;
    const matches = active && containsMatch(container);
    if (state === 'revealed') {
      if (!matches) unhide(container);
      else if (container.textContent !== revealedText.get(container)) { unhide(container); hide(container); }
    } else if (!matches) {
      unhide(container);
    }
  }

  // ---------- observer ----------

  function onMutations(records) {
    const roots = new Set();
    const attrEls = new Set();
    const toRecheck = new Set();
    for (const r of records) {
      if (r.type === 'childList') {
        for (const n of r.addedNodes) roots.add(n);
      } else if (r.type === 'characterData') {
        roots.add(r.target);
      } else if (r.type === 'attributes') {
        attrEls.add(r.target);
      }
      const base = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      const h = base && base.closest && base.closest('[data-ssb]');
      if (h) toRecheck.add(h);
    }
    for (const h of toRecheck) recheck(h);
    if (!active) return;
    for (const n of roots) {
      if (!n.isConnected) continue;
      // Skip nodes whose ancestor is already in this batch; scanning the ancestor covers them.
      let p = n.parentNode, covered = false;
      while (p) { if (roots.has(p)) { covered = true; break; } p = p.parentNode; }
      if (!covered) scan(n);
    }
    for (const el of attrEls) if (el.isConnected) handleAttrElement(el);
    if (IS_TOP && document.title !== lastTitle) checkPage();
  }

  const observer = new MutationObserver(onMutations);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS
  });

  // ---------- click to reveal ----------

  function onPointer(e) {
    const el = e.target && e.target.closest && e.target.closest('[data-ssb="blur"]');
    if (!el) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'click') {
      el.setAttribute('data-ssb', 'revealed');
      revealedText.set(el, el.textContent);
      count = Math.max(0, count - 1);
      scheduleReport();
    }
  }
  for (const t of ['pointerdown', 'mousedown', 'mouseup', 'click', 'auxclick', 'dblclick']) {
    window.addEventListener(t, onPointer, true);
  }

  // ---------- full-page guard ----------

  let lastTitle = null;
  let guardHost = null;

  function pageMatch() {
    const og = document.querySelector('meta[property="og:title"]');
    let path = '';
    try { path = decodeURIComponent(location.pathname).replace(/[-_/+]+/g, ' '); } catch (e) { path = location.pathname; }
    for (const s of [document.title, og && og.content, path]) {
      if (s && re) { const m = s.match(re); if (m) return m[0]; }
    }
    return null;
  }

  function checkPage() {
    if (!IS_TOP) return;
    lastTitle = document.title;
    const hit = active && settings.pageGuard && !allowedUrls.has(location.href) ? pageMatch() : null;
    if (hit) showGuard(hit); else removeGuard();
  }

  function showGuard(word) {
    if (guardHost) { guardHost.shadowRoot.querySelector('.kw').textContent = word; return; }
    guardHost = document.createElement('ssb-guard');
    const root = guardHost.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .wrap { position: fixed; inset: 0; z-index: 2147483647; background: #0c0c10; display: flex;
          align-items: center; justify-content: center; font: 15px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; color: #e8e8ee; }
        .card { max-width: 420px; padding: 32px; text-align: center; }
        .shield { width: 56px; height: 56px; margin: 0 auto 18px; }
        h1 { font-size: 22px; margin: 0 0 8px; font-weight: 650; }
        p { margin: 0 0 24px; color: #a0a0ad; }
        .kw { color: #fb7185; font-weight: 600; }
        .row { display: flex; gap: 10px; justify-content: center; }
        button { font: inherit; border: 0; border-radius: 10px; padding: 10px 18px; cursor: pointer; }
        .back { background: #e11d48; color: white; font-weight: 600; }
        .show { background: #23232b; color: #c8c8d2; }
        button:hover { filter: brightness(1.12); }
      </style>
      <div class="wrap"><div class="card">
        <svg class="shield" viewBox="0 0 24 24" fill="none"><path d="M12 2.5 4 5.5v6.2c0 4.7 3.3 8.6 8 9.8 4.7-1.2 8-5.1 8-9.8V5.5l-8-3Z" fill="#e11d48"/><path d="M8.5 12.5 11 15l4.5-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h1>Spoiler risk</h1>
        <p>This page looks like it's about <span class="kw"></span>. Spoiler Shield is covering it.</p>
        <div class="row"><button class="back">Get me out</button><button class="show">Show anyway</button></div>
      </div></div>`;
    root.querySelector('.kw').textContent = word;
    root.querySelector('.back').addEventListener('click', () => {
      if (history.length > 1) history.back();
      else chrome.runtime.sendMessage({ type: 'closeTab' });
    });
    root.querySelector('.show').addEventListener('click', () => {
      allowedUrls.add(location.href);
      removeGuard();
    });
    document.documentElement.appendChild(guardHost);
    pauseMedia();
  }

  function removeGuard() {
    if (guardHost) { guardHost.remove(); guardHost = null; }
  }

  function pauseMedia() {
    for (const v of document.querySelectorAll('video, audio')) { try { v.pause(); } catch (e) {} }
  }
  // Autoplaying video behind the guard gets paused.
  document.addEventListener('play', () => { if (guardHost) pauseMedia(); }, true);

  // ---------- reporting to the toolbar badge ----------

  let reportTimer = null;
  function scheduleReport() {
    if (!IS_TOP || reportTimer) return;
    reportTimer = setTimeout(() => {
      reportTimer = null;
      try { chrome.runtime.sendMessage({ type: 'count', count }); } catch (e) {}
    }, 250);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'getStatus' && IS_TOP) {
      sendResponse({ host: HOST, count, active });
    }
  });

  // ---------- settings ----------

  function resetAll() {
    for (const el of document.querySelectorAll('[data-ssb]')) {
      el.removeAttribute('data-ssb');
      revealedText.delete(el);
    }
    count = 0;
    scheduleReport();
    if (active && document.documentElement) scan(document.body || document.documentElement);
    checkPage();
  }

  function applySettings(s) {
    settings = { ...self.SSB_DEFAULTS, ...s };
    buildRegexes();
    active = computeActive();
    resetAll();
  }

  chrome.storage.sync.get(null, s => applySettings(s || {}));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    chrome.storage.sync.get(null, s => applySettings(s || {}));
  });

  // Anything already parsed before the observer started.
  if (document.body) scan(document.body);
  document.addEventListener('DOMContentLoaded', () => { scan(document.body); checkPage(); });
  // SPA navigations that keep the same title still change the URL.
  if (IS_TOP) {
    window.addEventListener('popstate', checkPage);
    let lastHref = location.href;
    setInterval(() => { if (location.href !== lastHref) { lastHref = location.href; checkPage(); } }, 500);
  }
})();
