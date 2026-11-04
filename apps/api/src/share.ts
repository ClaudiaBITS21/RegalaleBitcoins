import { isLang, type Lang } from '@regalale/core';
import type { Hono } from 'hono';
import type { Sql } from './db.ts';
import { ApiError } from './errors.ts';
import { type Coupon, type CouponLang, couponLang, findCouponPreview, normalizeShortCode, shownCoupon } from './coupons.ts';
import { findGift } from './gifts.ts';
import { securityHeaders } from './security.ts';

// Vista previa del link de un regalo (Rodolfo, 21/10): WhatsApp y las redes leen la página del
// link desde su servidor, sin el # (la clave del regalo nunca les llega). Para /r/<id> se sirve
// la misma web, pero con la imagen de la tarjeta de ese regalo y «Un regalo para <nombre>».

export const PREVIEW_MAX_BYTES = 400_000;
const GIFT_ID = /^[A-Za-z0-9_-]{22}$/;

/** La imagen para compartir: solo JPEG, entre 1 KB y 400 KB. */
export function parsePreview(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length > Math.ceil(PREVIEW_MAX_BYTES / 3) * 4 + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new ApiError(400, 'pedido_invalido');
  }
  const data = new Uint8Array(Buffer.from(value, 'base64'));
  if (data.length < 1000 || data.length > PREVIEW_MAX_BYTES || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) throw new ApiError(400, 'pedido_invalido');
  return data;
}

async function findPreview(sql: Sql, id: string): Promise<Uint8Array | null> {
  if (!GIFT_ID.test(id)) return null;
  const [r] = await sql<{ datos: Buffer }[]>`select datos from vistas where regalo_id = ${id}`;
  return r === undefined ? null : new Uint8Array(r.datos);
}

/** Cuándo se subió la imagen (null si no hay): va en su URL, así una imagen rehecha no sale de un caché. */
async function previewVersion(sql: Sql, id: string): Promise<number | null> {
  if (!GIFT_ID.test(id)) return null;
  const [r] = await sql<{ creada: Date }[]>`select creada from vistas where regalo_id = ${id}`;
  return r === undefined ? null : Math.floor(r.creada.getTime() / 1000);
}

// Sin formas de vos ni de tú: valen para los dos tratos.
const TITLE: Readonly<Record<Lang, string>> = { es: 'Un regalo para {para}', pt: 'Um presente para {para}', en: 'A gift for {para}', it: 'Un regalo per {para}' };
const DESCRIPTION: Readonly<Record<Lang, string>> = {
  // Frase de Claudia (04/11/2026). «te» vale igual con vos y con tú.
  es: 'Alguien que te quiere, te lo demostró regalándote Bitcoin.',
  pt: 'Alguém que gosta de você demonstrou isso te dando Bitcoin de presente.',
  en: 'Someone who loves you showed it by giving you Bitcoin.',
  it: 'Qualcuno che ti vuole bene te l’ha dimostrato regalandoti Bitcoin.',
};

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Cambia el contenido de una etiqueta <meta> (por property o name) en el HTML de la web. */
function setMeta(html: string, key: string, value: string): string {
  const re = new RegExp(`(<meta\\s+(?:property|name)="${key.replace(/[.:]/g, '\\$&')}"\\s+content=")[^"]*(")`);
  return re.test(html) ? html.replace(re, `$1${esc(value)}$2`) : html.replace('</head>', `<meta property="${key}" content="${esc(value)}" />\n</head>`);
}

export function withGiftMeta(html: string, m: { title: string; description: string; image: string; url: string; alt: string }): string {
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(m.title)}</title>`);
  for (const [k, v] of [
    ['og:title', m.title],
    ['og:description', m.description],
    ['og:image', m.image],
    ['og:image:alt', m.alt],
    ['og:url', m.url],
    ['twitter:title', m.title],
    ['twitter:description', m.description],
    ['twitter:image', m.image],
  ] as const) {
    out = setMeta(out, k, v);
  }
  return out;
}

export function registerShareRoutes(app: Hono, deps: { sql: Sql; publicUrl: string; indexHtml: () => Promise<string> }): void {
  const { sql, publicUrl, indexHtml } = deps;

  app.get('/api/gifts/:id/vista.jpg', async (c) => {
    const data = await findPreview(sql, c.req.param('id'));
    if (data === null) return c.redirect(`${publicUrl}/og.jpg`, 302);
    return c.body(data as Uint8Array<ArrayBuffer>, 200, {
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
      'content-security-policy': "default-src 'none'; sandbox",
      'content-disposition': 'inline',
    });
  });

  app.use('/r/*', securityHeaders());
  app.get('/r/:id', async (c) => {
    let html: string;
    try {
      html = await indexHtml();
    } catch (e) {
      console.error(`Vista previa: sin la web (${(e as Error).message})`);
      throw new ApiError(502, 'cadena_no_disponible', 'Sin la web para la vista previa.');
    }
    const id = c.req.param('id');
    const gift = GIFT_ID.test(id) ? await findGift(sql, id).catch(() => null) : null;
    c.header('cache-control', 'no-cache');
    if (gift === null) return c.html(html);
    const lang: Lang = isLang(gift.lang) ? gift.lang : 'es';
    const title = TITLE[lang].replace('{para}', gift.to);
    const version = await previewVersion(sql, id);
    return c.html(
      withGiftMeta(html, {
        title,
        description: DESCRIPTION[lang],
        image: version !== null ? `${publicUrl}/api/gifts/${id}/vista.jpg?v=${version}` : `${publicUrl}/og.jpg`,
        url: `${publicUrl}/r/${id}`,
        alt: title,
      }),
    );
  });

  // El link corto de un cupón (/c/K7M2P): la web, con la imagen del cupón y lo que da.
  app.use('/c/*', securityHeaders());
  app.get('/c/:corto', async (c) => {
    let html: string;
    try {
      html = await indexHtml();
    } catch (e) {
      console.error(`Vista previa: sin la web (${(e as Error).message})`);
      throw new ApiError(502, 'cadena_no_disponible', 'Sin la web para la vista previa.');
    }
    const corto = normalizeShortCode(c.req.param('corto'));
    const k = corto === null ? null : await shownCoupon(sql, { corto }).catch(() => null);
    c.header('cache-control', 'no-cache');
    if (k === null) return c.html(html);
    // En el idioma en que lo compartió el admin (?l=en, Claudia 04/11/2026); si no, castellano.
    const pedido = c.req.query('l');
    const lang = couponLang(pedido);
    const title = COUPON_TITLE[lang];
    const preview = await findCouponPreview(sql, k.codigo, lang);
    const q = lang === 'es' ? '' : `l=${lang}&`;
    return c.html(
      withGiftMeta(html, {
        title,
        description: couponPreviewText(k, lang),
        image: preview !== null ? `${publicUrl}/api/c/${k.corto}/vista.jpg?${q}v=${preview.version}` : `${publicUrl}/og.jpg`,
        url: `${publicUrl}/c/${k.corto}${pedido !== undefined && /^(es|es-tu|en|pt|it)$/.test(pedido) ? `?l=${pedido}` : ''}`,
        alt: title,
      }),
    );
  });
}

const COUPON_TITLE: Readonly<Record<CouponLang, string>> = {
  es: 'Un cupón para Regalale Bitcoin',
  en: 'A coupon for Regalale Bitcoin',
  pt: 'Um cupom para o Regalale Bitcoin',
  it: 'Un coupon per Regalale Bitcoin',
};

const COUPON_WORDS: Readonly<Record<CouponLang, { off: (n: number) => string; gifts: (n: number) => string; lists: (n: number) => string; and: string; none: string; tail: string }>> = {
  es: { off: (n) => `${n} % de descuento en los packs`, gifts: (n) => (n === 1 ? '1 regalo gratis' : `${n} regalos gratis`), lists: (n) => (n === 1 ? '1 lista gratis' : `${n} listas gratis`), and: ' y ', none: 'Un cupón', tail: 'para regalar bitcoin en regalalebitcoin.com.' },
  en: { off: (n) => `${n}% off plans`, gifts: (n) => (n === 1 ? '1 free gift' : `${n} free gifts`), lists: (n) => (n === 1 ? '1 free list' : `${n} free lists`), and: ' and ', none: 'A coupon', tail: 'to give bitcoin at regalalebitcoin.com.' },
  pt: { off: (n) => `${n}% de desconto nos planos`, gifts: (n) => (n === 1 ? '1 presente grátis' : `${n} presentes grátis`), lists: (n) => (n === 1 ? '1 lista grátis' : `${n} listas grátis`), and: ' e ', none: 'Um cupom', tail: 'para presentear bitcoin em regalalebitcoin.com.' },
  it: { off: (n) => `${n}% di sconto sui piani`, gifts: (n) => (n === 1 ? '1 regalo gratis' : `${n} regali gratis`), lists: (n) => (n === 1 ? '1 lista gratis' : `${n} liste gratis`), and: ' e ', none: 'Un coupon', tail: 'per regalare bitcoin su regalalebitcoin.com.' },
};

/** Qué da un cupón, en una línea para la vista previa (sin vos ni tú). */
export function couponPreviewText(k: Coupon, lang: CouponLang = 'es'): string {
  const w = COUPON_WORDS[lang];
  const parts: string[] = [];
  if (k.descuento !== null) parts.push(w.off(k.descuento));
  if (k.da_unidad !== null && k.da_cantidad !== null) parts.push(k.da_unidad === 'regalo' ? w.gifts(k.da_cantidad) : w.lists(k.da_cantidad));
  const what = parts.length === 0 ? w.none : parts.join(w.and).replace(/^./, (x) => x.toUpperCase());
  return `${what} ${w.tail}`;
}

/** El index.html de la web: del disco (WEB_DIST) o de Firebase Hosting, guardado un minuto. */
export function indexHtmlLoader(opts: { webDist: string | null; publicUrl: string; fetchImpl?: typeof fetch }): () => Promise<string> {
  let cached: { html: string; at: number } | null = null;
  return async () => {
    if (cached !== null && Date.now() - cached.at < 60_000) return cached.html;
    let html: string;
    if (opts.webDist !== null) {
      const { readFile } = await import('node:fs/promises');
      html = await readFile(`${opts.webDist}/index.html`, 'utf8');
    } else {
      const res = await (opts.fetchImpl ?? fetch)(`${opts.publicUrl}/index.html`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`index.html respondió ${res.status}`);
      html = await res.text();
    }
    cached = { html, at: Date.now() };
    return html;
  };
}
