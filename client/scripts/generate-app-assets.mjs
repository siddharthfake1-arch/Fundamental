// Render Fundamental's app icons + splash screens with headless Chromium and place
// them directly into the Capacitor android/ and ios/ projects.
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';

const REPO = '/home/user/Fundamental/client';
const SVG = fs.readFileSync(path.join(REPO, 'public/favicon.svg'), 'utf8');
const LOGO = fs.readFileSync(path.join(REPO, 'public/logo-dark.png')).toString('base64');
const BG = '#04091a';

const iconHtml = (pad = 0) => `<!doctype html><html><body style="margin:0;background:${BG};display:flex;align-items:center;justify-content:center;width:100vw;height:100vh;overflow:hidden">
  <div style="width:${100 - pad * 2}vmin;height:${100 - pad * 2}vmin;display:flex">${SVG.replace('width="64" height="64"', 'width="100%" height="100%"')}</div>
</body></html>`;

// Adaptive foreground: transparent bg, mark confined to the center safe zone (~56%).
const fgHtml = `<!doctype html><html><body style="margin:0;background:transparent;display:flex;align-items:center;justify-content:center;width:100vw;height:100vh;overflow:hidden">
  <div style="width:56vmin;height:56vmin;display:flex">${SVG.replace('width="64" height="64"', 'width="100%" height="100%"')}</div>
</body></html>`;

const SPLASH_BG = '#000000';
const splashHtml = `<!doctype html><html><body style="margin:0;background:${SPLASH_BG};display:flex;align-items:center;justify-content:center;width:100vw;height:100vh;overflow:hidden">
  <img src="data:image/png;base64,${LOGO}" style="width:52vmin;max-width:70vw;height:auto" />
</body></html>`;

function stripAlpha(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const out = new PNG({ width: png.width, height: png.height, colorType: 2 }); // truecolor, no alpha
  for (let i = 0; i < png.width * png.height; i++) {
    out.data[i * 4] = png.data[i * 4];
    out.data[i * 4 + 1] = png.data[i * 4 + 1];
    out.data[i * 4 + 2] = png.data[i * 4 + 2];
    out.data[i * 4 + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(out, { colorType: 2 }));
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function shot(html, w, h, dest, { transparent = false, opaque = false } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await page.screenshot({ path: dest, omitBackground: transparent });
  await page.close();
  if (opaque) stripAlpha(dest);
  console.log('wrote', dest, `${w}x${h}`);
}

const A = path.join(REPO, 'android/app/src/main/res');
const I = path.join(REPO, 'ios/App/App/Assets.xcassets');

// ---- Android launcher icons ----
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, s] of Object.entries(densities)) {
  await shot(iconHtml(0), s, s, `${A}/mipmap-${d}/ic_launcher.png`, { opaque: true });
  await shot(iconHtml(0), s, s, `${A}/mipmap-${d}/ic_launcher_round.png`, { opaque: true });
}
// Adaptive foregrounds (transparent, mark in safe zone)
const fg = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
for (const [d, s] of Object.entries(fg)) {
  await shot(fgHtml, s, s, `${A}/mipmap-${d}/ic_launcher_foreground.png`, { transparent: true });
}

// ---- Android splash ----
const land = { mdpi: [480, 320], hdpi: [800, 480], xhdpi: [1280, 720], xxhdpi: [1600, 960], xxxhdpi: [1920, 1280] };
const port = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [d, [w, h]] of Object.entries(land)) await shot(splashHtml, w, h, `${A}/drawable-land-${d}/splash.png`);
for (const [d, [w, h]] of Object.entries(port)) await shot(splashHtml, w, h, `${A}/drawable-port-${d}/splash.png`);
await shot(splashHtml, 480, 320, `${A}/drawable/splash.png`);

// ---- iOS ----
await shot(iconHtml(0), 1024, 1024, `${I}/AppIcon.appiconset/AppIcon-512@2x.png`, { opaque: true });
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await shot(splashHtml, 2732, 2732, `${I}/Splash.imageset/${f}`);
}

// ---- Store assets (kept out of the app, used for listings) ----
const S = '/home/user/Fundamental/client/store-assets';
await shot(iconHtml(0), 512, 512, `${S}/playstore-icon-512.png`, { opaque: true });
await shot(iconHtml(6), 1024, 1024, `${S}/appstore-icon-1024.png`, { opaque: true });
await shot(splashHtml, 1024, 500, `${S}/play-feature-graphic-1024x500.png`, { opaque: true });

await browser.close();
console.log('done');
