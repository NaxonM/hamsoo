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

  // Versioned migrations for the persisted settings object. `schemaVersion`
  // was introduced at 1; earlier payloads count as version 0. The background
  // script runs this once per install/startup, so the popup and content
  // scripts can trust the stored shape without re-running migrations.
  var SCHEMA_VERSION = 2;
  function migrateSettings(raw) {
    var input = raw && typeof raw === 'object' ? raw : {};
    var from = typeof input.schemaVersion === 'number' ? input.schemaVersion : 0;
    if (from >= SCHEMA_VERSION) return { settings: input, changed: false };
    var out = {};
    for (var key in input) {
      if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key];
    }
    if (from < 1) {
      // v0 -> v1: dedupe custom site patterns and drop value-less site
      // overrides (a bare { enabled } object carries no real settings).
      if (Array.isArray(out.customSites)) {
        var sites = [];
        for (var i = 0; i < out.customSites.length; i += 1) {
          var pattern = out.customSites[i];
          if (typeof pattern === 'string' && sites.indexOf(pattern) === -1) sites.push(pattern);
        }
        out.customSites = sites;
      }
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
  function getSlimSettingsForSync(settings) {
    if (!settings || typeof settings !== 'object') return {};
    var copy = JSON.parse(JSON.stringify(settings));
    if (Array.isArray(copy.customFonts)) {
      copy.customFonts = copy.customFonts.map(function(f) {
        return { id: f.id, name: f.name };
      });
    }
    return copy;
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
    migrateSettings: migrateSettings,
    incrementSyncVersion: incrementSyncVersion,
    getSlimSettingsForSync: getSlimSettingsForSync,
  };
});
