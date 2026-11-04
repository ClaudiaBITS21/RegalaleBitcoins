import type { Lang } from '@regalale/core';
import { h, render } from 'preact';
import { type CardStyle, GiftCardArt } from '../content/GiftCardArt.tsx';
import { dataUrl, svgCompacto } from '../content/logo.ts';
import { translate } from '../i18n/index.ts';
import { artImage } from './tarjetaPdf.ts';

// Imagen para compartir el link de un regalo (Rodolfo, 21/10): la que muestran WhatsApp y las
// redes en la vista previa del link (1200 × 630). Se arma acá al crear el regalo y viaja con él.
// Desde el 04/11 (Claudia): fondo oscuro, la tarjeta entera a la izquierda y, a la derecha,
// «Un regalo te espera» con el logotipo compacto, y confeti suelto. Si algo falla, el regalo se crea
// igual y el link usa la imagen general del sitio.

const W = 1200;
const H = 630;
const TINTA = '#1a1530';
const AMARILLO = '#ffd23f';
const ROSA = '#ff5d8f';
const CELESTE = '#4cc9f0';
const TITULOS = '"Bricolage Grotesque", system-ui, sans-serif';
const TEXTO = '"DM Sans", system-ui, sans-serif';

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

    // Confeti suelto y repartido (Claudia, 04/11): alrededor del texto y del logotipo sin taparlos,
    // alrededor de la tarjeta y algunos papelitos que pisan apenas su borde.
    const arriba = (H - alto) / 2 - 24;
    const abajo = (H + alto) / 2 + 24;
    const ay = (H - ah) / 2;
    const der = left + width;
    const piezas: ReadonlyArray<readonly [number, number, number, number, string, number]> = [
      // Columna derecha: arriba del texto, a un costado y abajo del logotipo.
      [left + width * 0.08, arriba * 0.4, 20, 20, AMARILLO, 0],
      [left + width * 0.62, arriba * 0.7, 34, 14, ROSA, 28],
      [der + m * 0.9, H * 0.5, 16, 16, CELESTE, 0],
      [left + width * 0.2, abajo + (H - abajo) * 0.55, 14, 14, '#ffffff', 0],
      [der + m * 0.2, abajo + (H - abajo) * 0.4, 32, 12, AMARILLO, 22],
      // Alrededor de la tarjeta: arriba, a la izquierda y abajo.
      ...(art === null
        ? []
        : ([
            [m + aw * 0.12, ay * 0.45, 16, 16, CELESTE, 0],
            [m + aw * 0.68, ay * 0.55, 32, 12, AMARILLO, -18],
            [m * 0.45, ay + ah * 0.38, 14, 14, ROSA, 0],
            [m + aw * 0.3, ay + ah + (H - ay - ah) * 0.5, 30, 12, ROSA, 30],
            [m + aw * 0.86, ay + ah + (H - ay - ah) * 0.42, 18, 18, '#ffffff', 0],
            // Sobre el borde de la tarjeta.
            [m + aw, ay + ah * 0.22, 22, 22, AMARILLO, 0],
            [m + aw * 0.42, ay, 14, 14, '#ffffff', 0],
            [m, ay + ah * 0.82, 30, 12, CELESTE, 34],
            [m + aw * 0.58, ay + ah, 34, 13, ROSA, -24],
          ] as const)),
    ];
    for (const [px, py, w, hh, color, giro] of piezas) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate((giro * Math.PI) / 180);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -hh / 2, w, hh, w === hh ? w / 2 : hh / 2);
      ctx.fill();
      ctx.restore();
    }

    for (const q of [0.85, 0.7, 0.55]) {
      const b64 = canvas.toDataURL('image/jpeg', q).split(',')[1] ?? '';
      if (b64.length < 520_000) return b64;
    }
    return null;
  } catch {
    return null;
  }
}
