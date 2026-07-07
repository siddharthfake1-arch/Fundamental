import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { Compass, Users, Rss, MessageCircle, LayoutDashboard } from 'lucide-react';
import { nativeBridge } from '../config';

// Native-style bottom tab bar for phones (hidden on lg+ where the top nav has the
// full link row). The active tab carries an animated indicator; Messages shows the
// unread badge. Counts arrive via the 'badge-counts' event broadcast by Nav's poll,
// so there is exactly one badge poller in the app.
const TABS = [
  { to: '/discover', label: 'Discover', Icon: Compass },
  { to: '/network', label: 'Network', Icon: Users },
  { to: '/social', label: 'Social', Icon: Rss },
  { to: '/messages', label: 'Messages', Icon: MessageCircle, badge: 'messages' },
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
];

export default function BottomNav() {
  const [counts, setCounts] = useState({ messages: 0, notifications: 0 });
  const loc = useLocation();

  useEffect(() => {
    const onCounts = (e) => e.detail && setCounts(e.detail);
    window.addEventListener('badge-counts', onCounts);
    return () => window.removeEventListener('badge-counts', onCounts);
  }, []);

  return (
    <nav aria-label="Primary" className="lg:hidden fixed bottom-0 inset-x-0 z-40 bottomnav-blur border-t border-ink-700/60 safe-bottom">
      <div className="grid grid-cols-5 max-w-md mx-auto">
        {TABS.map(({ to, label, Icon, badge }) => {
          const active = loc.pathname === to || loc.pathname.startsWith(to + '/');
          return (
            <NavLink key={to} to={to} onClick={() => nativeBridge.haptic?.('light')}
              className="relative flex flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 min-h-[54px]"
              aria-current={active ? 'page' : undefined}>
              {active && (
                <motion.span layoutId="bottomnav-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  className="absolute top-0 h-0.5 w-10 rounded-full bg-gold-400" />
              )}
              <span className="relative">
                <Icon className={`w-[22px] h-[22px] transition-colors ${active ? 'text-gold-300' : 'text-mist-500'}`}
                  strokeWidth={active ? 2.3 : 1.8} />
                {badge && counts[badge] > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-gold-400 text-ink-950 text-[10px] font-bold flex items-center justify-center">
                    {counts[badge] > 99 ? '99+' : counts[badge]}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-semibold transition-colors ${active ? 'text-gold-300' : 'text-mist-500'}`}>{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
