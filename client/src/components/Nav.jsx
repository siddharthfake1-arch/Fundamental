import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { Sun, Moon, Search } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import { api, asArray } from '../api';
import { Avatar, Logo, VerifiedBadge } from './ui';

// Global search: startups, people, and communities from one box. Debounced;
// Escape or an outside click closes the dropdown. Exported for the native
// header's full-screen search overlay.
export function GlobalSearch({ className = '', autoFocus = false, onNavigate }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [cursor, setCursor] = useState(-1); // keyboard highlight across the flat result list
  const boxRef = useRef();
  const nav = useNavigate();

  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); setOpen(false); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const d = await api.get(`/api/search?q=${encodeURIComponent(q.trim())}`);
        setResults(d); setOpen(true); setCursor(-1);
      } catch { /* search is best-effort */ }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);

  const go = (path) => { setOpen(false); setQ(''); nav(path); onNavigate?.(); };
  // Defensive: a partial payload must never crash the whole nav.
  const startups = asArray(results?.startups), people = asArray(results?.people), communities = asArray(results?.communities);
  const flat = [
    ...startups.map(s => `/startup/${s.id}`),
    ...people.map(p => `/profile/${p.id}`),
    ...communities.map(c => `/communities/${c.slug}`),
  ];
  const onKeyNav = (e) => {
    if (!open || !flat.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => (c + 1) % flat.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => (c - 1 + flat.length) % flat.length); }
    else if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); go(flat[cursor]); }
  };
  const none = results && !flat.length;
  const Section = ({ title, items, render }) => items.length > 0 && (
    <div className="py-1">
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-mist-500">{title}</div>
      {items.map(render)}
    </div>
  );
  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <Search className="w-4 h-4 text-mist-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input aria-label="Search Fundamental" role="combobox" aria-expanded={open} aria-autocomplete="list"
        className="input !py-2 !pl-9 !text-sm w-full" placeholder="Search…" autoFocus={autoFocus}
        value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => results && setOpen(true)} onKeyDown={onKeyNav} />
      {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-ink-600 border-t-gold-400 animate-spin" aria-hidden />}
      {open && results && (
        <div className="absolute left-0 right-0 mt-2 card p-1 max-h-96 overflow-y-auto z-50 fade-in min-w-[280px]">
          {none && <div className="px-3 py-3 text-sm text-mist-500">No matches for “{q.trim()}”.</div>}
          <Section title="Startups" items={startups} render={(s, i) => (
            <button key={'s' + s.id} className={`w-full text-left px-3 py-2 rounded-lg hover:bg-ink-800 flex items-center gap-2.5 ${cursor === i ? 'bg-ink-800' : ''}`} onClick={() => go(`/startup/${s.id}`)}>
              <Avatar src={s.logo} name={s.name} size={7} square />
              <span className="min-w-0"><span className="block text-sm font-semibold text-mist-100 truncate">{s.name}</span>
                <span className="block text-xs text-mist-400 truncate">{s.sector} · {s.stage}</span></span>
            </button>
          )} />
          <Section title="People" items={people} render={(p, i) => (
            <button key={'p' + p.id} className={`w-full text-left px-3 py-2 rounded-lg hover:bg-ink-800 flex items-center gap-2.5 ${cursor === startups.length + i ? 'bg-ink-800' : ''}`} onClick={() => go(`/profile/${p.id}`)}>
              <Avatar src={p.photo} name={p.name} size={7} />
              <span className="min-w-0"><span className="block text-sm font-semibold text-mist-100 truncate">{p.name}</span>
                <span className="block text-xs text-mist-400 capitalize truncate">{p.role}{p.headline ? ` · ${p.headline}` : ''}</span></span>
            </button>
          )} />
          <Section title="Communities" items={communities} render={(c, i) => (
            <button key={'c' + c.id} className={`w-full text-left px-3 py-2 rounded-lg hover:bg-ink-800 ${cursor === startups.length + people.length + i ? 'bg-ink-800' : ''}`} onClick={() => go(`/communities/${c.slug}`)}>
              <span className="block text-sm font-semibold text-mist-100 truncate">{c.name}</span>
              <span className="block text-xs text-mist-400 capitalize truncate">{c.kind} community</span>
            </button>
          )} />
        </div>
      )}
    </div>
  );
}

const LINKS = [
  { to: '/discover', label: 'Discover' },
  { to: '/pulse', label: 'Pulse' },
  { to: '/network', label: 'Network' },
  { to: '/communities', label: 'Communities' },
  { to: '/social', label: 'Social' },
  { to: '/messages', label: 'Messages', badge: 'messages' },
  { to: '/dashboard', label: 'Dashboard' },
];

export default function Nav() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [counts, setCounts] = useState({ notifications: 0, messages: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef();
  const headerRef = useRef();
  // Refs mirror the open states so stable event listeners can read them.
  const menuOpenRef = useRef(false);
  const mobileOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;
  mobileOpenRef.current = mobileOpen;
  const nav = useNavigate();

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.hidden) return; // backgrounded app: don't burn battery/API budget
      try {
        const c = await api.get('/api/badge-counts');
        if (alive) { setCounts(c); window.dispatchEvent(new CustomEvent('badge-counts', { detail: c })); }
      } catch { /* transient */ }
    };
    poll();
    const t = setInterval(poll, 15000);
    // Pages fire badge-refresh after mark-read / thread-open; the native shell fires
    // app-resumed when the app returns to the foreground — both mean "update now".
    window.addEventListener('badge-refresh', poll);
    window.addEventListener('app-resumed', poll);
    return () => { alive = false; clearInterval(t); window.removeEventListener('badge-refresh', poll); window.removeEventListener('app-resumed', poll); };
  }, []);

  useEffect(() => {
    const fn = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      // Tapping the page body (outside the header) closes the mobile panel too.
      if (headerRef.current && !headerRef.current.contains(e.target)) setMobileOpen(false);
    };
    // F-027: Escape closes the account and mobile menus.
    const onKey = (e) => { if (e.key === 'Escape') { setMenuOpen(false); setMobileOpen(false); } };
    document.addEventListener('mousedown', fn);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', fn); document.removeEventListener('keydown', onKey); };
  }, []);

  // Native: the Android back button closes an open menu before navigating away.
  useEffect(() => {
    const onBack = (e) => {
      if (menuOpenRef.current || mobileOpenRef.current) { e.preventDefault(); setMenuOpen(false); setMobileOpen(false); }
    };
    window.addEventListener('app-back', onBack);
    return () => window.removeEventListener('app-back', onBack);
  }, []);

  const links = [...LINKS];
  if (user.role === 'investor') links.splice(6, 0, { to: '/watchlist', label: 'Pipeline' });
  if (user.role === 'admin') links.push({ to: '/admin', label: 'Admin' });

  return (
    <header ref={headerRef} className="sticky top-0 z-40 bg-ink-950/85 backdrop-blur-lg border-b border-ink-700/60 safe-top">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-3">
        <Link to="/discover" className="shrink-0"><Logo className="h-[58px]" /></Link>

        <nav className="hidden lg:flex items-center gap-0.5 mx-auto">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              {l.label}
              {l.badge === 'messages' && counts.messages > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-gold-400 text-ink-950 text-[10px] font-bold flex items-center justify-center">{counts.messages}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <GlobalSearch className="hidden md:block w-48 xl:w-56" />

        <div className="flex items-center gap-2 ml-auto lg:ml-0">
          <button onClick={toggle} className="nav-link !px-2.5" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <NavLink to="/notifications" className={({ isActive }) => `nav-link !px-2.5 ${isActive ? 'nav-link-active' : ''}`} title="Notifications"
            aria-label={`Notifications${counts.notifications > 0 ? `, ${counts.notifications} unread` : ''}`}>
            <span className="relative inline-block">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
              {counts.notifications > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-gold-400 text-ink-950 text-[10px] font-bold flex items-center justify-center">{counts.notifications}</span>}
            </span>
          </NavLink>

          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls="account-menu" aria-label="Account menu" className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-ink-800 transition-colors">
              <Avatar src={user.photo} name={user.name} size={8} />
              <svg className="w-3.5 h-3.5 text-mist-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {menuOpen && (
              <div id="account-menu" role="menu" className="absolute right-0 mt-2 w-60 card p-2 fade-in">
                <div className="px-3 py-2 border-b border-ink-700/60 mb-1">
                  <div className="flex items-center gap-1.5 font-semibold text-mist-100 text-sm">{user.name} {!!user.verified && <VerifiedBadge small />}</div>
                  <div className="text-xs text-mist-400 capitalize">{user.role}{user.city ? ` · ${user.city}` : ''}</div>
                </div>
                {user.role !== 'admin' && (
                  <button className="w-full text-left nav-link block" onClick={() => { setMenuOpen(false); nav(`/profile/${user.id}`); }}>View profile</button>
                )}
                <button className="w-full text-left nav-link block" onClick={() => { setMenuOpen(false); nav('/settings'); }}>Settings</button>
                <button className="w-full text-left nav-link block text-red-300 hover:text-red-200" onClick={async () => { await logout(); nav('/'); }}>Sign out</button>
              </div>
            )}
          </div>

          <button className="lg:hidden nav-link !px-2.5" onClick={() => setMobileOpen(o => !o)} aria-label="Toggle menu" aria-haspopup="menu" aria-expanded={mobileOpen} aria-controls="mobile-nav">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" d={mobileOpen ? 'M6 18L18 6M6 6l12 12' : 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5'} /></svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav id="mobile-nav" className="lg:hidden border-t border-ink-700/60 px-4 py-3 grid grid-cols-2 gap-1 fade-in bg-ink-950">
          <GlobalSearch className="col-span-2 mb-2 md:hidden" />
          {links.map(l => (
            <NavLink key={l.to} to={l.to} onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              {l.label}{l.badge === 'messages' && counts.messages > 0 ? ` (${counts.messages})` : ''}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}
