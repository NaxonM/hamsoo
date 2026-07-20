(() => {
  'use strict';

  if (globalThis.__hamsooLoaded) return;
  globalThis.__hamsooLoaded = true;

  const api = globalThis.browser ?? globalThis.chrome ?? null;
  const hasAPI = Boolean(api && api.storage && api.runtime);
  const ROOT = document.documentElement;
  const CUSTOM_PREFIX = 'custom:';

  // Built-in fonts are loaded lazily via the FontFace API (only the selected one),
  // instead of declaring five @font-face rules that browsers may prefetch.
  const BUILTIN_FONT_FILES = {
    // Variable fonts (Vazirmatn, Estedad, Sahel) use '100 900' descriptor range.
    // Static faces (Shabnam, Samim, Gandom) use 'normal' with faux-bold synthesis.
    Vazirmatn: { file: 'fonts/Vazirmatn.woff2', format: 'woff2', weight: '100 900' },
    Estedad: { file: 'fonts/Estedad.woff2', format: 'woff2', weight: '100 900' },
    Sahel: { file: 'fonts/Sahel.woff2', format: 'woff2', weight: '100 900' },
    Shabnam: { file: 'fonts/Shabnam.woff2', format: 'woff2', weight: 'normal' },
    Samim: { file: 'fonts/Samim.woff2', format: 'woff2', weight: 'normal' },
    Gandom: { file: 'fonts/Gandom.woff2', format: 'woff2', weight: 'normal' }
  };

  const SITE_HOSTS = {
    'chatgpt.com': 'chatgpt',
    'claude.ai': 'claude',
    'gemini.google.com': 'gemini',
    'chat.deepseek.com': 'deepseek',
    'grok.com': 'grok',
    'perplexity.ai': 'perplexity',
    'www.perplexity.ai': 'perplexity',
    'copilot.microsoft.com': 'copilot',
    'aistudio.google.com': 'aistudio',
    'chat.qwen.ai': 'qwen',
    'www.kimi.com': 'kimi',
    'kimi.moonshot.cn': 'kimi',
    'poe.com': 'poe',
    'notebooklm.google.com': 'notebooklm'
  };

  const DEFAULT_SITES = {
    chatgpt: true, claude: true, gemini: true, deepseek: true,
    grok: true, perplexity: true, copilot: true,
    aistudio: true, qwen: true, kimi: true, poe: true,
    notebooklm: true
  };

  const DEFAULTS = Object.freeze({
    enabled: true,
    fontEnabled: true,
    readabilityEnabled: true,
    digitsEnabled: false,
    punctuationFixEnabled: true,
    font: 'Vazirmatn',
    fontSize: 15,
    lineHeight: 1.9,
    fontWeight: 400,
    letterSpacing: 0,
    textAlign: 'start',
    maxWidth: 0,
    customFonts: [],
    shortcut: 'Alt+Shift+R',
    sites: DEFAULT_SITES,
    customSites: [],
    siteOverrides: {}
  });

  const RTL_RE = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

  // Unicode bidi format controls; stripped from pasted text so a field's stored
  // direction cannot be silently corrupted by embedded overrides.
  const BIDI_CONTROL_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

  // Only blocks with strong programming signals stay LTR; mixed prose like
  // "VM = \u06a9\u0644\u0627\u0633" is treated as text, not code.
  const REAL_CODE_RE = /(^|\n)\s*(const|let|var|function|func|fn|class|struct|enum|impl|trait|import|export|from|require|module|if|elif|else|for|while|do|switch|case|return|try|catch|except|finally|throw|raise|def|lambda|async|await|public|private|protected|static|void|new|package|interface|namespace|using|echo|print|println|printf|select|insert|update|delete)\b|[{};]|=>|->|::|&&|\|\||===|!==|(^|\s)\/\/|\/\*|#include|#!|<\/?[a-z][\s\S]*?>|\b(console\.log|System\.out|printf|println)\b/i;

  // Semantic/structural selectors are load-bearing; class selectors are bonus
  // coverage that survives vendor CSS refactors failing gracefully.
  const SELECTOR = [
    'p', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'td', 'th', 'summary', 'figcaption',
    '[data-message-author-role="assistant"]',
    '[data-message-author-role="user"]',
    'textarea', 'input[type="text"]', 'input[type="search"]',
    '[contenteditable="true"]',
    '.markdown', '.prose', '.message-content', '.query-content',
    '.whitespace-pre-wrap', '.response-content-markdown',
    // NotebookLM renders its doc/source/note text inside custom Angular
    // element tags (not standard <p>/<li>), so target them explicitly. These
    // are harmless on other sites: an element is only styled when its own text
    // actually contains RTL characters.
    'paragraph-element-view', 'heading-element-view', 'list-item-element-view',
    'mat-card-content'
  ].join(',');

  const EDITABLE_SELECTOR = 'textarea, input[type="text"], input[type="search"], [contenteditable="true"]';

  let settings = null;
  let active = false;
  let debounceTimer = 0;
  let maxWaitTimer = 0;
  // Rescans are debounced by FLUSH_DEBOUNCE_MS, but never delayed past
  // FLUSH_MAX_WAIT_MS. Continuous token streaming fires mutations faster than
  // the debounce window, which would keep resetting the timer and starve the
  // flush until the stream paused; the max-wait cap guarantees streamed text
  // still gets styled promptly.
  const FLUSH_DEBOUNCE_MS = 100;
  const FLUSH_MAX_WAIT_MS = 500;
  const pendingRoots = new Set();

  // Per-element text signature cache: elements whose text has not changed are
  // skipped entirely on rescans, which keeps token-streaming cheap on long threads.
  let textCache = new WeakMap();

  let loadedFontKey = '';
  let loadedFace = null;

  function siteKey() {
    const host = location.hostname;
    if (SITE_HOSTS[host]) return SITE_HOSTS[host];
    for (const h of Object.keys(SITE_HOSTS)) {
      if (host.endsWith('.' + h)) return SITE_HOSTS[h];
    }
    return null;
  }

  const SITE = siteKey();

  function normalize(value) {
    const raw = value && typeof value === 'object' ? value : {};
    const rawSites = raw.sites && typeof raw.sites === 'object' ? raw.sites : {};
    const sites = {};
    for (const key of Object.keys(DEFAULT_SITES)) sites[key] = rawSites[key] !== false;
    let font = typeof raw.font === 'string' ? raw.font : DEFAULTS.font;
    if (!font.startsWith(CUSTOM_PREFIX) && !(font in BUILTIN_FONT_FILES)) font = DEFAULTS.font;
    const rawOverrides = raw.siteOverrides && typeof raw.siteOverrides === 'object' ? raw.siteOverrides : {};
    const siteOverrides = {};
    for (const okey of Object.keys(rawOverrides)) {
      const ov = rawOverrides[okey];
      if (!ov || typeof ov !== 'object') continue;
      const clean = {};
      if (typeof ov.font === 'string' && (ov.font.startsWith(CUSTOM_PREFIX) || ov.font in BUILTIN_FONT_FILES)) {
        clean.font = ov.font;
      }
      if (ov.fontSize != null) clean.fontSize = HamsooUtil.clampSize(ov.fontSize);
      if (ov.lineHeight != null) clean.lineHeight = HamsooUtil.clampLineHeight(ov.lineHeight);
      if (ov.fontWeight != null) clean.fontWeight = HamsooUtil.clampWeight(ov.fontWeight);
      if (ov.letterSpacing != null) clean.letterSpacing = HamsooUtil.clampLetterSpacing(ov.letterSpacing);
      if (ov.textAlign != null) clean.textAlign = HamsooUtil.normalizeAlign(ov.textAlign);
      if (ov.maxWidth != null) clean.maxWidth = HamsooUtil.clampMeasure(ov.maxWidth);
      clean.enabled = ov.enabled !== false;
      if (Object.keys(clean).length) siteOverrides[okey] = clean;
    }
    return {
      enabled: raw.enabled !== false,
      fontEnabled: raw.fontEnabled !== false,
      readabilityEnabled: raw.readabilityEnabled !== false,
      digitsEnabled: raw.digitsEnabled === true,
      punctuationFixEnabled: raw.punctuationFixEnabled !== false,
      font,
      fontSize: HamsooUtil.clampSize(raw.fontSize),
      lineHeight: HamsooUtil.clampLineHeight(raw.lineHeight),
      fontWeight: HamsooUtil.clampWeight(raw.fontWeight),
      letterSpacing: HamsooUtil.clampLetterSpacing(raw.letterSpacing),
      textAlign: HamsooUtil.normalizeAlign(raw.textAlign),
      maxWidth: HamsooUtil.clampMeasure(raw.maxWidth),
      customFonts: Array.isArray(raw.customFonts) ? raw.customFonts : [],
      shortcut: typeof raw.shortcut === 'string' ? raw.shortcut : DEFAULTS.shortcut,
      sites,
      customSites: Array.isArray(raw.customSites) ? raw.customSites : [],
      siteOverrides
    };
  }

  function isActive(current) {
    if (!current || !current.enabled) return false;
    // On unlisted hosts, being injected at all is the user's explicit opt-in
    // (they granted permission and registered the site from the popup).
    if (!SITE) return true;
    return current.sites[SITE] !== false;
  }

  function textOf(el) {
    if ((el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') && typeof el.value === 'string') {
      return el.value;
    }
    // textContent avoids the forced layout that innerText triggers.
    return el.textContent || '';
  }

  function mark(el, value) {
    if (el.getAttribute('data-hamsoo') !== value) el.setAttribute('data-hamsoo', value);
  }

  function unmark(el) {
    if (el.hasAttribute('data-hamsoo')) el.removeAttribute('data-hamsoo');
  }

  // Cheap ancestor check that replaces getComputedStyle in the hot path:
  // covers sites that set dir="rtl" plus our own marks.
  function inRTLContext(el) {
    const anchor = el.parentElement || el;
    return Boolean(anchor.closest('[dir="rtl"], [data-hamsoo="rtl"], [data-hamsoo-box="rtl"]'));
  }

  // Flip the whole table/list when every item is RTL, so column order and
  // bullet side render correctly — but never for mixed-language containers.
  function promoteContainer(el) {
    const box = el.closest('table, ul, ol');
    if (!box || box.getAttribute('data-hamsoo-box') === 'rtl') return;
    const kids = box.querySelectorAll(box.tagName === 'TABLE' ? 'td, th' : 'li');
    if (!kids.length) return;
    for (const kid of kids) {
      if (!RTL_RE.test(textOf(kid))) return;
    }
    box.setAttribute('data-hamsoo-box', 'rtl');
  }

  function signature(text) {
    return text.length + ':' + (text.charCodeAt(0) || 0) + ':' + (text.charCodeAt(text.length - 1) || 0);
  }

  const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  // Opt-in: rewrite Latin digits to Persian inside RTL prose only. Skips code,
  // inputs, and editable regions so it never corrupts snippets or user typing.
  function persianizeDigits(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !/[0-9]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest('pre, code, textarea, input, [contenteditable="true"]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    for (const node of nodes) {
      node.nodeValue = node.nodeValue.replace(/[0-9]/g, d => PERSIAN_DIGITS[d]);
    }
  }

  // Punctuation helper: give RTL editable fields dir="auto" so neutral
  // punctuation lands correctly while typing. Tracked with data-hamsoo-dir so
  // it can be cleared again when the feature is turned off.
  function applyEditableDir(el) {
    if (settings.punctuationFixEnabled) {
      if (el.getAttribute('dir') !== 'auto') {
        el.setAttribute('dir', 'auto');
        el.setAttribute('data-hamsoo-dir', '');
      }
    } else if (el.hasAttribute('data-hamsoo-dir')) {
      el.removeAttribute('dir');
      el.removeAttribute('data-hamsoo-dir');
    }
  }

  function classify(el) {
    const text = textOf(el);
    const sig = signature(text);
    if (textCache.get(el) === sig) return;
    textCache.set(el, sig);

    if (el.closest('pre')) return;

    if (RTL_RE.test(text)) {
      mark(el, 'rtl');
      if (el.matches(EDITABLE_SELECTOR)) applyEditableDir(el);
      if (settings.digitsEnabled && !el.matches(EDITABLE_SELECTOR)) persianizeDigits(el);
      if (el.matches('td, th, li')) promoteContainer(el);
    } else if (text.trim() && inRTLContext(el)) {
      // Pure-LTR element inside an RTL ambient context: force strict LTR so
      // neutral punctuation does not jump to the wrong end of the line.
      mark(el, 'ltr');
    } else {
      unmark(el);
    }
  }

  // Structural code hints from the DOM: syntax-highlighter classes or language
  // data attributes on the <pre> or its inner <code>. Complements REAL_CODE_RE
  // so fenced/highlighted blocks are recognized even before a keyword appears.
  function hasCodeAttrs(el) {
    if (!(el instanceof Element)) return false;
    const probe = el.matches('code') ? el : (el.querySelector(':scope > code') || el);
    const cls = typeof probe.className === 'string' ? probe.className : '';
    if (/(^|\s)(language-|lang-|hljs|highlight|shiki|prism|token|code-?block)/i.test(cls)) return true;
    return probe.hasAttribute('data-language') || probe.hasAttribute('data-lang') || probe.hasAttribute('data-code-lang');
  }

  function classifyPre(pre) {
    const text = textOf(pre);
    const sig = 'pre:' + signature(text);
    if (textCache.get(pre) === sig) return;
    textCache.set(pre, sig);

    const codey = REAL_CODE_RE.test(text) || hasCodeAttrs(pre);
    if (RTL_RE.test(text) && !codey) {
      mark(pre, 'rtl');
    } else {
      mark(pre, 'ltr');
    }
  }

  function collect(root, selector) {
    const out = [];
    if (root instanceof Element && root.matches(selector)) out.push(root);
    if (root.querySelectorAll) {
      for (const el of root.querySelectorAll(selector)) out.push(el);
    }
    return out;
  }

  // Inline <code> (outside <pre>): decide direction the same way as blocks,
  // and additionally isolate LTR/code-like spans sitting inside RTL prose so
  // their brackets, operators and punctuation don't reorder the surrounding
  // Persian text. Cached like classifyPre so streaming stays cheap.
  function classifyInlineCode(code) {
    if (code.closest('pre')) return;
    const text = textOf(code);
    const sig = 'code:' + signature(text);
    if (textCache.get(code) === sig) return;
    textCache.set(code, sig);

    const codey = REAL_CODE_RE.test(text) || hasCodeAttrs(code);
    if (RTL_RE.test(text) && !codey) {
      // Persian text inside an inline <code> (e.g. a quoted string): RTL prose.
      mark(code, 'rtl');
    } else if (text.trim() && inRTLContext(code)) {
      // LTR or code-like inline span inside RTL prose: isolate as its own LTR run.
      mark(code, 'ltr');
    } else {
      unmark(code);
    }
  }

  function scan(root) {
    for (const el of collect(root, SELECTOR)) classify(el);
    for (const pre of collect(root, 'pre')) classifyPre(pre);
    for (const code of collect(root, 'code')) classifyInlineCode(code);
  }

  function flush() {
    clearTimeout(debounceTimer);
    clearTimeout(maxWaitTimer);
    debounceTimer = 0;
    maxWaitTimer = 0;
    if (!active) {
      pendingRoots.clear();
      return;
    }
    let roots = [...pendingRoots].filter(r => r.isConnected);
    pendingRoots.clear();
    if (roots.length > 24) {
      roots = [ROOT];
    } else {
      // Drop roots contained in other pending roots to avoid double scans.
      roots = roots.filter((r, i) => !roots.some((o, j) => j !== i && o !== r && o.contains(r)));
    }
    for (const root of roots) scan(root);
  }

  // Debounced flush with a hard upper bound on latency (see FLUSH_MAX_WAIT_MS).
  function requestFlush(delay) {
    if (!settings || !active) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, delay);
    if (!maxWaitTimer) {
      maxWaitTimer = setTimeout(flush, Math.max(delay, FLUSH_MAX_WAIT_MS));
    }
  }

  function schedule(root, delay) {
    if (!settings || !active) return;
    pendingRoots.add(root instanceof Element ? root : ROOT);
    requestFlush(delay);
  }

  function customFamily(id) {
    return 'HamsooCustom_' + id.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function familyFor(fontKey) {
    if (fontKey.startsWith(CUSTOM_PREFIX)) {
      const id = fontKey.slice(CUSTOM_PREFIX.length);
      return '"' + customFamily(id) + '", "Vazirmatn", sans-serif';
    }
    const safe = fontKey.replace(/["\\]/g, '');
    return '"' + safe + '", "Vazirmatn", sans-serif';
  }

  // The effective typography for this tab: a per-site override wins over the
  // global setting. Keyed by site key for known hosts, hostname otherwise.
  function overrideKey() {
    return SITE || location.hostname;
  }

  function effective(current) {
    const stored = current.siteOverrides[overrideKey()];
    const ov = stored && stored.enabled !== false ? stored : {};
    return {
      font: ov.font || current.font,
      fontSize: ov.fontSize != null ? ov.fontSize : current.fontSize,
      lineHeight: ov.lineHeight != null ? ov.lineHeight : current.lineHeight,
      fontWeight: ov.fontWeight != null ? ov.fontWeight : current.fontWeight,
      letterSpacing: ov.letterSpacing != null ? ov.letterSpacing : current.letterSpacing,
      textAlign: ov.textAlign || current.textAlign,
      maxWidth: ov.maxWidth != null ? ov.maxWidth : current.maxWidth
    };
  }

  function dropLoadedFont() {
    if (loadedFace) {
      try { document.fonts.delete(loadedFace); } catch (_) { /* no-op */ }
      loadedFace = null;
    }
    loadedFontKey = '';
  }

  async function ensureFont(key) {
    if (key === loadedFontKey) return;
    dropLoadedFont();

    if (key.startsWith(CUSTOM_PREFIX)) {
      if (!hasAPI) return;
      const id = key.slice(CUSTOM_PREFIX.length);
      let res = null;
      try {
        res = await api.runtime.sendMessage({ type: 'HAMSOO_GET_FONT', id });
      } catch (_) { res = null; }
      if (!res || !res.b64) return;
      const bin = atob(res.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const face = new FontFace(customFamily(id), bytes.buffer);
      try { await face.load(); } catch (_) { return; }
      document.fonts.add(face);
      loadedFace = face;
      loadedFontKey = key;
      return;
    }

    const spec = BUILTIN_FONT_FILES[key];
    if (!spec) {
      loadedFontKey = key; // system font (Tahoma), nothing to load
      return;
    }
    if (!hasAPI) return;
    const url = api.runtime.getURL(spec.file);
    const face = new FontFace(key, 'url("' + url + '") format("' + spec.format + '")', { weight: spec.weight });
    try { await face.load(); } catch (_) { return; }
    document.fonts.add(face);
    loadedFace = face;
    loadedFontKey = key;
  }

  // Tell the background which toolbar icon this tab should show: full-color when
  // Hamsoo is actively styling, muted/gray when the site is supported but off.
  function reportIcon() {
    if (!hasAPI || !api.runtime || typeof api.runtime.sendMessage !== 'function') return;
    try {
      const r = api.runtime.sendMessage({ type: 'HAMSOO_ICON', active: active });
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (_) { /* background asleep; re-reported on the next settings change */ }
  }

  function applySettings(next) {
    settings = normalize(next);
    active = isActive(settings);
    reportIcon();
    // Reset the per-element cache so font/size/digit changes re-apply to
    // already-rendered elements on the next scan.
    textCache = new WeakMap();

    if (!active) {
      // One attribute removal deactivates all styling; element marks stay
      // inert in the DOM, making re-enable instant.
      ROOT.removeAttribute('data-hamsoo-on');
      return;
    }

    ROOT.setAttribute('data-hamsoo-on', '');
    // Expose the host key so site-scoped CSS can apply deeper overrides where an
    // app sets its own font/size on inner text nodes (e.g. NotebookLM).
    if (SITE) ROOT.setAttribute('data-hamsoo-site', SITE);
    const eff = effective(settings);
    ROOT.toggleAttribute('data-hamsoo-typo', settings.fontEnabled);
    ROOT.toggleAttribute('data-hamsoo-read', settings.readabilityEnabled);
    ROOT.style.setProperty('--hamsoo-font', familyFor(eff.font));
    ROOT.style.setProperty('--hamsoo-size', eff.fontSize + 'px');
    ROOT.style.setProperty('--hamsoo-lh', String(eff.lineHeight));
    ROOT.style.setProperty('--hamsoo-weight', String(eff.fontWeight));
    ROOT.style.setProperty('--hamsoo-ls', eff.letterSpacing + 'px');
    ROOT.toggleAttribute('data-hamsoo-weight', settings.readabilityEnabled && eff.fontWeight !== 400);
    ROOT.toggleAttribute('data-hamsoo-ls', settings.readabilityEnabled && eff.letterSpacing !== 0);
    ROOT.toggleAttribute('data-hamsoo-justify', settings.readabilityEnabled && eff.textAlign === 'justify');
    ROOT.toggleAttribute('data-hamsoo-measure', settings.readabilityEnabled && eff.maxWidth > 0);
    ROOT.style.setProperty('--hamsoo-measure', eff.maxWidth + 'ch');
    if (settings.fontEnabled) void ensureFont(eff.font);
    schedule(ROOT, 0);
  }

  const observer = new MutationObserver(records => {
    if (!settings || !active) return;
    for (const record of records) {
      const node = record.target instanceof Element ? record.target : record.target.parentElement;
      if (node) pendingRoots.add(node);
    }
    requestFlush(FLUSH_DEBOUNCE_MS);
  });

  observer.observe(ROOT, { childList: true, subtree: true, characterData: true });

  // textarea/input values are properties and do not always create DOM mutations.
  document.addEventListener('input', event => {
    const target = event.target;
    if (target instanceof HTMLElement && target.matches(EDITABLE_SELECTOR)) {
      schedule(target, 30);
    }
  }, true);

  // Paste helper: strip stray bidi control characters from text pasted into
  // plain inputs so the field's stored direction does not get corrupted over
  // time. Rich contenteditable editors keep their own paste handling untouched.
  document.addEventListener('paste', event => {
    if (!settings || !active || !settings.punctuationFixEnabled) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) ||
        !target.matches('textarea, input[type="text"], input[type="search"]')) return;
    const cd = event.clipboardData;
    if (!cd) return;
    const text = cd.getData('text');
    if (!text || !BIDI_CONTROL_RE.test(text)) return;
    event.preventDefault();
    const clean = text.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
    const start = target.selectionStart != null ? target.selectionStart : target.value.length;
    const end = target.selectionEnd != null ? target.selectionEnd : target.value.length;
    target.value = target.value.slice(0, start) + clean + target.value.slice(end);
    const pos = start + clean.length;
    try { target.setSelectionRange(pos, pos); } catch (_) { /* no-op */ }
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }, true);

  if (hasAPI) {

    // Custom keyboard shortcut: the popup records settings.shortcut, but Chromium
    // cannot rebind the manifest command programmatically. Match it here and ask
    // the background to flip the global switch (deduped there against the native
    // command so a single keypress toggles only once).
    const comboFromEvent = event => {
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return null;
      const parts = [];
      if (event.ctrlKey) parts.push('Ctrl');
      if (event.altKey) parts.push('Alt');
      if (event.shiftKey) parts.push('Shift');
      if (event.metaKey) parts.push('Meta');
      let key = event.key;
      if (key === ' ') key = 'Space';
      else if (key.length === 1) key = key.toUpperCase();
      else if (/^f\d+$/i.test(key)) key = key.toUpperCase();
      else key = key.charAt(0).toUpperCase() + key.slice(1);
      if (!parts.length && !/^F\d+$/.test(key)) return null;
      parts.push(key);
      return parts.join('+');
    };
    document.addEventListener('keydown', event => {
      if (!settings) return;
      const combo = comboFromEvent(event);
      if (!combo || combo !== (settings.shortcut || 'Alt+Shift+R')) return;
      event.preventDefault();
      try { api.runtime.sendMessage({ type: 'HAMSOO_TOGGLE' }); } catch (_) { /* no-op */ }
    }, true);

    api.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) applySettings(changes.settings.newValue);
    });

    api.storage.local.get('settings')
      .then(res => applySettings(res ? res.settings : null))
      .catch(() => applySettings(null));
  } else {
    // Standalone preview/testing without extension APIs.
    applySettings(null);
  }
})();
