// Regenerate all Fundamental app icons + splash screens from the new raster gem
// logo. Renders with headless Chromium and writes directly into the Capacitor
// android/ and ios/ projects plus public/ (favicon + PWA maskable) and store-assets/.
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';

const REPO = '/home/user/Fundamental/client';
const GEM = fs.readFileSync(path.join(REPO, 'scripts/app-icon-master.png')).toString('base64');
const WORDMARK = fs.readFileSync(path.join(REPO, 'public/logo-dark.png')).toString('base64'); // white text
const gemUri = `data:image/png;base64,${GEM}`;
const wmUri = `data:image/png;base64,${WORDMARK}`;

// Premium dark tile: near-black with a soft plum glow behind the gem so the icon
// has presence on both light and dark home screens.
const TILE_BG = 'radial-gradient(circle at 50% 44%, #1c1140 0%, #0a0616 55%, #050309 100%)';

// Full-bleed icon tile (opaque). gemScale = gem width as % of the tile.
const iconHtml = (gemScale) => `<!doctype html><html><body style="margin:0;width:100vw;height:100vh;overflow:hidden;background:${TILE_BG};display:flex;align-items:center;justify-content:center">
  <img src="${gemUri}" style="width:${gemScale}vmin;height:${gemScale}vmin;object-fit:contain;filter:drop-shadow(0 4px 18px rgba(128,82,255,0.35))" />
</body></html>`;

// Adaptive foreground: transparent, gem confined to the center safe zone (~60%).
const fgHtml = `<!doctype html><html><body style="margin:0;width:100vw;height:100vh;overflow:hidden;background:transparent;display:flex;align-items:center;justify-content:center">
  <img src="${gemUri}" style="width:58vmin;height:58vmin;object-fit:contain" />
</body></html>`;

// Splash: the full lockup (gem + wordmark, which the wordmark file already
// contains) centered on black — no duplicate gem.
const splashHtml = `<!doctype html><html><body style="margin:0;width:100vw;height:100vh;overflow:hidden;background:#000;display:flex;align-items:center;justify-content:center">
  <img src="${wmUri}" style="width:56vmin;max-width:72vw;height:auto;object-fit:contain;filter:drop-shadow(0 6px 30px rgba(128,82,255,0.3))" />
</body></html>`;

function stripAlpha(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const out = new PNG({ width: png.width, height: png.height, colorType: 2 });
  for (let i = 0; i < png.width * png.height; i++) {
    out.data[i*4] = png.data[i*4]; out.data[i*4+1] = png.data[i*4+1];
    out.data[i*4+2] = png.data[i*4+2]; out.data[i*4+3] = 255;
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
  console.log('wrote', dest.replace(REPO, ''), `${w}x${h}`);
}

const A = path.join(REPO, 'android/app/src/main/res');
const I = path.join(REPO, 'ios/App/App/Assets.xcassets');

// ---- Android launcher icons (legacy square/round, opaque) ----
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, s] of Object.entries(densities)) {
  await shot(iconHtml(72), s, s, `${A}/mipmap-${d}/ic_launcher.png`, { opaque: true });
  await shot(iconHtml(72), s, s, `${A}/mipmap-${d}/ic_launcher_round.png`, { opaque: true });
}
// Adaptive foregrounds (transparent, gem in safe zone)
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
await shot(iconHtml(72), 1024, 1024, `${I}/AppIcon.appiconset/AppIcon-512@2x.png`, { opaque: true });
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await shot(splashHtml, 2732, 2732, `${I}/Splash.imageset/${f}`);
}

// ---- Web: PWA maskable (gem on solid dark, extra safe padding) ----
await shot(iconHtml(58), 512, 512, `${REPO}/public/pwa-maskable-512.png`, { opaque: true });

// ---- Store assets (listings only) ----
const S = `${REPO}/store-assets`;
await shot(iconHtml(72), 512, 512, `${S}/playstore-icon-512.png`, { opaque: true });
await shot(iconHtml(66), 1024, 1024, `${S}/appstore-icon-1024.png`, { opaque: true });
await shot(splashHtml, 1024, 500, `${S}/play-feature-graphic-1024x500.png`, { opaque: true });

await browser.close();
console.log('done');
