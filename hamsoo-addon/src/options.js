'use strict';
/**
 * Options-page shim.
 *
 * The real settings UI is popup.html's settings view rendered in tab mode, so
 * this page only redirects. It MUST stay an external script: an inline
 * <script> in an extension page is blocked by the MV3 default content security
 * policy (script-src 'self'), which is exactly why this page opened as a blank
 * screen from Chromium's right-click -> Options. scripts/check.js now fails on
 * any inline script in src/*.html so this cannot come back.
 *
 * The <body> also carries a real link to the same target, so a browser that
 * refuses to run this script still shows a way forward instead of nothing.
 */
(function () {
  var query = location.search || '';
  if (query.indexOf('view=') === -1) {
    query = query ? query + '&view=settings' : '?view=settings';
  }
  // ui=tab: this is a full browser tab, so the popup shell is centered and
  // unclamped instead of hugging the top-left corner.
  if (query.indexOf('ui=tab') === -1) query += '&ui=tab';
  location.replace('popup.html' + query);
})();
