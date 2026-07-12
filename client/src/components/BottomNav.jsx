import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { Compass, Users, Rss, MessageCircle } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { nativeBridge } from '../config';
import { Avatar } from './ui';

// Native-style bottom tab bar for phones (hidden on lg+ where the top nav has the
// full link row). Tabs mirror Instagram/LinkedIn: four core destinations plus a
// Menu tab that carries the user's avatar. Counts arrive via the 'badge-counts'
// event broadcast by the mounted header (Nav on web, MobileHeader on native), so
// there is exactly one badge poller in the app.
const TABS = [
  { to: '/discover', label: 'Discover', Icon: Compass },
  { to: '/network', label: 'Network', Icon: Users },
  { to: '/social', label: 'Social', Icon: Rss },
  { to: '/messages', label: 'Messages', Icon: MessageCircle, badge: 'messages' },
  { to: '/menu', label: 'Menu', avatar: true },
];

// Paths that light up the Menu tab even though they aren't /menu itself.
const MENU_SECTIONS = ['/menu', '/dashboard', '/settings', '/watchlist', '/pulse', '/communities', '/startups', '/admin', '/notifications'];

export default function BottomNav() {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ messages: 0, notifications: 0 });
  const loc = useLocation();

  useEffect(() => {
    const onCounts = (e) => e.detail && setCounts(e.detail);
    window.addEventListener('badge-counts', onCounts);
    return () => window.removeEventListener('badge-counts', onCounts);
  }, []);

  const isActive = (to) => to === '/menu'
    ? MENU_SECTIONS.some(p => loc.pathname === p || loc.pathname.startsWith(p + '/'))
    : loc.pathname === to || loc.pathname.startsWith(to + '/');

  return (
    <nav aria-label="Primary" className="lg:hidden kb-hide fixed bottom-0 inset-x-0 z-40 bottomnav-blur border-t border-ink-700/60 safe-bottom">
      <div className="grid grid-cols-5 max-w-md mx-auto">
        {TABS.map(({ to, label, Icon, badge, avatar }) => {
          const active = isActive(to);
          return (
            <NavLink key={to} to={to} onClick={() => nativeBridge.haptic?.('light')}
              className="relative flex flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 min-h-[54px]"
              aria-current={active ? 'page' : undefined}
              aria-label={badge && counts[badge] > 0 ? `${label}, ${counts[badge]} unread` : undefined}>
              {active && (
                <motion.span layoutId="bottomnav-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  className="absolute top-0 h-0.5 w-10 rounded-full bg-gold-400" />
              )}
              <span className="relative">
                {avatar ? (
                  <span className={`block rounded-full transition-shadow ${active ? 'ring-2 ring-gold-400' : ''}`}>
                    <Avatar src={user?.photo} name={user?.name} size={6} />
                  </span>
                ) : (
                  <Icon className={`w-[22px] h-[22px] transition-colors ${active ? 'text-gold-300' : 'text-mist-500'}`}
                    strokeWidth={active ? 2.3 : 1.8} />
                )}
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
