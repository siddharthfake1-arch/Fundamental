import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from './AuthContext';
import Nav from './components/Nav';
import { Spinner } from './components/ui';
import Auth from './pages/Auth';
import Landing from './pages/Landing';
import Onboarding from './pages/Onboarding';
import Discover from './pages/Discover';
import Startups from './pages/Startups';
import Startup from './pages/Startup';
import Profile from './pages/Profile';
import Network from './pages/Network';
import Messages from './pages/Messages';
import Dashboard from './pages/Dashboard';
import Notifications from './pages/Notifications';
import Social from './pages/Social';
import Watchlist from './pages/Watchlist';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import PublicStartup from './pages/PublicStartup';
import Pulse from './pages/Pulse';
import Communities from './pages/Communities';

function RedirectToStartup() {
  const { id } = useParams();
  return <Navigate to={`/startup/${id}`} replace />;
}

export default function App() {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>;

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/s/:id" element={<PublicStartup />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (!user.onboarded && user.role !== 'admin' && loc.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="min-h-screen">
      {loc.pathname !== '/onboarding' && <Nav />}
      <motion.main
        key={loc.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-7xl mx-auto px-4 py-6 pb-20">
        <Routes>
          <Route path="/" element={<Navigate to="/discover" replace />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/startups" element={<Startups />} />
          <Route path="/startup/:id" element={<Startup />} />
          <Route path="/s/:id" element={<RedirectToStartup />} />
          <Route path="/profile/:id" element={<Profile />} />
          <Route path="/pulse" element={<Pulse />} />
          <Route path="/communities" element={<Communities />} />
          <Route path="/communities/:slug" element={<Communities />} />
          <Route path="/network" element={<Network />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/social" element={<Social />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/discover" replace />} />
        </Routes>
      </motion.main>
    </div>
  );
}
