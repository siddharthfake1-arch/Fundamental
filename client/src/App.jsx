import { lazy, Suspense, useEffect } from 'react';
import { Link, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from './AuthContext';
import Nav from './components/Nav';
import MobileHeader from './components/MobileHeader';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBanner from './components/OfflineBanner';
import BottomNav from './components/BottomNav';
import { IS_NATIVE } from './config';
import { Spinner } from './components/ui';
// Discover is the app's default route — it stays in the entry chunk so the
// common cold start renders without a second fetch. Every other page loads on
// demand: logged-out visitors never download the app, and the app never
// downloads the marketing/auth pages. Chunks are content-hashed + immutable,
// so each page is fetched at most once per deploy.
import Discover from './pages/Discover';
const Menu = lazy(() => import('./pages/Menu'));
const Auth = lazy(() => import('./pages/Auth'));
const Landing = lazy(() => import('./pages/Landing'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Startups = lazy(() => import('./pages/Startups'));
const Startup = lazy(() => import('./pages/Startup'));
const Profile = lazy(() => import('./pages/Profile'));
const Network = lazy(() => import('./pages/Network'));
const Messages = lazy(() => import('./pages/Messages'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Social = lazy(() => import('./pages/Social'));
const Watchlist = lazy(() => import('./pages/Watchlist'));
const Settings = lazy(() => import('./pages/Settings'));
const Admin = lazy(() => import('./pages/Admin'));
const PublicStartup = lazy(() => import('./pages/PublicStartup'));
const Pulse = lazy(() => import('./pages/Pulse'));
const Communities = lazy(() => import('./pages/Communities'));
const Legal = lazy(() => import('./pages/Legal'));

function RedirectToStartup() {
  const { id } = useParams();
  return <Navigate to={`/startup/${id}`} replace />;
}

// Honest 404 instead of a silent redirect — a mistyped or dead link should say so,
// and the person holding it should have every quick way out.
function NotFound({ homeTo = '/' }) {
  const loc = useLocation();
  const { user } = useAuth();
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="card p-10 text-center max-w-md">
        <div className="h-display text-5xl text-mist-500 mb-3">404</div>
        <div className="h-display text-lg">This page doesn't exist</div>
        <p className="text-sm text-mist-400 mt-2 break-all">We couldn't find <code>{loc.pathname}</code>. It may have moved or been removed.</p>
        <div className="flex justify-center gap-2 flex-wrap mt-5">
          <Link to={homeTo} className="btn-primary btn-sm">Go home</Link>
          {!user && <Link to="/login" className="btn-ghost btn-sm">Sign in</Link>}
          {!user && <Link to="/signup" className="btn-ghost btn-sm">Create account</Link>}
          {user && <Link to="/discover" className="btn-ghost btn-sm">Discover startups</Link>}
        </div>
      </div>
    </div>
  );
}

// Route-aware document titles: the tab bar and history read like the app, and
// shared links carry the page name. Detail pages set their own richer titles.
const TITLES = {
  '/discover': 'Discover', '/startups': 'Startups', '/pulse': 'Market Pulse',
  '/communities': 'Communities', '/network': 'Network', '/messages': 'Messages',
  '/dashboard': 'Dashboard', '/notifications': 'Notifications', '/social': 'Social',
  '/watchlist': 'Pipeline', '/settings': 'Settings', '/menu': 'Menu', '/admin': 'Admin',
  '/onboarding': 'Welcome', '/login': 'Sign in', '/signup': 'Create account',
};
function usePageTitle(pathname) {
  useEffect(() => {
    const t = TITLES[pathname];
    document.title = t ? `${t} · Fundamental` : 'Fundamental — Fundraising? Fundamental.';
  }, [pathname]);
}

export default function App() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  usePageTitle(loc.pathname);

  // Native: hold the splash screen until the session probe resolves (no white flash).
  useEffect(() => { if (!loading) window.__hideSplash?.(); }, [loading]);

  // A new page must start at the top — without this, navigating from a scrolled
  // feed into a detail page lands mid-page. Search-only changes keep the scroll.
  // 'instant' bypasses the html smooth-scroll behavior: a page change is a cut,
  // not an animated scroll through the outgoing page.
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [loc.pathname]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>;

  if (!user) {
    return (
      <>
      <OfflineBanner />
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner /></div>}>
        <Routes>
          {/* A native app should open on sign-in, not the marketing site. */}
          <Route path="/" element={IS_NATIVE ? <Navigate to="/login" replace /> : <Landing />} />
          <Route path="/login" element={<Auth />} />
          {/* /signup is canonical for account creation — links, ads, and emails
              will guess it, and a 404 on a signup URL costs real conversions. */}
          <Route path="/signup" element={<Auth />} />
          <Route path="/register" element={<Navigate to="/signup" replace />} />
          <Route path="/s/:id" element={<PublicStartup />} />
          <Route path="/legal/:doc" element={<Legal />} />
          <Route path="*" element={<NotFound homeTo="/" />} />
        </Routes>
      </Suspense>
      </>
    );
  }

  if (!user.onboarded && user.role !== 'admin' && loc.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="min-h-screen">
      <OfflineBanner />
      {/* Native gets the compact contextual header — the full web nav (link row +
          hamburger) is desktop chrome that steals vertical space on a phone. */}
      {loc.pathname !== '/onboarding' && (IS_NATIVE ? <MobileHeader /> : <Nav />)}
      {loc.pathname !== '/onboarding' && <BottomNav />}
      {/* Route-scoped boundary: a page render crash is caught here and auto-clears
          when the route changes (resetKey), so one bad page never traps the session.
          Nav stays mounted above it, so the user can always navigate away. */}
      <ErrorBoundary resetKey={loc.pathname + loc.search}>
        <motion.main
          key={loc.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-7xl mx-auto px-4 pt-4 sm:pt-6 main-pad-bottom">
          <Suspense fallback={<Spinner />}>
          <Routes>
          <Route path="/" element={<Navigate to="/discover" replace />} />
          {/* Already signed in: auth URLs land in the app, never on a 404. */}
          <Route path="/login" element={<Navigate to="/discover" replace />} />
          <Route path="/signup" element={<Navigate to="/discover" replace />} />
          <Route path="/register" element={<Navigate to="/discover" replace />} />
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
          <Route path="/menu" element={<Menu />} />
          <Route path="/legal/:doc" element={<Legal />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound homeTo="/discover" />} />
          </Routes>
          </Suspense>
        </motion.main>
      </ErrorBoundary>
    </div>
  );
}
