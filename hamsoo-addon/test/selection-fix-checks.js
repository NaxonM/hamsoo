(async () => {
  const results = [];
  function check(name, fn) {
    try {
      const ok = fn();
      results.push({ name, ok: !!ok, msg: ok ? '' : 'check returned false' });
    } catch (err) {
      results.push({ name, ok: false, msg: String(err && err.message || err) });
    }
  }

  const sel = document.getElementById('sel');
  const range = document.createRange();
  range.selectNodeContents(sel);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  fixSelection();

  check('selected paragraph is marked', () =>
    sel.hasAttribute('data-hamsoo-fix') && sel.getAttribute('dir') === 'rtl');
  check('unselected sibling is not marked', () =>
    !document.getElementById('sib').hasAttribute('data-hamsoo-fix'));
  check('wrapper is not marked', () =>
    !document.getElementById('wrap').hasAttribute('data-hamsoo-fix'));

  const json = JSON.stringify(results);
  document.title = 'HAMSOO_RESULTS:' + btoa(unescape(encodeURIComponent(json)));
})();
