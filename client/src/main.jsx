import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import App from './App';
import { AuthProvider } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import { ToastProvider, ConfirmProvider } from './components/ui';
import ErrorBoundary from './components/ErrorBoundary';
import CookieConsent from './components/CookieConsent';
import './index.css';

// Native-only, router-coupled behavior (Android back button, deep links).
// Lazy so the chunk — and every Capacitor dependency — never loads in a browser.
const NativeBridge = lazy(() => import('./components/NativeBridge'));
const isNative = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

async function boot() {
  if (isNative) {
    // Restore the stored session token BEFORE React renders, so the initial
    // /api/auth/me probe is already authenticated. Never block the app on it.
    try { const { initNative } = await import('./native.js'); await initNative(); }
    catch (e) { console.error('native init failed', e); }
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        {/* reducedMotion="user" honors prefers-reduced-motion for all animations */}
        <MotionConfig reducedMotion="user">
          <BrowserRouter>
            <ThemeProvider>
              <ToastProvider>
                <ConfirmProvider>
                  <AuthProvider>
                    <App />
                    <CookieConsent />
                    {isNative && <Suspense fallback={null}><NativeBridge /></Suspense>}
                  </AuthProvider>
                </ConfirmProvider>
              </ToastProvider>
            </ThemeProvider>
          </BrowserRouter>
        </MotionConfig>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

boot();
