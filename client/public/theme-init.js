// Runs before the app bundle: apply the saved theme so light-mode users never see
// a dark first paint (index.html defaults to class="dark").
try {
  if (localStorage.getItem('fundamental-theme') === 'light') {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  }
} catch (e) { /* storage blocked — keep the default */ }

// Match the browser chrome color to the applied theme before first paint.
try {
  if (document.documentElement.classList.contains('light')) {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', '#f6f7f9');
  }
} catch (e) { /* ignore */ }

// Flip deferred (media="print") stylesheets live once they load. This lives here,
// in an external file, because an inline onload= attribute violates the CSP
// (script-src 'self') and logged a console error on every page.
try {
  var swapAll = function () {
    document.querySelectorAll('link[data-defer-swap]').forEach(function (l) {
      var flip = function () { l.media = 'all'; };
      // Already loaded by the time we run (fast cache) — flip immediately.
      try { if (l.sheet) return flip(); } catch (e) { /* cross-origin sheet — rely on load */ }
      l.addEventListener('load', flip, { once: true });
    });
  };
  // theme-init runs before the <link> is parsed — wait for the DOM.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', swapAll);
  else swapAll();
} catch (e) { /* fonts stay deferred — system fonts remain */ }
