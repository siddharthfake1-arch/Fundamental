import { apiUrl, IS_NATIVE } from './config';

// Native session plumbing. On the web, auth is an httpOnly cookie and all of this is
// inert. The native app (Capacitor) cannot use cross-origin cookies, so it holds a
// bearer token: native.js installs these hooks at boot — onToken persists a fresh
// token to device storage, onExpired clears it when the session dies.
let authToken = null;
export function setAuthToken(t) { authToken = t || null; }
// onUser/getCachedUser let the native app keep a signed-in shell on offline cold
// starts: the last confirmed session user is cached on device and reused when the
// session probe fails with a NETWORK error (never for a real 401 rejection).
export const session = { onToken: null, onExpired: null, onUser: null, getCachedUser: null };

async function request(method, url, body) {
  // Native sends credentials:'omit' — the server intentionally never allows
  // credentialed CORS, so the pair (bearer + omit) is what keeps requests readable.
  const opts = { method, credentials: IS_NATIVE ? 'omit' : 'include', headers: {} };
  if (authToken) opts.headers.Authorization = 'Bearer ' + authToken;
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  // Abort hung requests so the UI never spins forever on a dead connection.
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 20000);
  opts.signal = ctrl.signal;
  let res;
  try { res = await fetch(apiUrl(url), opts); }
  catch (e) { clearTimeout(timeout); throw new Error(e.name === 'AbortError' ? 'The request timed out. Check your connection and try again.' : 'Network error — please try again.'); }
  clearTimeout(timeout);
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    // Centralized session-expiry handling: a 401 on anything other than the
    // session probe means the session is gone/expired — send the user to sign in.
    if (res.status === 401 && !url.endsWith('/api/auth/me') && typeof window !== 'undefined' && !location.pathname.startsWith('/login') && location.pathname !== '/') {
      session.onExpired?.();
      // Native: an in-app router transition (handled by NativeBridge) instead of a
      // full WebView reload — no white flash, no splash re-run.
      if (IS_NATIVE) window.dispatchEvent(new CustomEvent('session-expired'));
      else location.assign('/login');
    }
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  // Auth responses (login/signup/change-password) carry the session token in the
  // body for token clients — adopting it here means no page-level code changes.
  if (data && typeof data.token === 'string' && session.onToken) session.onToken(data.token);
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
  upload: (file, onProgress) => uploadTo('/api/upload', file, onProgress),
  // Private upload (data-room collateral, message attachments) — returns { key }.
  uploadPrivate: (file, onProgress) => uploadTo('/api/upload/private', file, onProgress),
};

// Defensive normalizers for API payloads. A missing/null field, or an unexpected
// shape (e.g. an object where an array was expected), must never crash a render —
// these coerce to a safe empty value so `.map`/`.length`/`.filter` are always valid.
export const asArray = (v) => (Array.isArray(v) ? v : []);
export const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function uploadTo(endpoint, file, onProgress) {
  const fd = new FormData();
  fd.append('file', file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(endpoint));
    xhr.withCredentials = !IS_NATIVE;
    if (authToken) xhr.setRequestHeader('Authorization', 'Bearer ' + authToken);
    // A stalled upload must fail visibly, never hang the progress bar forever.
    // 10 minutes accommodates a 100 MB pitch video on a slow uplink.
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        xhr.status < 400 ? resolve(data) : reject(new Error(data.error || 'Upload failed'));
      } catch { reject(new Error('Upload failed')); }
    };
    xhr.ontimeout = () => reject(new Error('The upload timed out. Check your connection and try again.'));
    xhr.onerror = () => reject(new Error('Upload failed — check your connection'));
    xhr.send(fd);
  });
}

export const fmtMoney = (n) => {
  if (n == null || n === '') return '—'; // genuine $0 should render as $0, not —
  n = Number(n);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
};

export const timeAgo = (iso) => {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'))) / 1000;
  // Malformed dates (NaN) and clock skew (future timestamps) must never render garbage.
  if (!Number.isFinite(s) || s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
