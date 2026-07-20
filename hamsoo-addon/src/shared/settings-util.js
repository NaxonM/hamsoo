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

  return {
    clampSize: clampSize,
    clampLineHeight: clampLineHeight,
    clampWeight: clampWeight,
    clampLetterSpacing: clampLetterSpacing,
    clampMeasure: clampMeasure,
    normalizeAlign: normalizeAlign,
  };
});
