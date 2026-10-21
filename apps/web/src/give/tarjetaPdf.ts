import encodeQR from 'qr';
import { B_PATH } from '../content/marca-trazos.ts';

// Tarjeta imprimible en PDF (Rodolfo, 21/10): en el celular, «Imprimir» sacaba la hoja desarmada
// (página en blanco y tres hojas), así que se arma un PDF A4 de una página, igual en cualquier
// dispositivo. Todo pasa en el navegador: la hoja se dibuja en un canvas con las tipografías de
// la página (el QR, en módulos nítidos) y el PDF se escribe a mano con esa imagen en JPEG. Sin
// dependencias nuevas y sin que el link salga del teléfono.
//
// Distribución (la de la hoja impresa): A4 de un solo lado, doblada en cuatro, queda en A6.
// Arriba, giradas 180°, la tapa y la contratapa; abajo, el mensaje y cómo abrirlo.

export interface CardTexts {
  readonly ocasion: string;
  readonly para: string;
  readonly nombre: string;
  readonly adentro: string;
  readonly remate: string;
  readonly hecho: string;
  readonly mensaje: string;
  readonly de: string;
  readonly abrir: string;
  readonly todo: string;
  readonly pasos: readonly string[];
  readonly palabras: string;
  readonly aviso: string;
}

const W = 1654; // A4 a 200 ppp
const H = 2339;
const MM = W / 210;
const PT = 200 / 72;

const TINTA = '#1a1530';
const SUAVE = '#4b4660';
const NARANJA = '#ff8a1f';
const AMARILLO = '#ffd23f';
const ROSA = '#ff5d8f';
const TITULOS = '"Bricolage Grotesque", system-ui, sans-serif';
const TEXTO = '"DM Sans", system-ui, sans-serif';

type Ctx = CanvasRenderingContext2D;

const font = (ctx: Ctx, weight: number, pt: number, family: string) => {
  ctx.font = `${weight} ${pt * PT}px ${family}`;
};

/** Parte el texto en renglones que entran en el ancho (respeta los saltos de línea). */
function wrap(ctx: Ctx, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter((w) => w !== '')) {
      const next = line === '' ? word : `${line} ${word}`;
      if (ctx.measureText(next).width <= width || line === '') line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** La moneda ₿ de la marca, de diámetro d, centrada en (cx, cy). */
function coin(ctx: Ctx, cx: number, cy: number, d: number) {
  const s = d / 72;
  ctx.save();
  ctx.translate(cx - d / 2, cy - d / 2);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.arc(36, 36, 32, 0, Math.PI * 2);
  ctx.fillStyle = NARANJA;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = TINTA;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(36, 36, 23, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(B_PATH));
  ctx.restore();
}

/** Texto centrado en renglones; devuelve la altura usada. */
function centered(ctx: Ctx, lines: readonly string[], cx: number, top: number, lh: number): number {
  ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, cx, top + lh * (i + 0.8)));
  ctx.textAlign = 'left';
  return lines.length * lh;
}

/** La ilustración de la tapa como imagen: un <svg> de la página o la <img> de la imagen propia. */
export async function artImage(el: Element | null): Promise<HTMLImageElement | null> {
  if (el === null) return null;
  const img = new Image();
  const own = el.querySelector('img');
  if (own !== null) img.src = own.currentSrc || own.src;
  else {
    const svg = el.querySelector('svg');
    if (svg === null) return null;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const [, , vw, vh] = (clone.getAttribute('viewBox') ?? '0 0 320 250').split(/\s+/).map(Number);
    clone.setAttribute('width', String((vw ?? 320) * 4));
    clone.setAttribute('height', String((vh ?? 250) * 4));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  }
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

function tapa(ctx: Ctx, t: CardTexts, art: HTMLImageElement | null, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = NARANJA;
  ctx.fillRect(x, y, w, h);
  const cx = x + w / 2;
  const top = y + 11 * MM;
  const bottom = y + h - 11 * MM;
  // Ocasión en una píldora.
  font(ctx, 700, 11, TEXTO);
  const pw = Math.min(ctx.measureText(t.ocasion).width + 8 * MM, w - 20 * MM);
  const ph = 11 * PT * 1.3 + 4 * MM;
  roundRect(ctx, cx - pw / 2, top, pw, ph, ph / 2);
  ctx.fillStyle = TINTA;
  ctx.fill();
  ctx.fillStyle = AMARILLO;
  ctx.textAlign = 'center';
  ctx.fillText(t.ocasion, cx, top + ph / 2 + 11 * PT * 0.35, pw - 6 * MM);
  ctx.textAlign = 'left';
  // Abajo: «Para», el nombre y «adentro hay un regalo».
  font(ctx, 800, 30, TITULOS);
  let size = 30;
  while (size > 14 && ctx.measureText(t.nombre).width > w - 20 * MM) font(ctx, 800, --size, TITULOS);
  const block = 12 * PT * 1.4 + 1 * MM + size * PT * 1.05 + 3 * MM + 11 * PT * 1.4;
  let yy = bottom - block;
  ctx.fillStyle = TINTA;
  font(ctx, 400, 12, TEXTO);
  yy += centered(ctx, [t.para], cx, yy, 12 * PT * 1.4) + 1 * MM;
  font(ctx, 800, size, TITULOS);
  yy += centered(ctx, [t.nombre], cx, yy, size * PT * 1.05) + 3 * MM;
  font(ctx, 500, 11, TEXTO);
  centered(ctx, [t.adentro], cx, yy, 11 * PT * 1.4);
  // La ilustración, centrada en el espacio del medio.
  if (art !== null) {
    const area = { top: top + ph + 6 * MM, bottom: bottom - block - 6 * MM };
    const maxW = 75 * MM;
    const maxH = Math.min(62 * MM, area.bottom - area.top);
    const k = Math.min(maxW / art.naturalWidth, maxH / art.naturalHeight);
    const aw = art.naturalWidth * k;
    const ah = art.naturalHeight * k;
    const ay = area.top + (area.bottom - area.top - ah) / 2;
    ctx.save();
    roundRect(ctx, cx - aw / 2, ay, aw, ah, 4 * MM);
    ctx.clip();
    ctx.drawImage(art, cx - aw / 2, ay, aw, ah);
    ctx.restore();
  }
}

function contratapa(ctx: Ctx, t: CardTexts, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);
  const cx = x + w / 2;
  const d = 25.4 * MM;
  coin(ctx, cx, y + 16 * MM + d / 2, d);
  // Al pie, «Hecho con ₿ regalalebitcoin.com».
  const foot = y + h - 11 * MM;
  font(ctx, 400, 9, TEXTO);
  const a = `${t.hecho} `;
  const aw = ctx.measureText(a).width;
  font(ctx, 700, 9, TEXTO);
  const b = 'regalalebitcoin.com';
  const bw = ctx.measureText(b).width;
  const cd = 4.8 * MM;
  const total = cd + 2 * MM + aw + bw;
  let fx = cx - total / 2;
  coin(ctx, fx + cd / 2, foot - 9 * PT * 0.35, cd);
  fx += cd + 2 * MM;
  ctx.fillStyle = SUAVE;
  font(ctx, 400, 9, TEXTO);
  ctx.fillText(a, fx, foot);
  font(ctx, 700, 9, TEXTO);
  ctx.fillText(b, fx + aw, foot);
  // El remate, en el medio.
  if (t.remate !== '') {
    font(ctx, 800, 22, TITULOS);
    ctx.fillStyle = TINTA;
    const lines = wrap(ctx, t.remate, w - 20 * MM);
    const lh = 22 * PT * 1.1;
    const top = y + 16 * MM + d;
    const mid = top + (foot - 9 * PT - top) / 2;
    centered(ctx, lines, cx, mid - (lines.length * lh) / 2, lh);
  }
}

function mensaje(ctx: Ctx, t: CardTexts, x: number, y: number, w: number, h: number) {
  const left = x + 10 * MM;
  const width = w - 20 * MM;
  font(ctx, 400, 12, TEXTO);
  const lines = t.mensaje === '' ? [] : wrap(ctx, t.mensaje, width);
  const lh = 12 * PT * 1.55;
  const quote = t.mensaje === '' ? 0 : 44 * PT * 0.6 + 5 * MM;
  const sign = t.de === '' ? 0 : 5 * MM + 16 * PT * 1.2;
  let yy = y + (h - (quote + lines.length * lh + sign)) / 2;
  if (t.mensaje !== '') {
    font(ctx, 800, 44, TITULOS);
    ctx.fillStyle = ROSA;
    ctx.fillText('“', left, yy + 44 * PT * 0.75);
    yy += quote;
    font(ctx, 400, 12, TEXTO);
    ctx.fillStyle = TINTA;
    lines.forEach((l, i) => ctx.fillText(l, left, yy + lh * (i + 0.75)));
    yy += lines.length * lh;
  }
  if (t.de !== '') {
    font(ctx, 800, 16, TITULOS);
    ctx.fillStyle = TINTA;
    ctx.fillText(t.de, left, yy + 5 * MM + 16 * PT, width);
  }
}

function abrir(ctx: Ctx, t: CardTexts, link: string, x: number, y: number, w: number, h: number) {
  const left = x + 10 * MM;
  const width = w - 20 * MM;
  let yy = y + 11 * MM;
  // QR del link, con su marco.
  const box = 30 * MM;
  roundRect(ctx, left, yy, box, box, 3 * MM);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 0.8 * MM;
  ctx.strokeStyle = TINTA;
  ctx.stroke();
  const grid = encodeQR(link, 'raw', { ecc: 'medium', border: 2 });
  const inner = box - 3 * MM;
  const cell = inner / grid.length;
  ctx.fillStyle = '#000000';
  grid.forEach((row, gy) =>
    row.forEach((on, gx) => {
      if (on) ctx.fillRect(left + 1.5 * MM + gx * cell, yy + 1.5 * MM + gy * cell, cell + 0.5, cell + 0.5);
    }),
  );
  // Al lado del QR, el título y la bajada.
  const tx = left + box + 4 * MM;
  const tw = width - box - 4 * MM;
  font(ctx, 800, 18, TITULOS);
  ctx.fillStyle = TINTA;
  const title = wrap(ctx, t.abrir, tw);
  let ty = yy;
  title.forEach((l) => {
    ty += 18 * PT * 1.05;
    ctx.fillText(l, tx, ty);
  });
  font(ctx, 400, 10, TEXTO);
  wrap(ctx, t.todo, tw).forEach((l) => {
    ty += 10 * PT * 1.35;
    ctx.fillText(l, tx, ty + 1.5 * MM);
  });
  yy += Math.max(box, ty - yy) + 5 * MM;
  // Los pasos.
  font(ctx, 400, 10.5, TEXTO);
  const lh = 10.5 * PT * 1.35;
  t.pasos.forEach((p, i) => {
    ctx.fillText(`${i + 1}.`, left, yy + lh * 0.8);
    wrap(ctx, p, width - 5 * MM).forEach((l, j) => ctx.fillText(l, left + 5 * MM, yy + lh * (j + 0.8)));
    yy += wrap(ctx, p, width - 5 * MM).length * lh + 2 * MM;
  });
  // Abajo, el recuadro para escribir las 4 palabras a mano.
  font(ctx, 400, 8.5, TEXTO);
  const aviso = wrap(ctx, t.aviso, width - 8 * MM);
  const alh = 8.5 * PT * 1.35;
  const boxH = 4 * MM + 10.5 * PT * 1.3 + 3 * MM + 2 * (5 * MM + 10.5 * PT * 1.3 + 2 * MM) + 3 * MM + aviso.length * alh + 4 * MM;
  const by = y + h - 11 * MM - boxH;
  ctx.save();
  ctx.setLineDash([2 * MM, 1.4 * MM]);
  ctx.lineWidth = 0.6 * MM;
  roundRect(ctx, left, by, width, boxH, 4 * MM);
  ctx.stroke();
  ctx.restore();
  let wy = by + 4 * MM + 10.5 * PT;
  font(ctx, 700, 10.5, TEXTO);
  ctx.fillStyle = TINTA;
  ctx.fillText(t.palabras, left + 4 * MM, wy);
  wy += 3 * MM;
  const colW = (width - 8 * MM - 6 * MM) / 2;
  for (let r = 0; r < 2; r++) {
    wy += 5 * MM + 10.5 * PT;
    for (let c = 0; c < 2; c++) {
      const lx = left + 4 * MM + c * (colW + 6 * MM);
      ctx.fillText(String(r * 2 + c + 1), lx, wy);
      ctx.fillRect(lx, wy + 1.5 * MM, colW, 0.4 * MM);
    }
    wy += 2 * MM;
  }
  wy += 3 * MM;
  font(ctx, 400, 8.5, TEXTO);
  ctx.fillStyle = SUAVE;
  aviso.forEach((l, i) => ctx.fillText(l, left + 4 * MM, wy + alh * (i + 0.8)));
}

/** Dibuja la hoja A4 completa. Con «marca», la vista previa de lo gratis (no se baja). */
export async function drawCard(texts: CardTexts, link: string, art: HTMLImageElement | null, marca?: string): Promise<HTMLCanvasElement> {
  await Promise.all(
    [`800 40px ${TITULOS}`, `400 16px ${TEXTO}`, `500 16px ${TEXTO}`, `700 16px ${TEXTO}`].map((f) => document.fonts.load(f).catch(() => undefined)),
  );
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const pw = W / 2;
  const ph = H / 2;
  // Arriba, girada 180°: al doblar por la mitad horizontal hacia atrás queda derecha.
  for (const [i, draw] of [
    [0, (c: Ctx) => tapa(c, texts, art, 0, 0, pw, ph)],
    [1, (c: Ctx) => contratapa(c, texts, 0, 0, pw, ph)],
  ] as const) {
    ctx.save();
    ctx.translate(i * pw + pw, ph);
    ctx.rotate(Math.PI);
    draw(ctx);
    ctx.restore();
  }
  mensaje(ctx, texts, 0, ph, pw, ph);
  abrir(ctx, texts, link, pw, ph, pw, ph);
  if (marca !== undefined) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = 'rgba(26, 21, 48, 0.22)';
    ctx.textAlign = 'center';
    font(ctx, 800, 72, TITULOS);
    for (const dy of [-H / 3, 0, H / 3]) ctx.fillText(marca.toUpperCase(), 0, dy);
    ctx.restore();
  }
  return canvas;
}

/** Vista preliminar liviana (a la mitad del tamaño), como data: para la etiqueta <img>. */
export function previewUrl(canvas: HTMLCanvasElement): string {
  const small = document.createElement('canvas');
  small.width = W / 2;
  small.height = Math.round(H / 2);
  small.getContext('2d')?.drawImage(canvas, 0, 0, small.width, small.height);
  return small.toDataURL('image/jpeg', 0.85);
}

export function canvasJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, mal) => canvas.toBlob((b) => (b === null ? mal(new Error('jpeg')) : ok(b)), 'image/jpeg', 0.92));
}

/** PDF de una página A4 con la imagen JPEG a sangre (escrito a mano: catálogo, página, imagen). */
export async function jpegToPdf(jpeg: Blob, width = W, height = H): Promise<Blob> {
  const img = new Uint8Array(await jpeg.arrayBuffer());
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (p: Uint8Array | string) => {
    const b = typeof p === 'string' ? enc.encode(p) : p;
    parts.push(b);
    size += b.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = size;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  offsets[4] = size;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`);
  push(img);
  push('\nendstream\nendobj\n');
  const content = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = size;
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offsets[n]).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}
