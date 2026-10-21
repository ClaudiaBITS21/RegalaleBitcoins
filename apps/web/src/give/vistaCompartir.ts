import type { Lang } from '@regalale/core';
import { h, render } from 'preact';
import { type CardStyle, GiftCardArt } from '../content/GiftCardArt.tsx';
import { occasionLabel } from '../content/occasions.ts';
import { translate } from '../i18n/index.ts';
import { artImage } from './tarjetaPdf.ts';

// Imagen para compartir el link de un regalo (Rodolfo, 21/10): la que muestran WhatsApp y las
// redes en la vista previa del link (1200 × 630). Se arma acá al crear el regalo, con la misma
// ilustración de la tarjeta, la ocasión y el nombre de quien recibe, y viaja con el regalo. Si
// algo falla, el regalo se crea igual y el link usa la imagen general del sitio.

const W = 1200;
const H = 630;
const TINTA = '#1a1530';
const NARANJA = '#ff8a1f';
const AMARILLO = '#ffd23f';
const TITULOS = '"Bricolage Grotesque", system-ui, sans-serif';
const TEXTO = '"DM Sans", system-ui, sans-serif';

/** Confeti en los bordes: [x, y, ancho, alto, color, giro]. */
const CONFETI: readonly (readonly [number, number, number, number, string, number])[] = [
  [40, 34, 20, 20, AMARILLO, 0],
  [520, 26, 34, 14, '#ff5d8f', 28],
  [1130, 40, 18, 18, '#4cc9f0', 0],
  [1080, 560, 30, 12, '#4cc9f0', -35],
  [30, 560, 16, 16, '#ffffff', 0],
  [640, 590, 22, 22, '#ffffff', 0],
];

export interface PreviewInput {
  readonly lang: Lang;
  readonly occasion: string;
  readonly occasionFree: string;
  readonly style: CardStyle;
  /** data: de la imagen propia (estilo «propia»). */
  readonly ownImage: string | null;
  readonly to: string;
}

/** La imagen para compartir en JPEG, en base64; null si no se pudo armar. */
export async function sharePreview(g: PreviewInput): Promise<string | null> {
  try {
    // La ilustración, dibujada por el mismo componente de la tarjeta, fuera de la pantalla.
    const host = document.createElement('div');
    render(h(GiftCardArt, { occasion: g.occasion, estilo: g.style, src: g.ownImage }), host);
    const art = await artImage(host);
    render(null, host);
    await Promise.all([`800 80px ${TITULOS}`, `400 30px ${TEXTO}`, `700 28px ${TEXTO}`].map((f) => document.fonts.load(f).catch(() => undefined)));

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.fillStyle = NARANJA;
    ctx.fillRect(0, 0, W, H);
    for (const [x, y, w, hh, color, giro] of CONFETI) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((giro * Math.PI) / 180);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -hh / 2, w, hh, w === hh ? w / 2 : hh / 2);
      ctx.fill();
      ctx.restore();
    }

    // A la izquierda, la tarjeta.
    if (art !== null) {
      const maxW = 560;
      const maxH = 470;
      const k = Math.min(maxW / art.naturalWidth, maxH / art.naturalHeight);
      const aw = art.naturalWidth * k;
      const ah = art.naturalHeight * k;
      const ax = 70 + (maxW - aw) / 2;
      const ay = (H - ah) / 2;
      ctx.save();
      ctx.fillStyle = TINTA;
      ctx.beginPath();
      ctx.roundRect(ax + 10, ay + 10, aw, ah, 28);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(ax, ay, aw, ah, 28);
      ctx.clip();
      // Fondo blanco detrás: la ilustración puede venir sin fondo y el JPEG no tiene transparencia
      // (sin esto se ve el naranja de atrás, Rodolfo 21/10).
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ax, ay, aw, ah);
      ctx.drawImage(art, ax, ay, aw, ah);
      ctx.restore();
      ctx.lineWidth = 5;
      ctx.strokeStyle = TINTA;
      ctx.beginPath();
      ctx.roundRect(ax, ay, aw, ah, 28);
      ctx.stroke();
    }

    // A la derecha: la ocasión, «Para», el nombre y el dominio.
    const x = 690;
    const width = W - x - 60;
    const t = (key: Parameters<typeof translate>[1]) => translate(g.lang, key);
    const ocasion = occasionLabel(g.occasion, g.lang, g.occasionFree);
    ctx.font = `700 28px ${TEXTO}`;
    const pw = Math.min(ctx.measureText(ocasion).width + 48, width);
    ctx.fillStyle = TINTA;
    ctx.beginPath();
    ctx.roundRect(x, 150, pw, 56, 28);
    ctx.fill();
    ctx.fillStyle = AMARILLO;
    ctx.fillText(ocasion, x + 24, 188, pw - 48);
    ctx.fillStyle = TINTA;
    ctx.font = `400 34px ${TEXTO}`;
    ctx.fillText(t('tarjeta.para'), x, 270);
    let size = 88;
    ctx.font = `800 ${size}px ${TITULOS}`;
    while (size > 40 && ctx.measureText(g.to).width > width) ctx.font = `800 ${--size}px ${TITULOS}`;
    ctx.fillText(g.to, x, 270 + size * 1.05, width);
    ctx.font = `400 30px ${TEXTO}`;
    ctx.fillText(t('tarjeta.adentro'), x, 270 + size * 1.05 + 60, width);
    ctx.font = `700 28px ${TEXTO}`;
    ctx.fillText('regalalebitcoin.com', x, 560);

    for (const q of [0.85, 0.7, 0.55]) {
      const b64 = canvas.toDataURL('image/jpeg', q).split(',')[1] ?? '';
      if (b64.length < 520_000) return b64;
    }
    return null;
  } catch {
    return null;
  }
}
