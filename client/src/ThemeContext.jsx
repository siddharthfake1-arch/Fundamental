import { createContext, useContext, useEffect, useState } from 'react';

const ThemeCtx = createContext({ theme: 'dark', toggle: () => {} });

// Some browsers (private mode, hardened settings, certain extensions) throw on any
// localStorage access. Guard every read/write so a blocked store never crashes the app.
const readTheme = () => { try { return localStorage.getItem('fundamental-theme') || 'dark'; } catch { return 'dark'; } };
const writeTheme = (t) => { try { localStorage.setItem('fundamental-theme', t); } catch { /* storage blocked — ignore */ } };

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
    writeTheme(theme);
    window.__setNativeTheme?.(theme); // native: keep the status bar style in sync
    // Keep the browser chrome (mobile address bar / PWA title bar) on-theme too.
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#f6f7f9' : '#000000');
  }, [theme]);

  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  return <ThemeCtx.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
