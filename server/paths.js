// Single source of truth for where persistent data lives. On managed hosts
// (Render, Railway, Fly) point DATA_DIR at a mounted persistent disk so the
// SQLite database and all uploaded files survive restarts and redeploys, e.g.:
//
//   DATA_DIR=/opt/render/project/src/data
//   DB_PATH=/opt/render/project/src/data/fundamental.db   (optional override)
//
// DB_PATH, when set, wins outright (used by the test suite for a temp DB).
// Otherwise the database and the public/private upload folders all nest under
// DATA_DIR. When DATA_DIR is unset we fall back to the server directory, which
// preserves the original local-dev layout (server/fundamental.db, server/uploads).
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = process.env.DB_PATH || path.join(DATA_DIR, 'fundamental.db');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PRIVATE_DIR = path.join(DATA_DIR, 'uploads-private');

module.exports = { DATA_DIR, DB_FILE, UPLOAD_DIR, PRIVATE_DIR };
