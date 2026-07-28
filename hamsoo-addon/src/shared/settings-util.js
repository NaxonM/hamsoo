'use strict';
/**
 * Shared, pure settings helpers.
 *
 * Used by both the content script and the popup so that setting normalization is
 * defined once and can drift out of sync. The bounds and defaults mirror the
 * DEFAULTS objects in content.js / popup.js (fontSize 15, lineHeight 1.9,
 * fontWeight 400). The module is dual-mode: it attaches to globalThis in the
 * browser (loaded before content.js / popup.js) and exports via CommonJS so the
 * logic can be unit-tested directly in Node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.HamsooUtil = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function clampSize(v) { return Math.min(22, Math.max(12, Number(v) || 15)); }
  function clampLineHeight(v) { return Math.min(2.5, Math.max(1.3, Number(v) || 1.9)); }
  function clampWeight(v) { return Math.min(800, Math.max(300, Number(v) || 400)); }
  function clampLetterSpacing(v) { return Math.min(1.5, Math.max(0, Number(v) || 0)); }
  function clampMeasure(v) { return Number(v) ? Math.min(100, Math.max(40, Number(v))) : 0; }
  function normalizeAlign(v) { return v === 'justify' ? 'justify' : 'start'; }
  function normalizeDigitsScript(v) { return v === 'ar' ? 'ar' : 'fa'; }

  var DAY_MS = 24 * 60 * 60 * 1000;

  // ---- Onboarding & feedback-ask state (schema v3) --------------------------
  //
  // WELCOME_VERSION is the *content* version of the welcome page, not the
  // extension version. `onboardedVersion` records the highest version the user
  // has already seen. It is a number rather than a boolean so a future rewrite
  // of the tour can be re-shown by bumping this, with no schema migration.
  var WELCOME_VERSION = 1;

  // Thresholds for the in-popup feedback ask. They live here so the trigger
  // logic, the tests, and any later tuning all read the same numbers.
  var SUPPORT_MIN_INSTALL_AGE_DAYS = 7;
  var SUPPORT_MIN_USAGE_DAYS = 3;
  var SUPPORT_MAX_ASKS = 2;
  var SUPPORT_SNOOZE_DAYS = 30;
  // Only the *count* of distinct usage days matters, but the day keys are
  // stored so the same day cannot be counted twice. Anything past a small
  // window is dead weight, so the list is capped.
  var SUPPORT_USAGE_DAYS_CAP = 10;

  // Support fields that must never travel to another device. Engagement is
  // earned per device and installedAt is a per-device fact -- syncing either
  // would let a long-standing install make a fresh one look eligible.
  var SUPPORT_LOCAL_ONLY_FIELDS = ['installedAt', 'usageDays'];

  var USAGE_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

  // Local calendar day, deliberately not UTC: a "usage day" should line up with
  // the user's own day boundary, not with Greenwich.
  function dayKey(ts) {
    var d = new Date(typeof ts === 'number' && isFinite(ts) ? ts : Date.now());
    if (isNaN(d.getTime())) d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  // Timestamps are epoch milliseconds. Anything non-finite, negative or zero
  // collapses to 0, which every reader treats as "unset".
  function clampTimestamp(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.floor(n);
  }

  function defaultSupport(now) {
    return {
      installedAt: clampTimestamp(now) || Date.now(),
      usageDays: [],
      askCount: 0,
      snoozeUntil: 0,
      dismissedForever: false,
      actedAt: 0
    };
  }

  function normalizeSupport(raw, now) {
    var input = raw && typeof raw === 'object' ? raw : {};
    var out = defaultSupport(now);
    var installed = clampTimestamp(input.installedAt);
    if (installed) out.installedAt = installed;
    var list = Array.isArray(input.usageDays) ? input.usageDays : [];
    var days = [];
    for (var i = 0; i < list.length; i += 1) {
      if (typeof list[i] !== 'string' || !USAGE_DAY_RE.test(list[i])) continue;
      if (days.indexOf(list[i]) === -1) days.push(list[i]);
    }
    // Lexical sort is chronological for zero-padded ISO day keys.
    days.sort();
    out.usageDays = days.slice(-SUPPORT_USAGE_DAYS_CAP);
    out.askCount = Math.min(SUPPORT_MAX_ASKS, Math.max(0, Math.floor(Number(input.askCount) || 0)));
    out.snoozeUntil = clampTimestamp(input.snoozeUntil);
    out.actedAt = clampTimestamp(input.actedAt);
    // Rating or starring is a permanent opt-out, so these two cannot disagree
    // once normalized -- whichever field a caller checks, the answer is the same.
    out.dismissedForever = input.dismissedForever === true || out.actedAt > 0;
    return out;
  }

  // Clamped to WELCOME_VERSION so an imported or hand-edited backup claiming a
  // future version cannot permanently suppress the tour.
  function normalizeOnboardedVersion(v) {
    var n = Math.floor(Number(v) || 0);
    if (!(n > 0)) return 0;
    return Math.min(WELCOME_VERSION, n);
  }

  // ---- Feedback ask: engagement, eligibility, state transitions ------------
  //
  // All of this is pure and lives here rather than in the popup so the policy is
  // unit-testable in Node. Otherwise the only way to observe an off-by-one is to
  // wait a week with a real profile, which is how these features ship broken.

  // Records today as a usage day. Returns `changed: false` when today is already
  // recorded, which is the common case -- the caller fires on every page that
  // Hamsoo styles, and must not write to storage on every page load.
  function recordUsageDay(support, now) {
    var ts = clampTimestamp(now) || Date.now();
    var out = normalizeSupport(support, ts);
    var key = dayKey(ts);
    if (out.usageDays.indexOf(key) !== -1) return { support: out, changed: false };
    out.usageDays.push(key);
    out.usageDays.sort();
    out.usageDays = out.usageDays.slice(-SUPPORT_USAGE_DAYS_CAP);
    return { support: out, changed: true };
  }

  // Returns a reason alongside the verdict: a bare boolean is miserable to debug
  // when somebody reports "the card never shows up".
  function supportAskDecision(settings, now) {
    var ts = clampTimestamp(now) || Date.now();
    var s = settings && typeof settings === 'object' ? settings : {};
    var support = normalizeSupport(s.support, ts);
    // Never ask somebody who has switched Hamsoo off: they are not enjoying it.
    if (s.enabled === false) return { ask: false, reason: 'disabled' };
    if (support.dismissedForever) return { ask: false, reason: 'dismissed' };
    if (support.askCount >= SUPPORT_MAX_ASKS) return { ask: false, reason: 'askCap' };
    if (support.snoozeUntil > ts) return { ask: false, reason: 'snoozed' };
    // A clock set backwards (or an imported installedAt in the future) must read
    // as "too new", never as instantly eligible.
    if (ts - support.installedAt < SUPPORT_MIN_INSTALL_AGE_DAYS * DAY_MS) {
      return { ask: false, reason: 'tooNew' };
    }
    if (support.usageDays.length < SUPPORT_MIN_USAGE_DAYS) {
      return { ask: false, reason: 'notEngaged' };
    }
    return { ask: true, reason: 'eligible' };
  }

  function shouldAskForSupport(settings, now) {
    return supportAskDecision(settings, now).ask === true;
  }

  // "Later": counts as one of the lifetime asks and hides the card for a month.
  // Counting here rather than on render is deliberate -- rendering happens every
  // time the popup opens, which would burn through the cap in two clicks.
  function snoozeSupport(support, now) {
    var ts = clampTimestamp(now) || Date.now();
    var out = normalizeSupport(support, ts);
    out.askCount = Math.min(SUPPORT_MAX_ASKS, out.askCount + 1);
    out.snoozeUntil = ts + SUPPORT_SNOOZE_DAYS * DAY_MS;
    return out;
  }

  function dismissSupportForever(support, now) {
    var out = normalizeSupport(support, now);
    out.dismissedForever = true;
    return out;
  }

  // The user did the thing (starred, rated, or filed a report). Never ask again;
  // normalizeSupport derives dismissedForever from actedAt on every later read.
  function markSupportActed(support, now) {
    var ts = clampTimestamp(now) || Date.now();
    var out = normalizeSupport(support, ts);
    out.actedAt = ts;
    out.dismissedForever = true;
    return out;
  }

  // The closed set of fields any outgoing report may carry, in the order they
  // are written. Shared by the email and the GitHub prefill so the two channels
  // can never disagree about what gets sent.
  var REPORT_DETAIL_KEYS = ['version', 'browser', 'language', 'site', 'settings'];

  function formatDetails(raw) {
    var details = raw && typeof raw === 'object' ? raw : {};
    var lines = [];
    for (var i = 0; i < REPORT_DETAIL_KEYS.length; i += 1) {
      var key = REPORT_DETAIL_KEYS[i];
      var value = details[key];
      if (typeof value !== 'string' && typeof value !== 'number') continue;
      value = String(value).trim();
      if (!value) continue;
      lines.push(key + ': ' + value);
    }
    return lines;
  }

  // A one-line, language-neutral summary of the toggles that change what the
  // content script actually does.
  //
  // Deliberately not a settings dump. The user has to be able to read the whole
  // thing before sending it, and a full dump would carry custom font filenames
  // and the user's private site list -- identifying, and useless for triage.
  function settingsDigest(settings) {
    var s = settings && typeof settings === 'object' ? settings : {};
    if (s.enabled === false) return 'hamsoo off';
    var on = [];
    if (s.fontEnabled !== false) on.push('font');
    if (s.readabilityEnabled !== false) on.push('readability');
    if (s.digitsEnabled === true) on.push('digits:' + normalizeDigitsScript(s.digitsScript));
    if (s.punctuationFixEnabled !== false) on.push('punctuation');
    return 'hamsoo on, ' + (on.length ? on.join(' + ') : 'all features off');
  }

  var SUPPORT_EMAIL = 'hamsoo@bellamor.ir';

  // Builds a prefilled mailto: link. Pure and here rather than in the popup so
  // the encoding is testable -- an unencoded newline or '&' in a subject line
  // silently truncates the whole message body in some mail clients.
  //
  // Localized copy (subject, intro) is passed in by the caller: this module has
  // no dictionary, and the user should write in the language they are reading.
  //
  // `details` is whitelisted to a fixed set of keys in a fixed order. Hamsoo's
  // standing promise is that nothing leaves the device unless the user sends it,
  // so the contents of an outgoing report must be a closed list that is visible
  // in review, never "whatever the caller happened to pass".
  function buildFeedbackMailto(options) {
    var o = options && typeof options === 'object' ? options : {};
    var email = typeof o.email === 'string' && o.email ? o.email : SUPPORT_EMAIL;
    var subject = typeof o.subject === 'string' ? o.subject : '';
    var intro = typeof o.intro === 'string' ? o.intro : '';
    var lines = formatDetails(o.details);
    var body = intro ? intro + '\n\n' : '';
    // Two blank lines above the technical block leave the user an obvious place
    // to type, instead of landing the cursor in the middle of metadata.
    body += lines.length ? '---\n' + lines.join('\n') : '';
    var url = 'mailto:' + email;
    var query = [];
    if (subject) query.push('subject=' + encodeURIComponent(subject));
    if (body) query.push('body=' + encodeURIComponent(body));
    return query.length ? url + '?' + query.join('&') : url;
  }

  // Prefilled body for a GitHub bug report. Same detail whitelist as the email,
  // plus the reproduce-steps prompts, which are passed in already localized.
  function buildIssueBody(options) {
    var o = options && typeof options === 'object' ? options : {};
    var parts = [];
    if (typeof o.intro === 'string' && o.intro) parts.push(o.intro + '\n');
    if (Array.isArray(o.steps)) {
      for (var i = 0; i < o.steps.length; i += 1) {
        if (typeof o.steps[i] === 'string' && o.steps[i]) parts.push(o.steps[i] + '\n');
      }
    }
    var lines = formatDetails(o.details);
    if (lines.length) parts.push('---\n' + lines.join('\n'));
    return parts.join('\n');
  }

  // GitHub reads title/body/labels/template from the query string. Everything is
  // encoded here rather than at the call site: an unencoded '#' truncates the
  // whole body, and issue text is exactly where a '#' is likely.
  function buildIssueUrl(options) {
    var o = options && typeof options === 'object' ? options : {};
    var base = typeof o.base === 'string' && o.base ? o.base : SUPPORT_ISSUE_URL;
    var query = [];
    if (o.template) query.push('template=' + encodeURIComponent(o.template));
    if (o.labels) query.push('labels=' + encodeURIComponent(o.labels));
    if (o.title) query.push('title=' + encodeURIComponent(o.title));
    if (o.body) query.push('body=' + encodeURIComponent(o.body));
    return query.length ? base + '?' + query.join('&') : base;
  }

  var SUPPORT_ISSUE_TEMPLATE = 'bug_report.md';
  var SUPPORT_AMO_REVIEW_URL = 'https://addons.mozilla.org/firefox/addon/hamsoo-%D9%87%D9%85-%D8%B3%D9%88/reviews/';
  var SUPPORT_REPO_URL = 'https://github.com/NaxonM/hamsoo';
  var SUPPORT_ISSUE_URL = 'https://github.com/NaxonM/hamsoo/issues/new';

  // Both dist trees must stay byte-identical apart from the manifest, so the
  // per-browser destination cannot be baked into a script at build time. The
  // manifest is the one file that legitimately differs, so read the target from
  // it at runtime: only the Firefox build carries browser_specific_settings.
  function supportTargetFromManifest(manifest) {
    var m = manifest && typeof manifest === 'object' ? manifest : {};
    var bss = m.browser_specific_settings;
    if (bss && typeof bss === 'object' && bss.gecko) return 'firefox';
    return 'chromium';
  }

  // Firefox has an AMO listing to rate. Chromium has no Web Store listing, so
  // the ask there is a GitHub star until one exists.
  function supportActionUrl(target) {
    return target === 'firefox' ? SUPPORT_AMO_REVIEW_URL : SUPPORT_REPO_URL;
  }

  // Versioned migrations for the persisted settings object. `schemaVersion`
  // was introduced at 1; earlier payloads count as version 0. The background
  // script runs this once per install/startup, so the popup and content
  // scripts can trust the stored shape without re-running migrations.
  var SCHEMA_VERSION = 3;
  // `now` is injectable purely so the v3 leg is testable without freezing time.
  function migrateSettings(raw, now) {
    var input = raw && typeof raw === 'object' ? raw : {};
    var from = typeof input.schemaVersion === 'number' ? input.schemaVersion : 0;
    if (from >= SCHEMA_VERSION) return { settings: input, changed: false };
    var out = {};
    for (var key in input) {
      if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key];
    }
    // Dedupe custom site patterns on every migration leg, not just v0 -> v1.
    // Duplicates map to duplicate dynamic-script ids; syncCustomSites dedupes
    // defensively before registering, but leaving them in storage keeps the
    // settings list dirty and shows the same site twice in the popup.
    if (Array.isArray(out.customSites)) {
      var sites = [];
      for (var i = 0; i < out.customSites.length; i += 1) {
        var pattern = out.customSites[i];
        if (typeof pattern === 'string' && sites.indexOf(pattern) === -1) sites.push(pattern);
      }
      out.customSites = sites;
    }
    if (from < 1) {
      // v0 -> v1: drop value-less site overrides (a bare { enabled } object
      // carries no real settings).
      if (out.siteOverrides && typeof out.siteOverrides === 'object') {
        var overrides = {};
        for (var okey in out.siteOverrides) {
          if (!Object.prototype.hasOwnProperty.call(out.siteOverrides, okey)) continue;
          var ov = out.siteOverrides[okey];
          if (!ov || typeof ov !== 'object') continue;
          var hasValues = false;
          for (var field in ov) {
            if (Object.prototype.hasOwnProperty.call(ov, field) && field !== 'enabled') {
              hasValues = true;
              break;
            }
          }
          if (hasValues) overrides[okey] = ov;
        }
        out.siteOverrides = overrides;
      }
    }
    if (from < 2) {
      // v1 -> v2: add syncVersion (monotonic counter used for cross-device
      // conflict resolution in storage.sync; whichever copy has the higher
      // value is treated as the authoritative source).
      if (typeof out.syncVersion !== 'number') out.syncVersion = 0;
    }
    if (from < 3) {
      // v2 -> v3: onboarding marker + feedback-ask bookkeeping.
      //
      // Anything reaching this function already has stored settings, so it is
      // an existing user, not a fresh install (the background script bails out
      // before migrating when storage is empty). Two consequences:
      //
      //   - onboardedVersion defaults to the CURRENT WELCOME_VERSION. An upgrade
      //     must never pop the first-run tour at somebody who has been using
      //     Hamsoo for months. Fresh installs start at 0 and are handled by the
      //     install listener instead.
      //   - installedAt starts at the upgrade moment. No usage days have been
      //     observed yet, so starting the clock here is the honest reading and
      //     guarantees nobody is asked for feedback the instant they update.
      if (typeof out.onboardedVersion !== 'number') out.onboardedVersion = WELCOME_VERSION;
      out.onboardedVersion = normalizeOnboardedVersion(out.onboardedVersion);
      out.support = normalizeSupport(out.support, now);
    }
    out.schemaVersion = SCHEMA_VERSION;
    return { settings: out, changed: true };
  }

  // Increments the syncVersion field in-place and returns the new value.
  // Called by popup.js before every user-initiated save so the background
  // service worker can resolve sync conflicts by comparing version numbers.
  function incrementSyncVersion(settings) {
    var current = typeof settings.syncVersion === 'number' ? settings.syncVersion : 0;
    settings.syncVersion = current + 1;
    return settings.syncVersion;
  }

  // Returns a slim copy of settings suitable for storage.sync (trims heavy font byte arrays).
  // `remoteOnly` is a per-device availability flag, never a synced fact -- it
  // must not travel to other devices, where the font may well be present.
  function getSlimSettingsForSync(settings) {
    if (!settings || typeof settings !== 'object') return {};
    var copy = JSON.parse(JSON.stringify(settings));
    if (Array.isArray(copy.customFonts)) {
      copy.customFonts = copy.customFonts.map(function(f) {
        return { id: f.id, name: f.name };
      });
    }
    // Only the shareable half of `support` travels. "Don't ask me again" is a
    // decision about Hamsoo and should hold on every device; how long this
    // device has been installed, and which days it was used, are local facts.
    if (copy.support && typeof copy.support === 'object') {
      for (var i = 0; i < SUPPORT_LOCAL_ONLY_FIELDS.length; i += 1) {
        delete copy.support[SUPPORT_LOCAL_ONLY_FIELDS[i]];
      }
    }
    return copy;
  }

  // A newer remote copy carries only the shareable half of `support`, so a plain
  // object overwrite would wipe this device's earned engagement. Local facts are
  // kept; the permanent opt-out is a union, because "never show it again" must
  // be honored everywhere; askCount and snoozeUntil take the max so dismissing
  // on two devices can never add up to more asks than the cap allows.
  function mergeSupport(localSupport, remoteSupport) {
    var local = localSupport && typeof localSupport === 'object' ? localSupport : {};
    var remote = remoteSupport && typeof remoteSupport === 'object' ? remoteSupport : {};
    var out = normalizeSupport(local);
    if (remote.dismissedForever === true) out.dismissedForever = true;
    var remoteAsks = Math.floor(Number(remote.askCount) || 0);
    if (remoteAsks > out.askCount) out.askCount = Math.min(SUPPORT_MAX_ASKS, remoteAsks);
    var remoteSnooze = clampTimestamp(remote.snoozeUntil);
    if (remoteSnooze > out.snoozeUntil) out.snoozeUntil = remoteSnooze;
    // Earliest non-zero acted-at wins: it records when the user first said yes.
    var remoteActed = clampTimestamp(remote.actedAt);
    if (remoteActed > 0 && (out.actedAt === 0 || remoteActed < out.actedAt)) out.actedAt = remoteActed;
    if (out.actedAt > 0) out.dismissedForever = true;
    return out;
  }

  // Union custom fonts by id, preferring the local entry. A storage.sync
  // round-trip only carries { id, name }, so without this the slim remote copy
  // would wipe format/size/added and drop fonts that exist only on this device.
  //
  // Font *bytes* never sync (they live in IndexedDB and would blow the sync
  // quota). A remote-only id therefore names a font this device cannot render:
  // selecting it silently leaves the previous font in place. Mark those entries
  // `remoteOnly` so the fonts UI can show them as unavailable-on-this-device
  // instead of offering them as ordinary choices.
  function mergeCustomFonts(localFonts, remoteFonts) {
    var local = Array.isArray(localFonts) ? localFonts : [];
    var remote = Array.isArray(remoteFonts) ? remoteFonts : [];
    var out = [];
    var seen = {};
    var i, f, copy, key;
    for (i = 0; i < local.length; i += 1) {
      f = local[i];
      if (!f || typeof f.id !== 'string') continue;
      seen[f.id] = true;
      // A local entry has real bytes behind it; clear any stale remoteOnly
      // flag from a previous merge so a re-uploaded font becomes usable again.
      if (f.remoteOnly) {
        copy = {};
        for (key in f) {
          if (Object.prototype.hasOwnProperty.call(f, key) && key !== 'remoteOnly') copy[key] = f[key];
        }
        out.push(copy);
      } else {
        out.push(f);
      }
    }
    for (i = 0; i < remote.length; i += 1) {
      f = remote[i];
      if (!f || typeof f.id !== 'string' || seen[f.id]) continue;
      seen[f.id] = true;
      copy = {};
      for (key in f) {
        if (Object.prototype.hasOwnProperty.call(f, key)) copy[key] = f[key];
      }
      copy.remoteOnly = true;
      out.push(copy);
    }
    return out;
  }

  // Merge a newer remote copy over the local one without letting the slimmed
  // sync payload destroy local-only data.
  function mergeSyncedSettings(local, remote) {
    var base = local && typeof local === 'object' ? local : {};
    var incoming = remote && typeof remote === 'object' ? remote : {};
    var merged = {};
    var key;
    for (key in base) {
      if (Object.prototype.hasOwnProperty.call(base, key)) merged[key] = base[key];
    }
    for (key in incoming) {
      if (Object.prototype.hasOwnProperty.call(incoming, key)) merged[key] = incoming[key];
    }
    merged.customFonts = mergeCustomFonts(base.customFonts, incoming.customFonts);
    merged.support = mergeSupport(base.support, incoming.support);
    // The tour is per-device: a device that has never shown it must still be
    // able to, so take the lower of the two markers rather than the remote one.
    merged.onboardedVersion = Math.min(
      normalizeOnboardedVersion(base.onboardedVersion),
      normalizeOnboardedVersion(incoming.onboardedVersion)
    );
    return merged;
  }

  // Single persistence funnel. Bumps the conflict-resolution counter, writes
  // the full copy to storage.local, and mirrors a slim copy to storage.sync.
  // Every writer (popup, fonts page, background toggle) goes through this so
  // the version counter and the two storage areas cannot diverge.
  function persistSettings(api, settings, options) {
    var opts = options || {};
    if (!api || !api.storage || !api.storage.local) return Promise.resolve(false);
    if (opts.bump !== false) incrementSyncVersion(settings);
    return Promise.resolve(api.storage.local.set({ settings: settings })).then(function () {
      if (!api.storage.sync) return true;
      return Promise.resolve(api.storage.sync.set({ settings: getSlimSettingsForSync(settings) }))
        .then(function () { return true; }, function () { return true; });
    });
  }

  // Match patterns cannot carry a port in the host component, but url.origin
  // always includes one for non-default ports -- which is why every ported
  // site failed to register. A host pattern matches all ports for that host,
  // so dropping the port is both required and semantically correct.
  function patternFromUrl(rawUrl) {
    var u;
    try { u = new URL(rawUrl); } catch (_) { return ''; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    if (!u.hostname) return '';
    return u.protocol + '//' + u.hostname + '/*';
  }

  // Deliberately strict: rejects ports, <all_urls>, and free-form garbage.
  var MATCH_PATTERN_RE = /^https?:\/\/(\*\.)?[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\/\*$/;
  function isValidMatchPattern(p) {
    if (typeof p !== 'string' || !p) return false;
    return MATCH_PATTERN_RE.test(p);
  }

  function sanitizeMatchPatterns(list) {
    var input = Array.isArray(list) ? list : [];
    var out = [];
    for (var i = 0; i < input.length; i += 1) {
      if (!isValidMatchPattern(input[i])) continue;
      if (out.indexOf(input[i]) === -1) out.push(input[i]);
    }
    return out;
  }

  // The manifest's suggested_key. When the recorded shortcut equals this
  // value there is nothing to (re)register -- the manifest already binds it.
  var MANIFEST_DEFAULT_SHORTCUT = 'Alt+Shift+R';

  // Both recorders (content.js / popup.js) build their combo string from
  // event.key, and event.key reports arrow keys as 'ArrowUp' etc, which the
  // commands API does not recognize (it wants 'Up'/'Down'/'Left'/'Right').
  // Shared here so both recorders stay in sync with each other and with the
  // API's key grammar.
  var ARROW_KEY_MAP = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };

  function isMacPlatform() {
    try {
      var nav = typeof navigator !== 'undefined' ? navigator : null;
      var s = (nav && (nav.platform || nav.userAgent)) || '';
      return /Mac/i.test(s);
    } catch (_) {
      return false;
    }
  }

  // Our own recorders always emit 'Meta' for the OS key regardless of
  // platform, so shortcut matching between them stays consistent. The
  // browser commands API instead expects 'Command', and only recognizes it
  // on macOS -- translate only at the API boundary, never in stored settings.
  function toBrowserCommandString(shortcut) {
    if (typeof shortcut !== 'string' || !shortcut) return shortcut;
    var mac = isMacPlatform();
    return shortcut
      .split('+')
      .map(function (part) { return part === 'Meta' && mac ? 'Command' : part; })
      .join('+');
  }

  // The browser commands API grammar: zero or more modifiers from a fixed
  // set, at least one of which must be a primary modifier (Shift alone is
  // not sufficient), plus exactly one key from a restricted set.
  var COMMANDS_API_MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Command', 'MacCtrl'];
  var COMMANDS_API_PRIMARY_MODIFIERS = ['Ctrl', 'Alt', 'Command', 'MacCtrl'];
  var COMMANDS_API_KEY_RE = /^([A-Z0-9]|F(1[0-2]|[1-9])|Comma|Period|Home|End|PageUp|PageDown|Space|Insert|Delete|Up|Down|Left|Right)$/;

  // Why a recorded shortcut cannot be registered as a browser-wide command.
  // Returns '' when it can. The popup uses this to explain the downgrade to
  // site-only instead of silently accepting a combo that will never fire
  // outside a matched page.
  function describeShortcutLimitation(shortcut) {
    if (typeof shortcut !== 'string' || !shortcut) return 'invalid';
    if (isValidCommandShortcut(shortcut)) return '';
    // The commands API only understands the OS key on macOS (as 'Command').
    if (shortcut.split('+').indexOf('Meta') !== -1 && !isMacPlatform()) return 'metaNotSupported';
    var parts = shortcut.split('+');
    var modifiers = parts.slice(0, -1);
    var hasPrimary = false;
    for (var i = 0; i < modifiers.length; i += 1) {
      if (COMMANDS_API_PRIMARY_MODIFIERS.indexOf(modifiers[i]) !== -1) hasPrimary = true;
    }
    if (!hasPrimary) return 'needsPrimaryModifier';
    return 'unsupportedKey';
  }

  function isValidCommandShortcut(shortcut) {
    if (typeof shortcut !== 'string' || !shortcut) return false;
    var parts = toBrowserCommandString(shortcut).split('+');
    var key = parts[parts.length - 1];
    var modifiers = parts.slice(0, -1);
    var hasPrimary = false;
    for (var i = 0; i < modifiers.length; i += 1) {
      if (COMMANDS_API_MODIFIERS.indexOf(modifiers[i]) === -1) return false;
      if (COMMANDS_API_PRIMARY_MODIFIERS.indexOf(modifiers[i]) !== -1) hasPrimary = true;
    }
    if (!hasPrimary) return false;
    return COMMANDS_API_KEY_RE.test(key);
  }

  // Not exhaustive -- we cannot inspect an arbitrary host page's own
  // listeners -- but these combos are common in-page shortcuts on popular
  // chat/AI sites (command palettes, search, focus). Used to warn, never to
  // silently block a user's choice.
  var COMMON_HOST_SHORTCUTS = [
    'Ctrl+K', 'Meta+K', 'Ctrl+/', 'Meta+/', 'Ctrl+J', 'Meta+J',
    'Ctrl+E', 'Meta+E', 'Ctrl+B', 'Meta+B', 'Ctrl+Shift+O', 'Meta+Shift+O'
  ];

  function isLikelyHostConflict(shortcut) {
    return typeof shortcut === 'string' && COMMON_HOST_SHORTCUTS.indexOf(shortcut) !== -1;
  }

  // Custom-font limits live here so the fonts UI and the import path cannot
  // enforce different caps.
  var MAX_CUSTOM_FONTS = 12;
  var MAX_FONT_BYTES = 4 * 1024 * 1024;

  return {
    clampSize: clampSize,
    clampLineHeight: clampLineHeight,
    clampWeight: clampWeight,
    clampLetterSpacing: clampLetterSpacing,
    clampMeasure: clampMeasure,
    normalizeAlign: normalizeAlign,
    normalizeDigitsScript: normalizeDigitsScript,
    SCHEMA_VERSION: SCHEMA_VERSION,
    WELCOME_VERSION: WELCOME_VERSION,
    DAY_MS: DAY_MS,
    SUPPORT_MIN_INSTALL_AGE_DAYS: SUPPORT_MIN_INSTALL_AGE_DAYS,
    SUPPORT_MIN_USAGE_DAYS: SUPPORT_MIN_USAGE_DAYS,
    SUPPORT_MAX_ASKS: SUPPORT_MAX_ASKS,
    SUPPORT_SNOOZE_DAYS: SUPPORT_SNOOZE_DAYS,
    SUPPORT_USAGE_DAYS_CAP: SUPPORT_USAGE_DAYS_CAP,
    SUPPORT_LOCAL_ONLY_FIELDS: SUPPORT_LOCAL_ONLY_FIELDS,
    dayKey: dayKey,
    clampTimestamp: clampTimestamp,
    defaultSupport: defaultSupport,
    normalizeSupport: normalizeSupport,
    normalizeOnboardedVersion: normalizeOnboardedVersion,
    mergeSupport: mergeSupport,
    recordUsageDay: recordUsageDay,
    supportAskDecision: supportAskDecision,
    shouldAskForSupport: shouldAskForSupport,
    snoozeSupport: snoozeSupport,
    dismissSupportForever: dismissSupportForever,
    markSupportActed: markSupportActed,
    supportTargetFromManifest: supportTargetFromManifest,
    supportActionUrl: supportActionUrl,
    buildFeedbackMailto: buildFeedbackMailto,
    buildIssueBody: buildIssueBody,
    buildIssueUrl: buildIssueUrl,
    settingsDigest: settingsDigest,
    REPORT_DETAIL_KEYS: REPORT_DETAIL_KEYS,
    SUPPORT_ISSUE_TEMPLATE: SUPPORT_ISSUE_TEMPLATE,
    SUPPORT_EMAIL: SUPPORT_EMAIL,
    SUPPORT_AMO_REVIEW_URL: SUPPORT_AMO_REVIEW_URL,
    SUPPORT_REPO_URL: SUPPORT_REPO_URL,
    SUPPORT_ISSUE_URL: SUPPORT_ISSUE_URL,
    migrateSettings: migrateSettings,
    incrementSyncVersion: incrementSyncVersion,
    getSlimSettingsForSync: getSlimSettingsForSync,
    mergeCustomFonts: mergeCustomFonts,
    mergeSyncedSettings: mergeSyncedSettings,
    persistSettings: persistSettings,
    patternFromUrl: patternFromUrl,
    isValidMatchPattern: isValidMatchPattern,
    sanitizeMatchPatterns: sanitizeMatchPatterns,
    MAX_CUSTOM_FONTS: MAX_CUSTOM_FONTS,
    MAX_FONT_BYTES: MAX_FONT_BYTES,
    MANIFEST_DEFAULT_SHORTCUT: MANIFEST_DEFAULT_SHORTCUT,
    ARROW_KEY_MAP: ARROW_KEY_MAP,
    toBrowserCommandString: toBrowserCommandString,
    isValidCommandShortcut: isValidCommandShortcut,
    describeShortcutLimitation: describeShortcutLimitation,
    isLikelyHostConflict: isLikelyHostConflict,
  };
});
