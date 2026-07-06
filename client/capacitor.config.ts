import type { CapacitorConfig } from '@capacitor/cli';

// Bundled-app configuration: the web build in dist/ ships inside the binary and
// talks to the live API (VITE_API_BASE is injected by `npm run build:mobile`).
// No server.url — a remote-URL shell risks App Store rejection and offline blanks.
const config: CapacitorConfig = {
  appId: 'co.fundamental.app',
  appName: 'Fundamental',
  webDir: 'dist',
  server: {
    // Android WebView origin becomes https://localhost — matches the server's
    // CORS allowlist (iOS uses capacitor://localhost).
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      // Held open until the session probe resolves (App.jsx calls __hideSplash).
      launchAutoHide: false,
      backgroundColor: '#000000', // matches the splash image's own background
      showSpinner: false,
    },
    Keyboard: {
      resize: 'body',
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#04091a',
    },
  },
};

export default config;
