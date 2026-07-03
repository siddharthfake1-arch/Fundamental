import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from './AuthContext';
import Nav from './components/Nav';
import ErrorBoundary from './components/ErrorBoundary';
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
import Legal from './pages/Legal';

function RedirectToStartup() {
  const { id } = useParams();
  return <Navigate to={`/startup/${id}`} replace />;
}

// Honest 404 instead of a silent redirect — a mistyped or dead link should say so.
function NotFound({ homeTo = '/' }) {
  const loc = useLocation();
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="card p-10 text-center max-w-md">
        <div className="h-display text-5xl text-mist-500 mb-3">404</div>
        <div className="h-display text-lg">This page doesn't exist</div>
        <p className="text-sm text-mist-400 mt-2 break-all">We couldn't find <code>{loc.pathname}</code>. It may have moved or been removed.</p>
        <a href={homeTo} className="btn-primary btn-sm inline-flex mt-5">Go home</a>
      </div>
    </div>
  );
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
        <Route path="/legal/:doc" element={<Legal />} />
        <Route path="*" element={<NotFound homeTo="/" />} />
      </Routes>
    );
  }

  if (!user.onboarded && user.role !== 'admin' && loc.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="min-h-screen">
      {loc.pathname !== '/onboarding' && <Nav />}
      {/* Route-scoped boundary: a page render crash is caught here and auto-clears
          when the route changes (resetKey), so one bad page never traps the session.
          Nav stays mounted above it, so the user can always navigate away. */}
      <ErrorBoundary resetKey={loc.pathname + loc.search}>
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
          <Route path="/legal/:doc" element={<Legal />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound homeTo="/discover" />} />
          </Routes>
        </motion.main>
      </ErrorBoundary>
    </div>
  );
}
