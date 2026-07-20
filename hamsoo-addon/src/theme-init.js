/* Applies the saved theme synchronously, before first paint, to avoid a
   light->dark flash (FOUC) when the popup opens. This runs from <head> as a
   blocking script. chrome.storage is async, so popup.js keeps a synchronous
   mirror of mode/accent in localStorage (see applyTheme). */
(function () {
  try {
    var mode = localStorage.getItem('hamsoo-mode') || 'system';
    var accent = localStorage.getItem('hamsoo-accent') || 'blue';
    var dark = mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var el = document.documentElement;
    el.classList.toggle('dark', dark);
    el.dataset.accent = accent;
  } catch (e) { /* first run or storage unavailable: fall back to CSS default */ }
})();
