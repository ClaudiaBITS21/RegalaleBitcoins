// Genera los íconos (PNG) y la imagen para compartir links (Open Graph, 1200×630) a partir de
// apps/web/public/favicon.svg, con las tipografías del sitio. Corre en Chromium, sin red:
//   node apps/e2e/imagenes.ts
// Está en este paquete porque es el que tiene playwright-core.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'apps/web/public');
const coin = readFileSync(join(PUBLIC, 'favicon.svg'), 'utf8').trim();
const font = (pkg: string, file: string) =>
  `data:font/woff2;base64,${readFileSync(join(ROOT, 'apps/web/node_modules/@fontsource', pkg, 'files', file)).toString('base64')}`;

const FONTS = `
@font-face { font-family: 'Bricolage Grotesque'; font-weight: 800; src: url(${font('bricolage-grotesque', 'bricolage-grotesque-latin-800-normal.woff2')}); }
@font-face { font-family: 'DM Sans'; font-weight: 500; src: url(${font('dm-sans', 'dm-sans-latin-500-normal.woff2')}); }
@font-face { font-family: 'DM Sans'; font-weight: 700; src: url(${font('dm-sans', 'dm-sans-latin-700-normal.woff2')}); }
body { margin: 0; }`;

/** Confeti: [x, y, ancho, alto, color, giro]. */
const CONFETTI: ReadonlyArray<[number, number, number, number, string, number]> = [
  [60, 70, 22, 22, '#FFD23F', 0], [470, 40, 34, 14, '#FF5D8F', 28], [1120, 70, 18, 18, '#4CC9F0', 0],
  [600, 560, 30, 12, '#4CC9F0', -35], [40, 330, 16, 16, '#FFFFFF', 0], [1150, 520, 22, 22, '#FFFFFF', 0],
  [560, 230, 14, 14, '#1A1530', 0], [1080, 300, 32, 13, '#1A1530', -20], [700, 90, 16, 16, '#FF5D8F', 0],
  [90, 560, 30, 12, '#FFD23F', 60],
];

const confetti = CONFETTI.map(
  ([x, y, w, h, c, r]) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${w === h ? '50%' : `${h / 2}px`};background:${c};transform:rotate(${r}deg)"></div>`,
).join('');

/** Caja de regalo abierta con la moneda saltando (la de la tapa de la tarjeta). */
const GIFT = `<svg width="430" height="430" viewBox="0 0 200 200" aria-hidden="true">
<path d="M58 40 l-14 -8 M54 64 l-16 0 M142 40 l14 -8 M146 64 l16 0" stroke="#1A1530" stroke-width="4" stroke-linecap="round" fill="none"/>
<g transform="rotate(-10 100 56) translate(66 22) scale(0.944)">${coin.replace(/^<svg[^>]*>|<\/svg>$/g, '').replace('fill="#FF8A1F"', 'fill="#FFD23F"')}</g>
<rect x="52" y="126" width="96" height="64" rx="5" fill="#FF5D8F" stroke="#1A1530" stroke-width="4"/>
<rect x="92" y="126" width="16" height="64" fill="#FFD23F" stroke="#1A1530" stroke-width="3"/>
<g transform="rotate(-14 44 122)"><rect x="40" y="100" width="120" height="26" rx="5" fill="#FF5D8F" stroke="#1A1530" stroke-width="4"/>
<rect x="92" y="100" width="16" height="26" fill="#FFD23F" stroke="#1A1530" stroke-width="3"/></g></svg>`;

const OG = `<!doctype html><meta charset="utf-8"><style>${FONTS}</style>
<div style="position:relative;width:1200px;height:630px;overflow:hidden;background:#FF8A1F;color:#1A1530;font-family:'DM Sans',sans-serif">
${confetti}
<div style="position:absolute;left:80px;top:96px;width:640px;display:flex;flex-direction:column;gap:26px">
  <div style="font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:104px;line-height:0.95;letter-spacing:-0.02em">Regalale<br>bitcoin</div>
  <div style="font-size:36px;font-weight:500;line-height:1.25;max-width:600px">Un regalo que, cuando lo abrís, es tuyo de verdad.</div>
  <div style="align-self:flex-start;margin-top:22px;padding:14px 26px;border-radius:999px;background:#1A1530;color:#FFD23F;font-weight:700;font-size:30px">regalalebitcoin.com</div>
</div>
<div style="position:absolute;right:50px;top:90px">${GIFT}</div>
</div>`;

const icon = (size: number, padding: number, bg: string) =>
  `<!doctype html><meta charset="utf-8"><style>body{margin:0}</style>
<div style="width:${size}px;height:${size}px;background:${bg};display:flex;align-items:center;justify-content:center">
<div style="width:${size - 2 * padding}px;height:${size - 2 * padding}px">${coin.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const shoot = async (html: string, w: number, h: number, out: string, type: 'png' | 'jpeg' = 'png') => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(join(PUBLIC, out), await page.screenshot({ type, ...(type === 'jpeg' ? { quality: 88 } : { omitBackground: true }) }));
  await page.close();
  console.log(`OK: ${out}`);
};

await shoot(OG, 1200, 630, 'og.jpg', 'jpeg');
await shoot(icon(32, 0, 'transparent'), 32, 32, 'favicon-32.png');
// iOS no acepta transparencia: fondo blanco con margen.
await shoot(icon(180, 14, '#FFFFFF'), 180, 180, 'apple-touch-icon.png');
await shoot(icon(192, 6, 'transparent'), 192, 192, 'icon-192.png');
await shoot(icon(512, 16, 'transparent'), 512, 512, 'icon-512.png');
// Android recorta los íconos "maskable" en círculo: la moneda dentro de la zona segura (80 %).
await shoot(icon(512, 72, '#FFD23F'), 512, 512, 'icon-maskable-512.png');
await browser.close();
