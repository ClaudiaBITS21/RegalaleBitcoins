// Imagen del cupón para la vista previa de su link corto (/c/K7M2P, Claudia 25/10): la que
// muestran WhatsApp y las redes (1200 × 630), con la estética del sitio. La arma el navegador del
// admin al copiar o compartir el cupón y se sube una vez; si algo falla, el link usa la imagen
// general del sitio. Sin vos ni tú: vale para los dos tratos.

import { dataUrl, svgCompacto } from './content/logo.ts';

const W = 1200;
const H = 630;
const TINTA = '#1a1530';
const NARANJA = '#ff8a1f';
const AMARILLO = '#ffd23f';
const CREMA = '#fff1e3';
const TITULOS = '"Bricolage Grotesque", system-ui, sans-serif';
const TEXTO = '"DM Sans", system-ui, sans-serif';

/** Confeti en los bordes: [x, y, ancho, alto, color, giro]. */
const CONFETI: readonly (readonly [number, number, number, number, string, number])[] = [
  [40, 34, 20, 20, AMARILLO, 0],
  [560, 24, 34, 14, '#ff5d8f', 28],
  [1150, 46, 18, 18, '#4cc9f0', 0],
  [1110, 590, 30, 12, '#4cc9f0', -35],
  [34, 596, 16, 16, '#ffffff', 0],
  [600, 604, 22, 22, '#ffffff', 0],
];

export interface CouponImageInput {
  readonly codigo: string;
  /** Qué da, ya dicho: «21 % de descuento en los packs». */
  readonly que: string;
  /** «Válido hasta el 31/12/2026», o null si no vence. */
  readonly hasta: string | null;
}

/** Corta un texto en renglones que entren en `width` con la fuente actual (como mucho `max`). */
function lines(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.replace(/ %/g, '\u00a0%').split(/ +/)) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && ctx.measureText(next).width > width) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line !== '') out.push(line);
  if (out.length <= max) return out;
  const kept = out.slice(0, max);
  kept[max - 1] = `${kept[max - 1]}…`;
  return kept;
}

/** La imagen en JPEG, en base64; null si no se pudo armar. */
export async function couponImage(c: CouponImageInput): Promise<string | null> {
  try {
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

    // El ticket: crema con sombra tinta, dos muescas a los costados y una línea punteada.
    const tx = 90;
    const ty = 80;
    const tw = W - 180;
    const th = H - 160;
    const cut = 820;
    ctx.fillStyle = TINTA;
    ctx.beginPath();
    ctx.roundRect(tx + 12, ty + 12, tw, th, 32);
    ctx.fill();
    ctx.fillStyle = CREMA;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 32);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = TINTA;
    ctx.stroke();
    ctx.fillStyle = NARANJA;
    for (const y of [ty, ty + th]) {
      ctx.beginPath();
      ctx.arc(tx + cut, y, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.save();
    ctx.setLineDash([14, 12]);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(tx + cut, ty + 40);
    ctx.lineTo(tx + cut, ty + th - 40);
    ctx.stroke();
    ctx.restore();

    // A la izquierda: «CUPÓN», qué da y hasta cuándo.
    const x = tx + 56;
    const width = cut - 100;
    ctx.fillStyle = TINTA;
    ctx.beginPath();
    ctx.roundRect(x, ty + 50, 190, 54, 27);
    ctx.fill();
    ctx.fillStyle = AMARILLO;
    ctx.font = `700 28px ${TEXTO}`;
    ctx.fillText('CUPÓN', x + 44, ty + 87);
    ctx.fillStyle = TINTA;
    let size = 64;
    ctx.font = `800 ${size}px ${TITULOS}`;
    // Lo que da, lo más grande que entre (hasta 3 renglones) sin pisar la fecha de abajo.
    const bottom = ty + th - 190;
    const last = (n: number) => ty + 120 + size + (n - 1) * size * 1.1;
    let que = lines(ctx, c.que, width, 4);
    while (size > 36 && (que.length > 3 || last(que.length) > bottom)) {
      ctx.font = `800 ${--size}px ${TITULOS}`;
      que = lines(ctx, c.que, width, 4);
    }
    que = lines(ctx, c.que, width, 3);
    let y = ty + 120 + size;
    for (const l of que) {
      ctx.fillText(l, x, y, width);
      y += size * 1.1;
    }
    ctx.font = `400 30px ${TEXTO}`;
    if (c.hasta !== null) ctx.fillText(c.hasta, x, ty + th - 140, width);
    // Abajo, el logotipo en dos líneas y la dirección del sitio.
    const logo = new Image();
    logo.src = dataUrl(svgCompacto('claro'));
    await logo.decode();
    const lh = 76;
    const lw = (logo.naturalWidth / logo.naturalHeight) * lh;
    ctx.drawImage(logo, x, ty + th - 40 - lh, lw, lh);
    ctx.font = `700 26px ${TEXTO}`;
    ctx.textAlign = 'right';
    ctx.fillText('regalalebitcoin.com', tx + cut - 44, ty + th - 48);
    ctx.textAlign = 'left';

    // A la derecha, de costado, el código.
    ctx.save();
    ctx.translate(tx + cut + (tw - cut) / 2, ty + th / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    let cs = 72;
    ctx.font = `800 ${cs}px ${TITULOS}`;
    while (cs > 30 && ctx.measureText(c.codigo).width > th - 80) ctx.font = `800 ${--cs}px ${TITULOS}`;
    ctx.fillText(c.codigo, 0, cs / 3);
    ctx.restore();

    for (const q of [0.85, 0.7, 0.55]) {
      const b64 = canvas.toDataURL('image/jpeg', q).split(',')[1] ?? '';
      if (b64.length < 520_000) return b64;
    }
    return null;
  } catch {
    return null;
  }
}
