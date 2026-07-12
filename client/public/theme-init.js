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
