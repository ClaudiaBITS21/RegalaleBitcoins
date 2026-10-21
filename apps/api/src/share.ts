import { isLang, type Lang } from '@regalale/core';
import type { Hono } from 'hono';
import type { Sql } from './db.ts';
import { ApiError } from './errors.ts';
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

// Sin formas de vos ni de tú: valen para los dos tratos.
const TITLE: Readonly<Record<Lang, string>> = { es: 'Un regalo para {para}', pt: 'Um presente para {para}', en: 'A gift for {para}', it: 'Un regalo per {para}' };
const DESCRIPTION: Readonly<Record<Lang, string>> = {
  es: 'Un regalo en bitcoin que, al abrirlo, es tuyo de verdad.',
  pt: 'Um presente em bitcoin que, ao abrir, é seu de verdade.',
  en: 'A bitcoin gift that is truly yours once you open it.',
  it: 'Un regalo in bitcoin che, una volta aperto, è davvero tuo.',
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
    const hasPreview = (await findPreview(sql, id)) !== null;
    return c.html(
      withGiftMeta(html, {
        title,
        description: DESCRIPTION[lang],
        image: hasPreview ? `${publicUrl}/api/gifts/${id}/vista.jpg` : `${publicUrl}/og.jpg`,
        url: `${publicUrl}/r/${id}`,
        alt: title,
      }),
    );
  });
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
