import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Activity, UsersRound, Target, Bell, Settings as SettingsIcon,
  ShieldCheck, Sun, Moon, LogOut, ChevronRight, Building2,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import { Avatar, VerifiedBadge, useConfirm } from '../components/ui';
import { nativeBridge } from '../config';

// The fifth tab on phones: everything that isn't a core destination lives here
// as large native list rows — the mobile answer to the desktop nav's link row
// and account dropdown.
export default function Menu() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const confirm = useConfirm();
  const nav = useNavigate();
  const [counts, setCounts] = useState({ notifications: 0, messages: 0 });

  useEffect(() => {
    const onCounts = (e) => e.detail && setCounts(e.detail);
    window.addEventListener('badge-counts', onCounts);
    return () => window.removeEventListener('badge-counts', onCounts);
  }, []);

  const Row = ({ to, onClick, Icon, label, badge, danger, right }) => {
    const inner = (
      <>
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${danger ? 'bg-red-500/10 text-red-400' : 'bg-ink-800 text-mist-300'}`}>
          <Icon className="w-[18px] h-[18px]" />
        </span>
        <span className={`flex-1 ${danger ? 'text-red-300' : ''}`}>{label}</span>
        {badge > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-gold-400 text-ink-950 text-[11px] font-bold flex items-center justify-center">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
        {right || <ChevronRight className="w-4 h-4 text-mist-500" />}
      </>
    );
    const cls = 'menu-row';
    const tap = () => nativeBridge.haptic?.('light');
    return to
      ? <Link to={to} className={cls} onClick={tap}>{inner}</Link>
      : <button className={cls} onClick={() => { tap(); onClick?.(); }}>{inner}</button>;
  };

  const isInvestor = user.role === 'investor';
  const isAdmin = user.role === 'admin';

  return (
    <div className="max-w-md mx-auto fade-in">
      {/* Profile card — tap through to the public profile */}
      {!isAdmin ? (
        <Link to={`/profile/${user.id}`} className="card flex items-center gap-4 p-4 mb-5 active:bg-ink-800 transition-colors"
          onClick={() => nativeBridge.haptic?.('light')}>
          <Avatar src={user.photo} name={user.name} size={14} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-display font-bold text-mist-100">{user.name}{!!user.verified && <VerifiedBadge small />}</div>
            <div className="text-xs text-mist-400 capitalize mt-0.5">{user.role}{user.city ? ` · ${user.city}` : ''}</div>
            <div className="text-xs text-gold-300 mt-1">View profile →</div>
          </div>
        </Link>
      ) : (
        <div className="card flex items-center gap-4 p-4 mb-5">
          <Avatar src={user.photo} name={user.name} size={14} />
          <div>
            <div className="font-display font-bold text-mist-100">{user.name}</div>
            <div className="text-xs text-mist-400">Administrator</div>
          </div>
        </div>
      )}

      <div className="card p-2 mb-5">
        <Row to="/dashboard" Icon={LayoutDashboard} label="Dashboard" />
        <Row to="/pulse" Icon={Activity} label="Market Pulse" />
        <Row to="/communities" Icon={UsersRound} label="Communities" />
        <Row to="/startups" Icon={Building2} label="Startup index" />
        {isInvestor && <Row to="/watchlist" Icon={Target} label="Pipeline" />}
        <Row to="/notifications" Icon={Bell} label="Notifications" badge={counts.notifications} />
        {isAdmin && <Row to="/admin" Icon={ShieldCheck} label="Admin" />}
      </div>

      <div className="card p-2 mb-5">
        <Row onClick={toggle} Icon={theme === 'dark' ? Sun : Moon}
          label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} right={<span />} />
        <Row to="/settings" Icon={SettingsIcon} label="Settings" />
      </div>

      <div className="card p-2 mb-6">
        <Row danger Icon={LogOut} label="Sign out" right={<span />}
          onClick={async () => {
            const ok = await confirm({ title: 'Sign out?', body: 'You can sign back in any time.', confirmLabel: 'Sign out' });
            if (ok) { await logout(); nav('/'); }
          }} />
      </div>

      <div className="text-center text-[11px] text-mist-500 space-x-3 pb-2">
        <Link to="/legal/terms" className="hover:text-mist-300">Terms</Link>
        <Link to="/legal/privacy" className="hover:text-mist-300">Privacy</Link>
        <span>Fundamental</span>
      </div>
    </div>
  );
}
