import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import { api } from '../api';
import { Avatar, Logo, VerifiedBadge } from './ui';

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
  const nav = useNavigate();

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try { const c = await api.get('/api/badge-counts'); if (alive) setCounts(c); } catch {}
    };
    poll();
    const t = setInterval(poll, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    const fn = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const links = [...LINKS];
  if (user.role === 'investor') links.splice(6, 0, { to: '/watchlist', label: 'Pipeline' });
  if (user.role === 'admin') links.push({ to: '/admin', label: 'Admin' });

  return (
    <header className="sticky top-0 z-40 bg-ink-950/85 backdrop-blur-lg border-b border-ink-700/60">
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

        <div className="flex items-center gap-2 ml-auto lg:ml-0">
          <button onClick={toggle} className="nav-link !px-2.5" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <NavLink to="/notifications" className={({ isActive }) => `nav-link !px-2.5 ${isActive ? 'nav-link-active' : ''}`} title="Notifications">
            <span className="relative inline-block">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
              {counts.notifications > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-gold-400 text-ink-950 text-[10px] font-bold flex items-center justify-center">{counts.notifications}</span>}
            </span>
          </NavLink>

          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(o => !o)} className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-ink-800 transition-colors">
              <Avatar src={user.photo} name={user.name} size={8} />
              <svg className="w-3.5 h-3.5 text-mist-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-60 card p-2 fade-in">
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

          <button className="lg:hidden nav-link !px-2.5" onClick={() => setMobileOpen(o => !o)} aria-label="Toggle menu">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" d={mobileOpen ? 'M6 18L18 6M6 6l12 12' : 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5'} /></svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="lg:hidden border-t border-ink-700/60 px-4 py-3 grid grid-cols-2 gap-1 fade-in bg-ink-950">
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
