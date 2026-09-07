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
  // Case- and whitespace-insensitive: a hand-edited backup carrying 'AR' used to
  // fall through to Persian digits silently while the UI still read "Arabic".
  function normalizeDigitsScript(v) {
    var s = typeof v === 'string' ? v.trim().toLowerCase() : '';
    return s === 'ar' ? 'ar' : 'fa';
  }

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
  var SCHEMA_VERSION = 4;
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
      // v1 -> v2 used to introduce syncVersion for storage.sync conflict
      // resolution. Cross-device sync was removed; the counter is stripped in v4.
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
    if (from < 4) {
      // v3 -> v4: drop the storage.sync conflict counter and any font entries
      // that only existed as metadata from another device (no local bytes).
      delete out.syncVersion;
      if (Array.isArray(out.customFonts)) {
        var kept = [];
        var fi, font, fontCopy, fk;
        for (fi = 0; fi < out.customFonts.length; fi += 1) {
          font = out.customFonts[fi];
          if (!font || typeof font !== 'object' || font.remoteOnly === true) continue;
          if (Object.prototype.hasOwnProperty.call(font, 'remoteOnly')) {
            fontCopy = {};
            for (fk in font) {
              if (Object.prototype.hasOwnProperty.call(font, fk) && fk !== 'remoteOnly') fontCopy[fk] = font[fk];
            }
            kept.push(fontCopy);
          } else {
            kept.push(font);
          }
        }
        out.customFonts = kept;
      }
    }
    out.schemaVersion = SCHEMA_VERSION;
    return { settings: out, changed: true };
  }

  function cloneJson(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }

  function sameJson(a, b) {
    if (a === b) return true;
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
  }

  // Compare the UI's in-memory object to the last acknowledged storage copy
  // and return only the keys the UI actually changed.
  function diffSettingsFields(acked, local) {
    var fields = {};
    if (!local || typeof local !== 'object') return fields;
    acked = acked && typeof acked === 'object' ? acked : {};
    var key;
    for (key in local) {
      if (!Object.prototype.hasOwnProperty.call(local, key)) continue;
      if (key === 'syncVersion') continue;
      if (!sameJson(local[key], acked[key])) fields[key] = cloneJson(local[key]);
    }
    return fields;
  }

  // Keep unacked local edits when storage changes under the UI (popup debounce
  // vs a background write). Incoming wins for every field the UI has not edited.
  function rebasePendingSettings(acked, local, incoming) {
    var result = {};
    var src = incoming && typeof incoming === 'object' ? incoming : {};
    var key;
    for (key in src) {
      if (Object.prototype.hasOwnProperty.call(src, key) && key !== 'syncVersion') {
        result[key] = cloneJson(src[key]);
      }
    }
    if (!local || typeof local !== 'object') return result;
    acked = acked && typeof acked === 'object' ? acked : {};
    for (key in local) {
      if (!Object.prototype.hasOwnProperty.call(local, key)) continue;
      if (key === 'syncVersion') continue;
      if (!sameJson(local[key], acked[key])) result[key] = cloneJson(local[key]);
    }
    return result;
  }

  // Apply a narrow mutation onto a fresh stored object. Popup/fonts must send
  // one of these patches through the background instead of writing a full
  // in-memory snapshot.
  function applySettingsPatch(settings, patch) {
    if (!settings || typeof settings !== 'object' || !patch || typeof patch !== 'object') {
      return settings;
    }
    delete settings.syncVersion;
    var key;
    if (patch.replace && typeof patch.replace === 'object') {
      for (key in settings) {
        if (Object.prototype.hasOwnProperty.call(settings, key)) delete settings[key];
      }
      for (key in patch.replace) {
        if (Object.prototype.hasOwnProperty.call(patch.replace, key) && key !== 'syncVersion') {
          settings[key] = patch.replace[key];
        }
      }
      return settings;
    }
    if (patch.fields && typeof patch.fields === 'object') {
      for (key in patch.fields) {
        if (!Object.prototype.hasOwnProperty.call(patch.fields, key)) continue;
        if (key === 'syncVersion') continue;
        settings[key] = patch.fields[key];
      }
    }
    if (patch.addFont && typeof patch.addFont === 'object') {
      var font = patch.addFont;
      if (typeof font.id === 'string' && font.id) {
        if (!Array.isArray(settings.customFonts)) settings.customFonts = [];
        var exists = false;
        var i;
        for (i = 0; i < settings.customFonts.length; i += 1) {
          if (settings.customFonts[i] && settings.customFonts[i].id === font.id) {
            exists = true;
            break;
          }
        }
        if (!exists && settings.customFonts.length < MAX_CUSTOM_FONTS) {
          settings.customFonts.push({
            id: font.id,
            name: typeof font.name === 'string' && font.name ? font.name : font.id,
            format: typeof font.format === 'string' ? font.format : 'woff2',
            size: typeof font.size === 'number' ? font.size : 0
          });
        }
      }
    }
    if (typeof patch.removeFont === 'string' && patch.removeFont) {
      var rid = patch.removeFont;
      var prefix = 'custom:' + rid;
      if (Array.isArray(settings.customFonts)) {
        settings.customFonts = settings.customFonts.filter(function (f) {
          return !f || f.id !== rid;
        });
      }
      if (settings.font === prefix) settings.font = 'Vazirmatn';
      if (settings.siteOverrides && typeof settings.siteOverrides === 'object') {
        var okey;
        for (okey in settings.siteOverrides) {
          if (!Object.prototype.hasOwnProperty.call(settings.siteOverrides, okey)) continue;
          var ov = settings.siteOverrides[okey];
          if (ov && ov.font === prefix) delete ov.font;
        }
      }
    }
    return settings;
  }

  var EXPORT_FORMAT = 'hamsoo-settings';
  var SUPPORTED_EXPORT_VERSION = 1;

  function looksLikeHamsooSettings(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    if (typeof obj.schemaVersion === 'number' && isFinite(obj.schemaVersion)) return true;
    if (typeof obj.font === 'string' && obj.sites && typeof obj.sites === 'object' && !Array.isArray(obj.sites)) return true;
    if (typeof obj.enabled === 'boolean' && Array.isArray(obj.customSites)) return true;
    return false;
  }

  // Reject garbage JSON before any import side effect. Envelope backups
  // from exportSettings() are preferred; a legacy raw settings object is
  // accepted only when it carries distinctive Hamsoo fields.
  function recognizeImportedSettings(data) {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: 'invalid' };
    }
    if (Object.prototype.hasOwnProperty.call(data, 'format') || Object.prototype.hasOwnProperty.call(data, 'version')) {
      if (data.format !== EXPORT_FORMAT) return { ok: false, error: 'invalid' };
      if (typeof data.version !== 'number' || data.version !== SUPPORTED_EXPORT_VERSION) {
        return { ok: false, error: 'unsupportedVersion' };
      }
      if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) {
        return { ok: false, error: 'invalid' };
      }
      return {
        ok: true,
        settings: data.settings,
        fonts: Array.isArray(data.fonts) ? data.fonts : [],
        envelope: true
      };
    }
    if (!looksLikeHamsooSettings(data)) return { ok: false, error: 'invalid' };
    return { ok: true, settings: data, fonts: [], envelope: false };
  }

  // Local-only write of a complete settings object. Background code should
  // prefer updateStoredSettings / applySettingsPatch. Popup and fonts must not
  // call this with a UI snapshot — that clobbers concurrent edits.
  //
  // `options` is accepted for call-site compatibility (older bump/localOnly/
  // onSyncError flags) and ignored: there is no cloud mirror.
  function persistSettings(api, settings, _options) {
    if (!api || !api.storage || !api.storage.local) return Promise.resolve(false);
    if (settings && typeof settings === 'object') delete settings.syncVersion;
    return Promise.resolve(api.storage.local.set({ settings: settings })).then(function () {
      return true;
    });
  }

  // Serialized read-modify-write over the stored settings object.
  //
  // Every writer previously did its own get -> mutate -> set. Because the get
  // is async, two writers starting close together both read the SAME snapshot
  // and the second set overwrote the first writer's field with a stale value.
  // This is not theoretical: the keyboard toggle, the usage-day recorder, the
  // selector picker and a language change can all land within the same tick of
  // a page load, and the loser's change vanished silently.
  //
  // Queuing every mutation on one chain makes each mutator observe the result
  // of the previous one. The mutator receives the freshest stored object and
  // may either mutate it in place or return a replacement; returning false
  // means "nothing to do" and skips the write entirely.
  var writeChain = Promise.resolve();

  function updateStoredSettings(api, mutate, options) {
    var opts = options || {};
    function run() {
      if (!api || !api.storage || !api.storage.local) return Promise.resolve(null);
      if (typeof mutate !== 'function') return Promise.resolve(null);
      return Promise.resolve(api.storage.local.get('settings')).then(function (res) {
        var current = res && res.settings && typeof res.settings === 'object' ? res.settings : {};
        var result = mutate(current);
        if (result === false) return null;
        var next = result && typeof result === 'object' ? result : current;
        return persistSettings(api, next, opts).then(function () { return next; });
      });
    }
    // Chain off both fulfilment and rejection so one failed write cannot wedge
    // the queue for the rest of the session.
    var queued = writeChain.then(run, run);
    writeChain = queued.then(function () {}, function () {});
    return queued;
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

  // Registry suffixes that are not a single organization. Wildcarding one of
  // these is the same over-reach as `*.com`: it asks for every site under a
  // public registry rather than every subdomain of one site.
  var BROAD_WILDCARD_SUFFIXES = [
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au',
    'co.jp', 'or.jp', 'ne.jp', 'co.nz', 'co.za', 'com.br', 'com.cn',
    'com.tr', 'co.in', 'co.kr', 'com.mx', 'com.ar', 'co.ir', 'ac.ir'
  ];

  // A wildcard host must name an actual site (`*.example.com`), never a bare
  // registry (`*.com`, `*.co.uk`). The browser may accept the broad form, which
  // is exactly the problem: an import could quietly request host permissions
  // over an entire TLD.
  function isValidMatchPattern(p) {
    if (typeof p !== 'string' || !p) return false;
    if (!MATCH_PATTERN_RE.test(p)) return false;
    var host = p.replace(/^https?:\/\//, '').replace(/\/\*$/, '');
    if (host.indexOf('*.') !== 0) return true;
    var rest = host.slice(2).toLowerCase();
    var labels = rest.split('.');
    // `*.com` -- one label is a bare TLD.
    if (labels.length < 2) return false;
    // `*.co.uk` -- two labels, but both belong to the registry.
    if (BROAD_WILDCARD_SUFFIXES.indexOf(rest) !== -1) return false;
    return true;
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

  // Does this page URL still match a registered custom-site pattern? Used by
  // the content script so removing a site tears Hamsoo down in the open tab
  // immediately, not only on the next navigation.
  function urlMatchesPattern(rawUrl, pattern) {
    if (!isValidMatchPattern(pattern)) return false;
    var u;
    try { u = new URL(rawUrl); } catch (_) { return false; }
    var proto = pattern.indexOf('https://') === 0 ? 'https:' : 'http:';
    if (u.protocol !== proto) return false;
    var host = pattern.replace(/^https?:\/\//, '').replace(/\/\*$/, '').toLowerCase();
    var hostname = String(u.hostname || '').toLowerCase();
    if (host.indexOf('*.') === 0) {
      var rest = host.slice(2);
      return hostname === rest || hostname.length > rest.length + 1 && hostname.slice(-(rest.length + 1)) === '.' + rest;
    }
    return hostname === host;
  }

  function urlMatchesCustomSites(rawUrl, patterns) {
    var list = Array.isArray(patterns) ? patterns : [];
    for (var i = 0; i < list.length; i += 1) {
      if (urlMatchesPattern(rawUrl, list[i])) return true;
    }
    return false;
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
  var MAX_IMPORT_BYTES = MAX_CUSTOM_FONTS * MAX_FONT_BYTES + 1024 * 1024;

  // Extension-only checks accept a renamed .txt. Sniff the sfnt/WOFF magic
  // so an undecodable file cannot be installed.
  function sniffFontFormat(bytes) {
    if (!bytes || bytes.byteLength < 4) return '';
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer || bytes);
    if (u8.length < 4) return '';
    var tag = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
    if (tag === 'wOF2') return 'woff2';
    if (tag === 'wOFF') return 'woff';
    if (tag === 'OTTO') return 'otf';
    if (tag === 'true' || tag === 'ttcf') return 'ttf';
    if (u8[0] === 0 && u8[1] === 1 && u8[2] === 0 && u8[3] === 0) return 'ttf';
    return '';
  }

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
    dayKey: dayKey,
    clampTimestamp: clampTimestamp,
    defaultSupport: defaultSupport,
    normalizeSupport: normalizeSupport,
    normalizeOnboardedVersion: normalizeOnboardedVersion,
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
    persistSettings: persistSettings,
    updateStoredSettings: updateStoredSettings,
    applySettingsPatch: applySettingsPatch,
    diffSettingsFields: diffSettingsFields,
    rebasePendingSettings: rebasePendingSettings,
    recognizeImportedSettings: recognizeImportedSettings,
    EXPORT_FORMAT: EXPORT_FORMAT,
    SUPPORTED_EXPORT_VERSION: SUPPORTED_EXPORT_VERSION,
    patternFromUrl: patternFromUrl,
    isValidMatchPattern: isValidMatchPattern,
    sanitizeMatchPatterns: sanitizeMatchPatterns,
    urlMatchesPattern: urlMatchesPattern,
    urlMatchesCustomSites: urlMatchesCustomSites,
    MAX_CUSTOM_FONTS: MAX_CUSTOM_FONTS,
    MAX_FONT_BYTES: MAX_FONT_BYTES,
    MAX_IMPORT_BYTES: MAX_IMPORT_BYTES,
    sniffFontFormat: sniffFontFormat,
    MANIFEST_DEFAULT_SHORTCUT: MANIFEST_DEFAULT_SHORTCUT,
    ARROW_KEY_MAP: ARROW_KEY_MAP,
    toBrowserCommandString: toBrowserCommandString,
    isValidCommandShortcut: isValidCommandShortcut,
    describeShortcutLimitation: describeShortcutLimitation,
    isLikelyHostConflict: isLikelyHostConflict,
  };
});
