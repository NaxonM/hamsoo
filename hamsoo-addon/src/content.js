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
    // Apex as well as www: kimi.com serves the product directly, and the
    // suffix fallback below only matches SUBdomains of a listed host, so
    // 'www.kimi.com' could never cover the bare apex.
    'kimi.com': 'kimi',
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
    digitsScript: 'fa',
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
    siteOverrides: {},
    customSelectors: {}
  });

  // Strong RTL LETTERS. The Arabic block's two digit runs are deliberately
  // carved out: \u0660-\u0669 (Arabic-Indic digits) and \u06F0-\u06F9
  // (extended/Persian digits).
  //
  // Counting digits as RTL letters had two consequences. A block containing
  // nothing but numbers scored 100% RTL and was flipped, so a bare "2024" in
  // an English page took an RTL base. Worse, it made digit localization
  // SELF-REINFORCING: converting "123" to "\u06f1\u06f2\u06f3" inserted characters that
  // this pattern then read as RTL, so the block could never test as non-RTL
  // again and its digits could never be restored -- the conversion was
  // effectively irreversible. Digits are directionally neutral; only letters
  // should establish direction.
  const RTL_LETTER_CLASS = '[\\u0590-\\u05FF\\u0600-\\u065F\\u066A-\\u06EF\\u06FA-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]';
  const RTL_RE = new RegExp(RTL_LETTER_CLASS);
  const RTL_RE_G = new RegExp(RTL_LETTER_CLASS, 'g');
  // Latin letters INCLUDING accented forms. A bare [A-Za-z] treated every
  // accented character as neutral, so a line opening with an accented word
  // ('Ecole', 'Uber', 'Etes-vous' with their real diacritics) had no Latin
  // first-strong character at all: the first strong letter found was the
  // Persian further along, and the whole line flipped to RTL. The ratio count
  // was wrong for the same reason. Latin-1 Supplement plus Latin Extended-A/B,
  // minus the two multiplication/division signs that sit inside those ranges.
  const LATIN_LETTER_CLASS = '[A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F]';
  const LATIN_LETTER_RE = new RegExp(LATIN_LETTER_CLASS);
  const LATIN_LETTER_RE_G = new RegExp(LATIN_LETTER_CLASS, 'g');

  // Delimiter-aware LTR boundary planner. Pure function returning ordered,
  // non-overlapping {start, end, text} slices for Latin runs embedded in RTL prose.
  // Preserves balanced brackets, quotes, and German/English sentence-final punctuation
  // without swallowing enclosing parentheticals, colons, or section separators (H11).
  const planLTRIsolates = (globalThis.HamsooUtil && globalThis.HamsooUtil.planLTRIsolates) || function() { return []; };

  // How much of an element's lettered content needs to be RTL before a block
  // whose FIRST strong character is Latin is still treated as RTL. This is the
  // fallback signal only -- see isRTLBlock.
  const RTL_RATIO_THRESHOLD = 0.3;
  // Floor for treating an LTR-based block as genuinely bilingual (below
  // RTL_RATIO_THRESHOLD, so the block keeps its LTR base). This is NOT a
  // direction threshold -- it decides whether Persian typography is applied to
  // a line the classifier is leaving LTR.
  //
  // It exists because "contains any RTL character" is too loose: a single
  // Persian word quoted in a long English paragraph (Issue 5's counter-case,
  // asserted by 'lone persian word in english paragraph does not flip it')
  // would otherwise restyle the entire English paragraph in a Persian font.
  // A real bilingual line carries a substantial Persian run: the reported
  // Perplexity line is ~26% RTL letters, while the quoted-word case is ~3%.
  const MIXED_MIN_RATIO = 0.15;

  // First strong directional character, the same signal the Unicode bidi
  // algorithm (UAX #9 P2/P3) and the browser's own dir="auto" use to pick a
  // paragraph's base direction.
  function firstStrongDirection(text) {
    for (const ch of text) {
      if (LATIN_LETTER_RE.test(ch)) return 'ltr';
      if (RTL_RE.test(ch)) return 'rtl';
    }
    return 'neutral';
  }

  // Last strong directional character. Inside an RTL container this supplies
  // the signal first-strong cannot: a line that OPENS with a foreign term but
  // CLOSES in Persian is a Persian sentence quoting a term, not an English
  // sentence that happens to contain a Persian word.
  function lastStrongDirection(text) {
    let dir = 'neutral';
    for (const ch of text) {
      if (LATIN_LETTER_RE.test(ch)) dir = 'ltr';
      else if (RTL_RE.test(ch)) dir = 'rtl';
    }
    return dir;
  }

  // Base direction for a block that isRTLBlock() rejected but that sits inside
  // an already-RTL container.
  //
  // Reported case: "**stecken bleiben** <persian gloss>:" opening an otherwise
  // fully RTL answer. First-strong says LTR (the German term leads) and the
  // ratio is only ~22%, so the line took an LTR base and jumped to the left
  // margin while every sibling stayed right -- the same ragged break as R3,
  // arriving through the ltr-mixed branch rather than the ratio.
  //
  // An RTL container has already established the language of the passage, so
  // first-strong is the wrong question inside it. Require the line to CLOSE in
  // RTL: a genuinely English sentence ends in English and keeps its LTR base,
  // while a Persian line that merely opens with a Latin term resolves RTL like
  // its neighbors.
  function closesInRTL(text) {
    return RTL_RE.test(text) && lastStrongDirection(text) === 'rtl';
  }

  // Base direction for a block of text.
  //
  // Ratio alone is NOT sufficient, and using it alone was a shipped regression
  // (see docs/DEBUGGING-REPORT.md, R3). Real Persian content routinely embeds
  // long Latin runs -- language learning, code identifiers, product names --
  // so a line like "مذکر: ohne + meinen / einen / den" is only 18% RTL letters
  // by count while being unambiguously a Persian line that opens with a
  // Persian label. Judging it by ratio flips it to LTR, and inside a Persian
  // list that means one bullet jumps to the left margin while its neighbors
  // stay right: a visibly broken, ragged list.
  //
  // So: lead with first-strong direction (what the browser itself would do for
  // dir="auto"), and keep the ratio only as a rescue for blocks that OPEN in
  // Latin but are overwhelmingly Persian. A lone Persian word inside an
  // otherwise-English paragraph still stays LTR, because it neither opens the
  // block nor clears the ratio -- which is the case RTL_RATIO_THRESHOLD was
  // introduced for.
  function isRTLBlock(text) {
    const rtl = (text.match(RTL_RE_G) || []).length;
    if (!rtl) return false;
    const latin = (text.match(LATIN_LETTER_RE_G) || []).length;
    if (latin === 0) return true;
    if (firstStrongDirection(text) === 'rtl') return true;
    return rtl / (rtl + latin) >= RTL_RATIO_THRESHOLD;
  }

  // A block that isRTLBlock() left LTR, but which carries enough Persian to be
  // a bilingual line rather than an English line quoting a foreign word.
  //
  // Reported case (Perplexity): "And in that silence, <persian clause>:" plus
  // an English quote after a <br>. First-strong is Latin, the last strong
  // character is Latin, and the ratio is ~26% -- under RTL_RATIO_THRESHOLD --
  // so the classifier correctly declines to flip the base direction. But the
  // element then fell through to unmark() and received NO mark at all, so the
  // Persian run got none of Hamsoo's font, size or line-height work and the
  // block was not even isolated from surrounding bidi context. Perplexity's UI
  // is LTR, so the inRTLContext() rescue could never fire there either.
  function isMixedBlock(text) {
    const rtl = (text.match(RTL_RE_G) || []).length;
    if (!rtl) return false;
    const latin = (text.match(LATIN_LETTER_RE_G) || []).length;
    if (!latin) return false;
    return rtl / (rtl + latin) >= MIXED_MIN_RATIO;
  }

  // Unicode bidi format controls; stripped from pasted text so a field's stored
  // direction cannot be silently corrupted by embedded overrides.
  const BIDI_CONTROL_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

  // Only blocks with strong programming signals stay LTR; mixed prose like
  // "VM = \u06a9\u0644\u0627\u0633" is treated as text, not code.
  // Strong signals: on their own they reliably indicate real code.
  //
  // Each entry demands code-SHAPED context, not merely a keyword. The previous
  // single regex matched any line that merely STARTED with a bare keyword, and
  // most of those keywords are also ordinary English words. So every one of
  // "If you want...", "Return to the menu", "For example...", "Update your
  // settings", "Do not close the tab", "New in this release", "Class of 2020",
  // "Select an option", "Print the page", "Import duties", "From there...",
  // "Using the app..." was classified as code -- and code is exempt from RTL
  // treatment, so ordinary Persian answers opening with a Latin word silently
  // lost their styling. It also treated ANY "<word>" in prose as an HTML tag.
  //
  // Requiring a following delimiter (a paren, an assignment, a brace, a
  // terminating semicolon) or a known HTML tag name keeps real code matching
  // while letting prose through.
  const CODE_STRONG_PATTERNS = [
    /(^|\n)[ \t]*#include\b/,
    /(^|\n)#!/,
    // A line comment must actually carry content, not be a bare "//".
    /(^|\n)[ \t]*\/\/[ \t]*\S/,
    /(^|\n)[ \t]*(const|let|var)\s+[A-Za-z_$][\w$]*\s*[=:]/,
    /(^|\n)[ \t]*(function|def|fn|func)\s+[A-Za-z_$][\w$]*\s*\(/,
    /(^|\n)[ \t]*(async\s+)?function\s*\(/,
    /(^|\n)[ \t]*(class|struct|enum|interface|trait|impl|namespace)\s+[A-Za-z_$][\w$]*[^\n{]{0,40}\{/,
    /(^|\n)[ \t]*from\s+[\w.]+\s+import\s+/,
    /(^|\n)[ \t]*import\s+[{*]/,
    /(^|\n)[ \t]*import\s+[\w{}$,.*\s]+\s+from\s+['"]/,
    /(^|\n)[ \t]*export\s+(default|const|let|var|function|class|\{)/,
    /(^|\n)[ \t]*(public|private|protected|static)\s+[\w<>\[\],\s]+\s+[A-Za-z_$][\w$]*\s*\(/,
    // Control-flow keywords only count with their syntax attached.
    /(^|\n)[ \t]*(if|for|while|switch|catch|elif|except)\s*\(/,
    /(^|\n)[ \t]*(else|try|do|finally)\s*\{/,
    /(^|\n)[ \t]*(elif|else|except|finally|try)\b[^\n]*:[ \t]*(\n|$)/,
    /(^|\n)[ \t]*return\b[^\n]*;/,
    /(^|\n)[ \t]*(throw|raise)\s+[A-Za-z_$][\w$]*\s*[({]/,
    /\brequire\s*\(\s*['"]/,
    /\b(console\.log|System\.out\.print|printf|println|fmt\.Print)\s*\(/,
    // Known tag names only, so "<your name here>" in prose is not an element.
    /<\/(div|span|p|a|ul|ol|li|table|tr|td|th|h[1-6]|section|article|header|footer|nav|script|style|code|pre|em|strong|body|html|head|button|form|label|select|option|textarea)>/i,
    /<(div|span|p|a|ul|ol|li|table|tr|td|th|h[1-6]|img|br|hr|input|button|form|section|article|header|footer|nav|script|style|code|pre|em|strong|body|html|head|meta|link|label|select|option|textarea)(\s[^<>]*)?\/?>/i,
    // SQL is matched case-sensitively: lowercase "update ... where" is far more
    // likely to be an English sentence than a query.
    /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[\s\S]{0,120}?\b(FROM|SET|VALUES|WHERE)\b/
  ];

  function hasStrongCodeSignal(text) {
    for (const re of CODE_STRONG_PATTERNS) {
      if (re.test(text)) return true;
    }
    return false;
  }
  // Weak signals: individually common in ordinary prose (a stray semicolon, a
  // parenthetical "{aside}", a single "&&"/"->" used as shorthand), so one
  // occurrence is not proof of code. Require repetition/nesting instead.
  const CODE_WEAK_OPERATOR_RE_G = /=>|->|::|&&|\|\||===|!==/g;

  function countBalancedBracePairs(text) {
    // Count real open/close pairs (in order), not raw brace characters, so
    // two independent one-word asides like "{اول} و {دوم}" - two pairs,
    // two characters each - don't accumulate into a false "nested code" signal.
    let pairs = 0;
    let depth = 0;
    for (const ch of text) {
      if (ch === '{') depth += 1;
      else if (ch === '}' && depth > 0) { depth -= 1; pairs += 1; }
    }
    return pairs;
  }

  function looksLikeCode(text) {
    if (hasStrongCodeSignal(text)) return true;
    if (/\/\*[\s\S]*\*\//.test(text)) return true;
    const semicolons = (text.match(/;/g) || []).length;
    if (semicolons >= 2) return true;
    const operators = (text.match(CODE_WEAK_OPERATOR_RE_G) || []).length;
    if (operators >= 2) return true;
    const bracePairs = countBalancedBracePairs(text);
    if (bracePairs >= 3) return true;
    return bracePairs >= 2 && (semicolons >= 1 || operators >= 1);
  }

  // Semantic/structural selectors are load-bearing; class selectors are bonus
  // coverage that survives vendor CSS refactors failing gracefully.
  const SELECTOR = [
    'p', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'td', 'th', 'summary', 'figcaption',
    '[data-message-author-role="assistant"]',
    '[data-message-author-role="user"]',
    'textarea', 'input[type="text"]', 'input[type="search"]',
    // Bare `contenteditable` and `contenteditable=""` are both valid and mean
    // editable; only "false" opts out. Matching the literal `="true"` form
    // missed composers on any site that writes the shorthand.
    '[contenteditable]:not([contenteditable="false"])',
    '.markdown', '.prose', '.message-content', '.query-content',
    '.whitespace-pre-wrap', '.response-content-markdown',
    // Gemini renders follow-up suggestion prompts in a bare styled <div>
    // (class "follow-up-text"), not a <p>/<li>, so target it explicitly.
    '.follow-up-text',
    // Qwen renders body paragraphs as <div class="qwen-markdown-paragraph">,
    // not <p>, so they were never collected and never classified. Its headings
    // ARE real <h1>-<h6>, so a Qwen answer came out with every heading styled
    // and every paragraph skipped -- the bulk of the page left untouched.
    // Headings needing no class selector is exactly why the gap hid so long.
    '.qwen-markdown-paragraph',
    // Kimi renders every markdown paragraph as <div class="paragraph">, so
    // like Qwen above these matched no semantic selector and were never
    // classified. The wrapper .markdown IS collected, which is why a fully
    // Persian Kimi answer still looked correct (the wrapper resolves RTL as a
    // whole) while a bilingual answer came out unstyled: there, direction is a
    // per-paragraph property, and the paragraphs were invisible to the scan.
    '.paragraph',
    // NotebookLM renders its doc/source/note text inside custom Angular
    // element tags (not standard <p>/<li>), so target them explicitly. These
    // are harmless on other sites: an element is only styled when its own text
    // actually contains RTL characters.
    'paragraph-element-view', 'heading-element-view', 'list-item-element-view',
    'mat-card-content'
  ].join(',');

  const EDITABLE_SELECTOR = 'textarea, input[type="text"], input[type="search"], [contenteditable]:not([contenteditable="false"])';

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
  // Monotonic token: a stale ensureFont call (superseded while awaiting)
  // abandons its result instead of double-adding font faces.
  let fontLoadSeq = 0;

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
      // Only keep overrides that carry at least one real value; a bare
      // { enabled } object holds no per-site settings worth storing.
      const hasValues = Object.keys(clean).length > 0;
      clean.enabled = ov.enabled !== false;
      if (hasValues) siteOverrides[okey] = clean;
    }
    // Picked-element selectors (context-menu element picker), keyed by host.
    // Selector validity is checked at use time in extraSelectorFor(); here we
    // only enforce shape, dedupe, and per-host caps.
    const rawSelectors = raw.customSelectors && typeof raw.customSelectors === 'object' ? raw.customSelectors : {};
    const customSelectors = {};
    for (const host of Object.keys(rawSelectors)) {
      const list = rawSelectors[host];
      if (!Array.isArray(list)) continue;
      const cleanList = [...new Set(list.filter(s => typeof s === 'string' && s.trim() && s.length <= 400))].slice(0, 20);
      if (cleanList.length) customSelectors[host] = cleanList;
    }
    return {
      enabled: raw.enabled !== false,
      fontEnabled: raw.fontEnabled !== false,
      readabilityEnabled: raw.readabilityEnabled !== false,
      digitsEnabled: raw.digitsEnabled === true,
      digitsScript: HamsooUtil.normalizeDigitsScript(raw.digitsScript),
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
      customSites: Array.isArray(raw.customSites) ? [...new Set(raw.customSites)] : [],
      siteOverrides,
      customSelectors
    };
  }

  function isActive(current) {
    if (!current || !current.enabled) return false;
    if (SITE) return current.sites[SITE] !== false;
    // Custom http(s) hosts stay active only while they remain in customSites.
    // file: fixtures (tests) have no match pattern, so injection itself is the opt-in.
    const protocol = location.protocol;
    if (protocol !== 'http:' && protocol !== 'https:') return true;
    const util = globalThis.HamsooUtil;
    if (util && typeof util.urlMatchesCustomSites === 'function') {
      return util.urlMatchesCustomSites(location.href, current.customSites);
    }
    return false;
  }

  function textOf(el) {
    if ((el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') && typeof el.value === 'string') {
      return el.value;
    }
    // textContent avoids the forced layout that innerText triggers.
    return el.textContent || '';
  }

  // Assign a field's value through the NATIVE prototype setter.
  //
  // React (and Vue, and most controlled-input frameworks) installs its own
  // `value` property on the element instance and tracks the last value it
  // wrote. A plain `el.value = x` hits that instance property, so the
  // framework's tracker still holds the OLD string, concludes nothing changed,
  // and discards the following input event -- the paste visibly appeared in
  // the box and then vanished on the next re-render, or was simply never sent.
  // Going through the prototype setter updates the real DOM value and lets the
  // tracker observe a genuine change.
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && typeof desc.set === 'function') desc.set.call(el, value);
    else el.value = value;
  }

  function mark(el, value) {
    if (el.getAttribute('data-hamsoo') !== value) el.setAttribute('data-hamsoo', value);
  }

  function unmark(el) {
    if (el.hasAttribute('data-hamsoo')) el.removeAttribute('data-hamsoo');
  }

  // Apply an LTR base direction, choosing between two DIFFERENT strengths.
  //
  // The strict 'ltr' mark carries `unicode-bidi: isolate-override`, which
  // forces EVERY character into left-to-right order. That is only safe for
  // text with no RTL characters at all. Applying it to mixed text renders the
  // Persian run backwards -- "در تعطیلات" displayed as "رد تالیطعت" --
  // i.e. visually corrupted, unreadable text. That shipped (see
  // docs/DEBUGGING-REPORT.md, R4) because the classifier hands this branch
  // any block it judged non-RTL, including Latin-leading mixed lines.
  //
  // So: strict override only for genuinely Latin-only text; mixed text gets
  // 'ltr-mixed', which sets an LTR base and isolates the block but leaves the
  // Unicode bidi algorithm free to lay the Persian run out right-to-left.
  function markLTR(el, text) {
    mark(el, RTL_RE.test(text) ? 'ltr-mixed' : 'ltr');
  }

  // Cheap ancestor check that replaces getComputedStyle in the hot path:
  // covers sites that set dir="rtl" plus our own marks.
  function inRTLContext(el) {
    const anchor = el.parentElement || el;
    return Boolean(anchor.closest('[dir="rtl"], [data-hamsoo="rtl"], [data-hamsoo-box="rtl"]'));
  }

  // Flip the whole table/list when it is predominantly RTL, so column order
  // and bullet side render correctly.
  //
  // This used to require EVERY item to be RTL, which made the bullet side
  // hostage to the single weakest item: one mixed-language row (a formula, a
  // code identifier, a Latin product name) left the whole list LTR, so Persian
  // items rendered with their bullets stranded on the wrong margin. A majority
  // vote keeps genuinely bilingual lists untouched while letting a Persian
  // list with a few Latin-heavy rows render correctly. Empty/neutral items do
  // not vote either way. See docs/DEBUGGING-REPORT.md (R3).
  function promoteContainer(el) {
    const box = el.closest('table, ul, ol');
    if (!box || box.getAttribute('data-hamsoo-box') === 'rtl') return;
    const kids = box.querySelectorAll(box.tagName === 'TABLE' ? 'td, th' : 'li');
    if (!kids.length) return;
    let rtlKids = 0;
    let votingKids = 0;
    for (const kid of kids) {
      const text = textOf(kid);
      if (!text.trim()) continue;
      votingKids += 1;
      if (isRTLBlock(text)) rtlKids += 1;
    }
    if (!votingKids || rtlKids * 2 <= votingKids) return;
    box.setAttribute('data-hamsoo-box', 'rtl');

    // Promotion changes the ambient direction for EVERY item, including ones
    // already classified. An item processed before promotion saw a neutral
    // context, so a Latin-only item was left unmarked -- and now silently
    // inherits the container's RTL base, which throws its trailing period to
    // the wrong end of the line. The text-signature cache would keep it that
    // way for the life of the page, so invalidate and re-classify the items
    // now that the context they are judged against has actually changed.
    // See docs/DEBUGGING-REPORT.md (R4).
    for (const kid of kids) {
      textCache.delete(kid);
      classify(kid);
    }
  }

  function signature(text) {
    // FNV-1a over the whole string: mid-string edits with identical length
    // and endpoints (missed by the old length+endpoints check) now rescan.
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return text.length + ':' + (h >>> 0).toString(36);
  }

  const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

  // Opt-in: rewrite Latin digits to the chosen locale's digits (Persian or
  // Arabic-Indic) inside RTL prose only. Skips code, inputs, and editable
  // regions so it never corrupts snippets or user typing.
  // Text nodes we've localized keep their pre-conversion value here, keyed by
  // the Text node itself, so the edit can be undone exactly when digits are
  // turned back off. Each record also stores which script was applied, so a
  // later change of digitsScript can re-convert from the pristine original.
  // Without that, an already-converted node contains no ASCII digits, the
  // walker below skips it, and switching fa <-> ar is a silent no-op.
  const originalDigitText = new WeakMap();

  // True when a text node belongs to a nested block that gets classified in
  // its own right, rather than to `root` directly.
  //
  // SELECTOR deliberately includes wrappers (.markdown, .prose, the
  // data-message-author-role containers), and those are scanned OUTER-first.
  // Without this guard, localizing digits on an RTL wrapper walked EVERY
  // descendant text node -- including nested English paragraphs, table cells
  // and list items that the classifier had judged LTR -- and rewrote their
  // digits too. An English sentence inside a Persian answer came out reading
  // "version ۳.۱". Each nested block reaches classify() on its own and decides
  // for itself, so the wrapper must only touch text it directly owns.
  function inNestedBlock(node, root) {
    for (let p = node.parentElement; p && p !== root; p = p.parentElement) {
      if (p.matches(SELECTOR)) return true;
    }
    return false;
  }

  function localizeDigits(el) {
    const script = settings.digitsScript === 'ar' ? 'ar' : 'fa';
    const table = script === 'ar' ? ARABIC_INDIC_DIGITS : PERSIAN_DIGITS;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        const record = originalDigitText.get(node);
        const hasDigits = /[0-9]/.test(node.nodeValue);
        const weOwn = record !== undefined && node.nodeValue === record.lastWritten;
        const needsRescript = weOwn && record.script !== script;
        if (!hasDigits && !needsRescript) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest('pre, code, textarea, input, [contenteditable]:not([contenteditable="false"]), [href], [data-hamsoo-run]')) {
          return NodeFilter.FILTER_REJECT;
        }
        if (inNestedBlock(node, el)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    for (const node of nodes) {
      const record = originalDigitText.get(node);
      const weOwn = record !== undefined && node.nodeValue === record.lastWritten;
      const source = (weOwn && record.script !== script)
        ? record.text
        : node.nodeValue;
      const converted = source.replace(/[0-9]/g, d => table[d]);
      originalDigitText.set(node, { text: source, script, lastWritten: converted });
      node.nodeValue = converted;
    }
  }

  // Undo localizeDigits: restores every text node under el to its recorded
  // pre-conversion value. Turning the setting off is a one-step, lossless
  // revert instead of requiring a page reload.
  function restoreDigits(el, scope) {
    const wholeTree = scope === 'tree';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!wholeTree && inNestedBlock(node, el)) continue;
      const record = originalDigitText.get(node);
      if (record !== undefined) {
        if (node.nodeValue === record.lastWritten) {
          node.nodeValue = record.text;
        }
        originalDigitText.delete(node);
      }
    }
  }

  // Digits are only ever localized inside RTL blocks, so every classifier exit
  // that leaves an element non-RTL has to hand back whatever we converted
  // earlier. Previously only the RTL branch touched digits at all: a block
  // that started Persian and was later rewritten by the site (streaming edits,
  // a re-render, an inline translation) kept its Persian digits forever, even
  // though the surrounding text was now English and no longer marked RTL.
  function restoreDigitsIfNeeded(el) {
    if (!el.matches(EDITABLE_SELECTOR)) restoreDigits(el);
  }

  // Wraps bare Latin text nodes in <span data-hamsoo-run="ltr"> inside RTL
  // blocks. Element-level classification cannot reach bare text nodes,
  // and without an explicit isolate span, neutral punctuation at the English
  // boundary inherits the container's RTL direction and flips margins.
  function isolateBareLTRRuns(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest('pre, code, textarea, input, [contenteditable]:not([contenteditable="false"]), [data-hamsoo-run]')) {
          return NodeFilter.FILTER_REJECT;
        }
        if (inNestedBlock(node, el)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);

    for (const node of nodes) {
      const text = node.nodeValue;
      if (!LATIN_LETTER_RE.test(text)) continue;

      const pieces = planLTRIsolates(text);
      if (!pieces.length) continue;

      const frag = document.createDocumentFragment();
      let cursor = 0;
      for (const piece of pieces) {
        if (piece.start > cursor) {
          frag.appendChild(document.createTextNode(text.slice(cursor, piece.start)));
        }
        const span = document.createElement('span');
        span.setAttribute('dir', 'ltr');
        span.setAttribute('data-hamsoo-run', 'ltr');
        span.textContent = piece.text;
        frag.appendChild(span);
        cursor = piece.end;
      }
      if (cursor < text.length) {
        frag.appendChild(document.createTextNode(text.slice(cursor)));
      }
      node.parentNode.replaceChild(frag, node);
    }
  }

  // Tears down data-hamsoo-run spans and merges sibling text nodes back to
  // their pre-injection state. 'block' (reclassification) leaves nested RTL
  // blocks untouched; 'tree' unwraps the entire subtree for clean disable.
  function restoreBareLTRRuns(el, scope) {
    const wholeTree = scope === 'tree';
    const spans = el.querySelectorAll('[data-hamsoo-run]');
    for (const span of spans) {
      if (!wholeTree && inNestedBlock(span, el)) continue;
      const parent = span.parentNode;
      if (!parent) continue;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    }
  }

  // Remembers the dir attribute an editable carried BEFORE we touched it.
  // Without this the undo path deletes the attribute outright, so a field the
  // site itself authored as dir="rtl" comes back with no dir at all -- the
  // extension destroying markup it did not create. Mirrors originalDigitText.
  const originalEditableDir = new WeakMap();

  // Punctuation helper: give editable fields dir="auto" so neutral punctuation
  // lands correctly while typing. Tracked with data-hamsoo-dir so it can be
  // reverted precisely when the feature (or the extension) is turned off.
  function applyEditableDir(el) {
    if (settings.punctuationFixEnabled) {
      if (el.getAttribute('dir') !== 'auto') {
        if (!originalEditableDir.has(el)) originalEditableDir.set(el, el.getAttribute('dir'));
        el.setAttribute('dir', 'auto');
        el.setAttribute('data-hamsoo-dir', '');
      }
    } else {
      restoreEditableDir(el);
    }
  }

  // Undo applyEditableDir: put the author's own dir back, or remove ours if
  // there was none. Fields we never touched carry no data-hamsoo-dir and are
  // left completely alone.
  function restoreEditableDir(el) {
    if (!el.hasAttribute('data-hamsoo-dir')) return;
    const original = originalEditableDir.get(el);
    if (original === null || original === undefined) el.removeAttribute('dir');
    else el.setAttribute('dir', original);
    originalEditableDir.delete(el);
    el.removeAttribute('data-hamsoo-dir');
  }

  // Gaining or losing the 'rtl' mark changes the ambient direction that EVERY
  // descendant is judged against, so their cached decisions are now stale.
  //
  // promoteContainer() already does this for list/table items (R4-b), but the
  // same staleness happens on ordinary streaming content, which is how it
  // reached users: an assistant message that opens with an English line is
  // classified while the container still holds nothing but Latin text, so the
  // line is correctly left unmarked. When the Persian body streams in
  // underneath it the container flips to RTL -- and that English line, whose
  // own text never changed, is skipped by the signature cache and silently
  // inherits the container's RTL base. Its trailing ':' jumps to the left end
  // of the line and the line right-aligns.
  // See docs/DEBUGGING-REPORT.md (R5).
  function reclassifyDescendants(el) {
    if (!el.firstElementChild) return;
    for (const kid of el.querySelectorAll(SELECTOR)) {
      textCache.delete(kid);
      classify(kid);
    }
    for (const code of el.querySelectorAll('code')) {
      textCache.delete(code);
      classifyInlineCode(code);
    }
  }

  function classify(el) {
    const text = textOf(el);
    const sig = signature(text);
    if (textCache.get(el) === sig) return;
    textCache.set(el, sig);

    if (el.closest('pre')) return;

    // Editable fields get direction assistance when enabled. When disabled,
    // restore the author dir, remove any Hamsoo direction mark, and exit early
    // so direction: rtl !important does not override the restored field.
    if (el.matches(EDITABLE_SELECTOR)) {
      if (settings.punctuationFixEnabled) {
        applyEditableDir(el);
      } else {
        restoreEditableDir(el);
        unmark(el);
        return;
      }
    }

    // Captured before any mark() call so we can detect a change of ambient
    // direction, not merely the current state.
    const wasRTL = el.getAttribute('data-hamsoo') === 'rtl';

    // A line inside an RTL container that closes in RTL belongs to the
    // container's direction even when it opens with a Latin term.
    const rtlByContext = Boolean(text.trim()) && closesInRTL(text) && inRTLContext(el);

    if (isRTLBlock(text) || rtlByContext) {
      mark(el, 'rtl');
      if (!el.matches(EDITABLE_SELECTOR)) {
        restoreDigits(el);
        restoreBareLTRRuns(el);
        isolateBareLTRRuns(el);
        if (settings.digitsEnabled) {
          localizeDigits(el);
        }
      }
      if (el.matches('td, th, li')) promoteContainer(el);
      if (!wasRTL) reclassifyDescendants(el);
    } else if (text.trim() && inRTLContext(el)) {
      // LTR-based element inside an RTL ambient context: give it an LTR base so
      // neutral punctuation does not jump to the wrong end of the line.
      restoreBareLTRRuns(el);
      restoreDigitsIfNeeded(el);
      markLTR(el, text);
      if (wasRTL) reclassifyDescendants(el);
    } else if (text.trim() && isMixedBlock(text)) {
      // Bilingual line on an LTR site. Keep the LTR base (the English opening
      // must stay left) but mark it so it is isolated and picks up Persian
      // typography. markLTR() emits 'ltr-mixed' here, never the strict 'ltr'
      // override, because the text contains RTL characters -- see
      // CONTRIBUTING rule 8 and docs/DEBUGGING-REPORT.md (R4).
      //
      // Digits are deliberately NOT localized on this path: the block is
      // majority-Latin, so its numbers usually belong to the English text.
      restoreBareLTRRuns(el);
      restoreDigitsIfNeeded(el);
      markLTR(el, text);
      if (wasRTL) reclassifyDescendants(el);
    } else {
      restoreBareLTRRuns(el);
      restoreDigitsIfNeeded(el);
      unmark(el);
      if (wasRTL) reclassifyDescendants(el);
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

    const codey = looksLikeCode(text) || hasCodeAttrs(pre);
    if (isRTLBlock(text) && !codey) {
      mark(pre, 'rtl');
    } else {
      // Code blocks routinely carry Persian string literals and comments;
      // markLTR keeps the block LTR without reversing them.
      markLTR(pre, text);
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

    const codey = looksLikeCode(text) || hasCodeAttrs(code);
    if (isRTLBlock(text) && !codey) {
      // Persian text inside an inline <code> (e.g. a quoted string): RTL prose.
      mark(code, 'rtl');
    } else if (text.trim() && inRTLContext(code)) {
      // LTR or code-like inline span inside RTL prose: isolate as its own LTR run.
      markLTR(code, text);
    } else {
      unmark(code);
    }
  }

  // Combined selector for elements the user picked via the context-menu
  // element picker ("always fix this element"). Stored per host; both the
  // known site key and the raw hostname are honored, and every stored string
  // is validated so one bad selector cannot break scanning.
  let extraSelector = '';

  function extraSelectorFor(current) {
    const map = current && current.customSelectors ? current.customSelectors : {};
    const candidates = new Set();
    if (SITE && Array.isArray(map[SITE])) for (const sel of map[SITE]) candidates.add(sel);
    if (Array.isArray(map[location.hostname])) for (const sel of map[location.hostname]) candidates.add(sel);
    const valid = [];
    const probe = document.createDocumentFragment();
    for (const sel of candidates) {
      try {
        probe.querySelector(sel);
        valid.push(sel);
      } catch (_) {
        // Invalid selector string; skip it.
      }
    }
    return valid.join(',');
  }

  function unstyleDroppedSelectors(oldSel, newSel) {
    const roots = [document];
    for (const root of shadowRoots) roots.push(root);
    for (const root of roots) {
      let oldEls;
      try { oldEls = collect(root, oldSel); } catch (_) { continue; }
      for (const el of oldEls) {
        if (newSel) {
          try { if (el.matches(newSel)) continue; } catch (_) { /* keep unmarking */ }
        }
        try { if (el.matches(SELECTOR)) { classify(el); continue; } } catch (_) {}
        restoreDigits(el, 'tree');
        restoreBareLTRRuns(el, 'tree');
        restoreEditableDir(el);
        unmark(el);
        for (const child of el.querySelectorAll('[data-hamsoo], [data-hamsoo-run], [data-hamsoo-dir]')) {
          if ((newSel && child.matches(newSel)) || child.matches(SELECTOR)) {
            classify(child);
          } else {
            restoreDigits(child, 'tree');
            restoreBareLTRRuns(child, 'tree');
            restoreEditableDir(child);
            unmark(child);
          }
        }
      }
    }
  }

  function scan(root) {
    for (const el of collect(root, SELECTOR)) classify(el);
    if (extraSelector) for (const el of collect(root, extraSelector)) classify(el);
    for (const pre of collect(root, 'pre')) classifyPre(pre);
    for (const code of collect(root, 'code')) classifyInlineCode(code);
    discoverShadowRoots(root);
  }

  // --- Shadow DOM support ---------------------------------------------------
  // Outer-document stylesheets never apply inside shadow roots, and the rules
  // in content.css are additionally gated on <html> attributes that selectors
  // inside a shadow tree cannot see. So every discovered open shadow root
  // adopts one shared constructed stylesheet (with a <style> fallback) whose
  // text is regenerated from the current activation state. The CSS custom
  // properties (--hamsoo-*) are set on <html> and inherit across shadow
  // boundaries, so the variable-driven typography keeps working unchanged.
  const shadowRoots = new Set();
  const shadowStyleEls = new WeakMap();
  let shadowSheet = null;
  try { shadowSheet = new CSSStyleSheet(); } catch (_) { /* fall back to <style> */ }

  function shadowCss() {
    if (!active) return '';
    const rules = [
      '[data-hamsoo="rtl"]{direction:rtl !important;text-align:start !important;unicode-bidi:isolate !important;}',
      // Mirrors content.css: strict override for Latin-only text, plain
      // isolation for mixed text so Persian runs are not reversed (R4).
      '[data-hamsoo="ltr"]{direction:ltr !important;text-align:start !important;unicode-bidi:isolate-override !important;}',
      '[data-hamsoo="ltr-mixed"]{direction:ltr !important;text-align:start !important;unicode-bidi:isolate !important;}',
      '[data-hamsoo-run="ltr"]{direction:ltr !important;text-align:start !important;unicode-bidi:isolate !important;}',
      '[data-hamsoo-box="rtl"]{direction:rtl !important;}',
      '[data-hamsoo="rtl"] pre,[data-hamsoo="rtl"] code[data-hamsoo="ltr"],[data-hamsoo="rtl"] code[data-hamsoo="ltr-mixed"]{unicode-bidi:isolate;}'
    ];
    if (ROOT.hasAttribute('data-hamsoo-typo')) {
      rules.push('[data-hamsoo="rtl"],[data-hamsoo="ltr-mixed"]{font-family:var(--hamsoo-font, inherit) !important;}');
    }
    if (ROOT.hasAttribute('data-hamsoo-read')) {
      rules.push('[data-hamsoo="rtl"],[data-hamsoo="ltr-mixed"]{font-size:var(--hamsoo-size, 15px) !important;line-height:var(--hamsoo-lh, 1.9) !important;}');
    }
    if (ROOT.hasAttribute('data-hamsoo-weight')) {
      rules.push('[data-hamsoo="rtl"],[data-hamsoo="ltr-mixed"]{font-weight:var(--hamsoo-weight, 400) !important;font-synthesis:weight style !important;}');
    }
    if (ROOT.hasAttribute('data-hamsoo-ls')) {
      rules.push('[data-hamsoo="rtl"],[data-hamsoo="ltr-mixed"]{letter-spacing:var(--hamsoo-ls, 0) !important;}');
    }
    if (ROOT.hasAttribute('data-hamsoo-justify')) {
      rules.push('[data-hamsoo="rtl"]{text-align:justify !important;}');
    }
    if (ROOT.hasAttribute('data-hamsoo-measure')) {
      rules.push('[data-hamsoo="rtl"]:not(td):not(th):not(pre):not(code){max-width:var(--hamsoo-measure, 70ch) !important;}');
    }
    return rules.join('\n');
  }

  function adoptInto(root) {
    if (shadowSheet) {
      try {
        if (!root.adoptedStyleSheets.includes(shadowSheet)) {
          root.adoptedStyleSheets = [...root.adoptedStyleSheets, shadowSheet];
        }
        return;
      } catch (_) { /* constructed sheet rejected; fall back to <style> */ }
    }
    let styleEl = shadowStyleEls.get(root);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.setAttribute('data-hamsoo-style', '');
      root.appendChild(styleEl);
      shadowStyleEls.set(root, styleEl);
    }
    styleEl.textContent = shadowCss();
  }

  function syncShadowStyles() {
    const css = shadowCss();
    if (shadowSheet) {
      try { shadowSheet.replaceSync(css); } catch (_) { /* no-op */ }
    }
    for (const root of shadowRoots) {
      const styleEl = shadowStyleEls.get(root);
      if (styleEl) styleEl.textContent = css;
    }
  }

  // Finds open shadow roots in a scanned subtree, styles them, watches them
  // with the shared MutationObserver, and scans their content (which in turn
  // discovers nested roots). Closed shadow roots stay untouchable by design.
  function discoverShadowRoots(node) {
    const hosts = [];
    if (node instanceof Element && node.shadowRoot) hosts.push(node);
    if (node.querySelectorAll) {
      for (const el of node.querySelectorAll('*')) {
        if (el.shadowRoot) hosts.push(el);
      }
    }
    for (const host of hosts) {
      const root = host.shadowRoot;
      if (shadowRoots.has(root)) continue;
      shadowRoots.add(root);
      adoptInto(root);
      observer.observe(root, { childList: true, subtree: true, characterData: true });
      scan(root);
    }
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
      roots = [ROOT, ...shadowRoots];
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
    const seq = ++fontLoadSeq;
    // The previous face is deliberately NOT dropped here. Dropping it up front
    // left the page with no webfont for the entire duration of the load -- a
    // visible flash back to the site's own font on every switch -- and if the
    // new face then failed to load or was superseded, the user was left with
    // nothing at all. Swap only once the replacement is actually ready.

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
      if (seq !== fontLoadSeq) return; // superseded while loading
      dropLoadedFont();
      document.fonts.add(face);
      loadedFace = face;
      loadedFontKey = key;
      return;
    }

    const spec = BUILTIN_FONT_FILES[key];
    if (!spec) {
      dropLoadedFont(); // system font (Tahoma): release the previous webfont
      loadedFontKey = key;
      return;
    }
    if (!hasAPI) return;
    const url = api.runtime.getURL(spec.file);
    const face = new FontFace(key, 'url("' + url + '") format("' + spec.format + '")', { weight: spec.weight });
    try { await face.load(); } catch (_) { return; }
    if (seq !== fontLoadSeq) return; // superseded while loading
    dropLoadedFont();
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

  const CSS_VARS = ['--hamsoo-font', '--hamsoo-size', '--hamsoo-lh', '--hamsoo-weight', '--hamsoo-ls', '--hamsoo-measure'];

  // Strip every trace of the extension from a document or shadow root.
  function cleanTree(root) {
    restoreDigits(root, 'tree');
    restoreBareLTRRuns(root, 'tree');
    for (const el of root.querySelectorAll('[data-hamsoo-dir]')) restoreEditableDir(el);
    // "Fix this selection" writes inline !important direction styles straight
    // onto the page. They used to be permanent: nothing recorded them, so
    // disabling the extension or reloading settings left the page rewritten
    // with no way back short of a reload. The marker attribute lets teardown
    // undo exactly what was applied, and nothing else.
    for (const el of root.querySelectorAll('[data-hamsoo-fix]')) {
      const raw = el.getAttribute('data-hamsoo-fix');
      let prior = null;
      if (raw && raw.charAt(0) === '{') {
        try { prior = JSON.parse(raw); } catch (_) { prior = null; }
      }
      if (prior && typeof prior === 'object') {
        const restoreProp = (name, snap) => {
          if (snap && snap[0]) el.style.setProperty(name, snap[0], snap[1] || '');
          else el.style.removeProperty(name);
        };
        restoreProp('direction', prior.direction);
        restoreProp('text-align', prior.textAlign);
        restoreProp('unicode-bidi', prior.unicodeBidi);
        if (prior.dir == null || prior.dir === '') el.removeAttribute('dir');
        else el.setAttribute('dir', prior.dir);
      } else {
        el.style.removeProperty('direction');
        el.style.removeProperty('text-align');
        el.style.removeProperty('unicode-bidi');
        if (raw === 'dir') el.removeAttribute('dir');
        else if (raw && raw.startsWith('keep:')) el.setAttribute('dir', raw.slice(5));
      }
      el.removeAttribute('data-hamsoo-fix');
    }
    for (const el of root.querySelectorAll('[data-hamsoo], [data-hamsoo-box]')) {
      el.removeAttribute('data-hamsoo');
      el.removeAttribute('data-hamsoo-box');
    }
  }

  // Full teardown for the disabled state.
  //
  // Dropping data-hamsoo-on switches off everything driven by content.css, so
  // the page LOOKS untouched -- but CSS gating cannot reach anything that is
  // not CSS. Converted digits, the dir attributes we wrote, the marks, the
  // stylesheet adopted into shadow roots and the loaded FontFace all survived,
  // and only a reload cleared them. Disabling now actually undoes the work.
  function removeInjections() {
    for (const name of [...ROOT.attributes].map(a => a.name)) {
      if (name.startsWith('data-hamsoo')) ROOT.removeAttribute(name);
    }
    for (const v of CSS_VARS) ROOT.style.removeProperty(v);
    if (!ROOT.getAttribute('style')) ROOT.removeAttribute('style');

    cleanTree(document);
    for (const root of shadowRoots) {
      cleanTree(root);
      const styleEl = shadowStyleEls.get(root);
      if (styleEl) {
        styleEl.remove();
        shadowStyleEls.delete(root);
      }
      if (shadowSheet) {
        try {
          root.adoptedStyleSheets = root.adoptedStyleSheets.filter(s => s !== shadowSheet);
        } catch (_) { /* no-op */ }
      }
    }
    dropLoadedFont();
  }

  function applySettings(next) {
    settings = normalize(next);
    active = isActive(settings);
    reportIcon();
    // Reset the per-element cache so font/size/digit changes re-apply to
    // already-rendered elements on the next scan.
    textCache = new WeakMap();
    const nextExtra = extraSelectorFor(settings);
    if (extraSelector && extraSelector !== nextExtra) {
      unstyleDroppedSelectors(extraSelector, nextExtra);
    }
    extraSelector = nextExtra;

    if (!active) {
      syncShadowStyles();
      removeInjections();
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
    // A previous disable detached our styling from every known shadow root, and
    // discoverShadowRoots() skips roots it has already seen -- so re-attach here
    // or re-enabling would silently leave shadow content unstyled.
    for (const root of shadowRoots) {
      adoptInto(root);
      // The teardown stripped the marks inside these roots too, and the scan
      // scheduled below only walks the main document -- discoverShadowRoots()
      // skips roots it has already seen, so without this their content would
      // come back unclassified after a disable/enable cycle.
      //
      // scan() directly, NOT schedule(): schedule() coerces any non-Element to
      // ROOT, and a ShadowRoot is nodeType 11, so handing one to schedule()
      // silently re-scans <html> instead and the shadow tree stays unmarked.
      scan(root);
    }
    syncShadowStyles();
    if (settings.fontEnabled) void ensureFont(eff.font);
    schedule(ROOT, 0);
  }

  const observer = new MutationObserver(records => {
    if (!settings || !active) return;
    for (const record of records) {
      const target = record.target;
      // nodeType 11: the target is a ShadowRoot itself (direct childList
      // changes on the root), which is scannable but not an Element.
      const node = target instanceof Element ? target : (target.nodeType === 11 ? target : target.parentElement);
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
      else if (HamsooUtil.ARROW_KEY_MAP[key]) key = HamsooUtil.ARROW_KEY_MAP[key];
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
