import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, Search, Bell } from 'lucide-react';
import { api } from '../api';
import { nativeBridge } from '../config';
import { GlobalSearch } from './Nav';
import { Logo } from './ui';

// Titles for root/section pages. Anything else (detail pages) shows a back
// chevron + a contextual label so the header never wastes space on chrome.
const TITLES = {
  '/discover': null, // roots show the wordmark
  '/social': 'Social',
  '/network': 'Network',
  '/messages': 'Messages',
  '/menu': null,
  '/pulse': 'Market Pulse',
  '/communities': 'Communities',
  '/dashboard': 'Dashboard',
  '/watchlist': 'Pipeline',
  '/notifications': 'Notifications',
  '/settings': 'Settings',
  '/startups': 'Startups',
  '/admin': 'Admin',
};
const ROOTS = new Set(['/discover', '/social', '/network', '/messages', '/menu']);

// Compact contextual header for the NATIVE app. Replaces the full web nav:
// no link row, no hamburger — the bottom tab bar owns navigation. It slides
// away on scroll-down and returns on scroll-up so content gets the screen.
export default function MobileHeader() {
  const loc = useLocation();
  const nav = useNavigate();
  const [counts, setCounts] = useState({ notifications: 0, messages: 0 });
  const [searchOpen, setSearchOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  // This header owns the badge poll when the web Nav isn't mounted (native).
  // It broadcasts 'badge-counts' so BottomNav's Messages badge stays in sync.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const c = await api.get('/api/badge-counts');
        if (alive) { setCounts(c); window.dispatchEvent(new CustomEvent('badge-counts', { detail: c })); }
      } catch { /* transient */ }
    };
    poll();
    const t = setInterval(poll, 15000);
    window.addEventListener('badge-refresh', poll);
    window.addEventListener('app-resumed', poll);
    return () => { alive = false; clearInterval(t); window.removeEventListener('badge-refresh', poll); window.removeEventListener('app-resumed', poll); };
  }, []);

  // Instagram-style: hide on scroll down, reveal on scroll up or near the top.
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 24) setHidden(false);
      else if (y > lastY.current + 6) setHidden(true);
      else if (y < lastY.current - 6) setHidden(false);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Android back closes the search overlay before navigating.
  const searchOpenRef = useRef(false);
  searchOpenRef.current = searchOpen;
  useEffect(() => {
    const onBack = (e) => { if (searchOpenRef.current) { e.preventDefault(); setSearchOpen(false); } };
    window.addEventListener('app-back', onBack);
    return () => window.removeEventListener('app-back', onBack);
  }, []);

  const isRoot = ROOTS.has(loc.pathname);
  const title = TITLES[loc.pathname];
  const detail = !(loc.pathname in TITLES); // e.g. /startup/7, /profile/3

  return (
    <>
      <header className={`sticky top-0 z-40 mobile-header border-b border-ink-700/50 safe-top transition-transform duration-200 ${hidden && !searchOpen ? '-translate-y-full' : ''}`}>
        <div className="h-12 px-2 flex items-center gap-1">
          {detail || !isRoot ? (
            <button onClick={() => (window.history.length > 1 ? nav(-1) : nav('/discover'))}
              aria-label="Back" className="p-2.5 -ml-0.5 rounded-xl active:bg-ink-800 text-mist-200">
              <ChevronLeft className="w-6 h-6" />
            </button>
          ) : <span className="w-2" />}

          {title ? (
            <span className="h-display text-[17px] truncate">{title}</span>
          ) : detail ? (
            <span className="h-display text-[17px] text-mist-400">Fundamental</span>
          ) : (
            <Link to="/discover" className="flex items-center"><Logo className="h-[42px]" /></Link>
          )}

          <span className="flex-1" />

          <button onClick={() => { setSearchOpen(true); nativeBridge.haptic?.('light'); }}
            aria-label="Search" className="p-2.5 rounded-xl active:bg-ink-800 text-mist-300">
            <Search className="w-[22px] h-[22px]" />
          </button>
          <Link to="/notifications" aria-label={`Notifications${counts.notifications > 0 ? `, ${counts.notifications} unread` : ''}`}
            className="relative p-2.5 rounded-xl active:bg-ink-800 text-mist-300">
            <Bell className="w-[22px] h-[22px]" />
            {counts.notifications > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-gold-400 text-ink-950 text-[10px] font-bold flex items-center justify-center">
                {counts.notifications > 99 ? '99+' : counts.notifications}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Full-screen search overlay — native pattern instead of a dropdown in a cramped bar */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-ink-950 safe-top">
            <div className="h-12 px-2 flex items-center gap-1 border-b border-ink-700/50">
              <button onClick={() => setSearchOpen(false)} aria-label="Close search"
                className="p-2.5 rounded-xl active:bg-ink-800 text-mist-200">
                <ChevronLeft className="w-6 h-6" />
              </button>
              <GlobalSearch className="flex-1 mr-2" autoFocus onNavigate={() => setSearchOpen(false)} />
            </div>
            <div className="p-6 text-center text-sm text-mist-500">Search startups, people, and communities.</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
