async function request(method, url, body) {
  const opts = { method, credentials: 'include', headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
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

function uploadTo(endpoint, file, onProgress) {
  const fd = new FormData();
  fd.append('file', file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        xhr.status < 400 ? resolve(data) : reject(new Error(data.error || 'Upload failed'));
      } catch { reject(new Error('Upload failed')); }
    };
    xhr.onerror = () => reject(new Error('Upload failed — check your connection'));
    xhr.send(fd);
  });
}

export const fmtMoney = (n) => {
  if (!n) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
};

export const timeAgo = (iso) => {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'))) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
