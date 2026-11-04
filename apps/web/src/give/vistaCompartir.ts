import type { Lang } from '@regalale/core';
import { h, render } from 'preact';
import { type CardStyle, GiftCardArt } from '../content/GiftCardArt.tsx';
import { translate } from '../i18n/index.ts';
import { dataUrl, svgCompacto } from '../content/logo.ts';
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
  // Fuera de la tarjeta, en la columna de la derecha y en las esquinas.
  [800, 40, 20, 20, AMARILLO, 0],
  [1010, 60, 34, 14, '#ff5d8f', 28],
  [1150, 40, 18, 18, '#4cc9f0', 0],
  [1150, 585, 30, 12, '#4cc9f0', -35],
  [810, 590, 16, 16, '#ffffff', 0],
  [1000, 575, 22, 22, AMARILLO, 0],
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

/** Corta la frase en renglones que entren en `width` con la tipografía de títulos en `size`. */
function partir(ctx: CanvasRenderingContext2D, text: string, width: number, size: number): string[] {
  ctx.font = `800 ${size}px ${TITULOS}`;
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/ +/)) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && ctx.measureText(next).width > width) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line !== '') out.push(line);
  return out;
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
    // Fondo oscuro (Claudia, 04/11): la tarjeta, sea foto o ilustración naranja, se recorta clara.
    ctx.fillStyle = TINTA;
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

    // A la izquierda, la tarjeta entera, lo más grande que entre (Claudia, 04/11), con el mismo aire
    // a la izquierda que arriba y abajo. A la derecha queda una columna para el texto, con el doble
    // de ese aire a cada lado.
    const COLUMNA = 300;
    let m = 64;
    let aw = 0;
    let ah = 0;
    if (art !== null) {
      const r = art.naturalWidth / art.naturalHeight;
      // Alto completo con 64 de aire; si no entra a lo ancho, el aire que hace que entre justo:
      // r·(H − 2m) = W − 5m − COLUMNA.
      if (m + r * (H - 2 * m) + 4 * m + COLUMNA > W) m = r < 2.5 ? Math.max(56, (W - COLUMNA - r * H) / (5 - 2 * r)) : 56;
      ah = Math.min(H - 2 * m, (W - 5 * m - COLUMNA) / r);
      aw = r * ah;
    }
    if (art !== null) {
      const ax = m;
      const ay = (H - ah) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(ax, ay, aw, ah, 22);
      ctx.clip();
      // Fondo blanco detrás: la ilustración puede venir sin fondo y el JPEG no tiene transparencia
      // (sin esto se ve el naranja de atrás, Rodolfo 21/10).
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ax, ay, aw, ah);
      ctx.drawImage(art, ax, ay, aw, ah);
      ctx.restore();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(ax, ay, aw, ah, 22);
      ctx.stroke();
    }

    // A la derecha, centrado: «Un regalo te espera» y, abajo, el logotipo compacto para fondo
    // oscuro, grande (Claudia, 04/11).
    const left = art === null ? 2 * m : m + aw + 2 * m;
    const width = W - 2 * m - left;
    const cx = left + width / 2;
    const frase = translate(g.lang, 'vista.espera');
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    let size = 60;
    let lineas = partir(ctx, frase, width, size);
    while (size > 34 && (lineas.length > 3 || lineas.some((l) => ctx.measureText(l).width > width))) {
      size -= 2;
      lineas = partir(ctx, frase, width, size);
    }
    const logo = new Image();
    logo.src = dataUrl(svgCompacto('oscuro'));
    await logo.decode();
    const lw = Math.min(width, 320);
    const lh = (logo.naturalHeight / logo.naturalWidth) * lw;
    // Texto y logo como un bloque, centrados en la altura.
    const alto = lineas.length * size * 1.12 + 56 + lh;
    let y = (H - alto) / 2 + size;
    for (const l of lineas) {
      ctx.fillText(l, cx, y, width);
      y += size * 1.12;
    }
    ctx.textAlign = 'left';
    ctx.drawImage(logo, cx - lw / 2, y - size * 1.12 + 56 + size * 0.25, lw, lh);

    for (const q of [0.85, 0.7, 0.55]) {
      const b64 = canvas.toDataURL('image/jpeg', q).split(',')[1] ?? '';
      if (b64.length < 520_000) return b64;
    }
    return null;
  } catch {
    return null;
  }
}
