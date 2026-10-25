// Logo de quien promueve un cupón (Claudia, 25/10): una empresa o un evento. El admin sube el
// archivo como lo tenga (PNG, JPG, WebP o SVG) y acá se deja listo para ir al lado del de Regalale
// Bitcoin: sin el fondo liso (si tiene), recortado a lo que se ve y de un tamaño razonable. Si es
// claro y se perdería sobre la crema del cupón, va sobre una plaquita tinta. Sale un PNG.

const MAX_W = 640;
const MAX_H = 320;
/** Qué tan parecido al fondo tiene que ser un color para borrarlo (distancia RGB). */
const TOLERANCIA = 48;
const TINTA = '#1a1530';

export interface PreparedLogo {
  /** El PNG en base64, para subirlo. */
  readonly png: string;
  /** El mismo PNG como data:, para mostrarlo. */
  readonly url: string;
  readonly sinFondo: boolean;
  readonly placa: boolean;
}

/** Lee el archivo como data: (la política de seguridad del admin no deja imágenes blob:). */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/** El color de fondo si las cuatro esquinas son opacas y parecidas; null si no hay fondo liso. */
function backgroundColor(d: Uint8ClampedArray, w: number, h: number): [number, number, number] | null {
  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map((p) => [d[p * 4]!, d[p * 4 + 1]!, d[p * 4 + 2]!, d[p * 4 + 3]!] as const);
  if (corners.some((c) => c[3] < 250)) return null;
  const avg = [0, 1, 2].map((i) => corners.reduce((a, c) => a + c[i]!, 0) / 4) as [number, number, number];
  const near = corners.every((c) => Math.hypot(c[0] - avg[0], c[1] - avg[1], c[2] - avg[2]) < TOLERANCIA);
  return near ? avg : null;
}

/**
 * Borra el fondo desde los bordes hacia adentro (como el balde de pintura): lo blanco que está
 * adentro del logo, rodeado por el dibujo, se queda. El borde entre fondo y dibujo se suaviza.
 */
function removeBackground(d: Uint8ClampedArray, w: number, h: number, bg: [number, number, number]): void {
  const dist = (p: number) => Math.hypot(d[p * 4]! - bg[0], d[p * 4 + 1]! - bg[1], d[p * 4 + 2]! - bg[2]);
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (p: number) => {
    if (seen[p] === 0 && dist(p) < TOLERANCIA) {
      seen[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length > 0) {
    const p = stack.pop() as number;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  for (let p = 0; p < w * h; p++) {
    if (seen[p] === 1) {
      // Lo más parecido al fondo, transparente del todo; lo del medio, a medias (bordes suaves).
      const k = Math.min(1, dist(p) / TOLERANCIA);
      d[p * 4 + 3] = Math.round(d[p * 4 + 3]! * (k < 0.5 ? 0 : (k - 0.5) * 2));
    }
  }
}

/** El rectángulo de lo que se ve (alfa > 16), o null si la imagen quedó vacía. */
function visibleBox(d: Uint8ClampedArray, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3]! > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Si lo que se ve es casi todo claro (se perdería sobre la crema del cupón). */
function isLight(d: Uint8ClampedArray): boolean {
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]! / 255;
    if (a < 0.1) continue;
    sum += a * ((0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255);
    weight += a;
  }
  return weight > 0 && sum / weight > 0.82;
}

/** Deja el logo listo. null si el archivo no es una imagen que se pueda leer. */
export async function prepareLogo(file: File, quitarFondo: boolean): Promise<PreparedLogo | null> {
  try {
    const img = await loadImage(await readAsDataUrl(file));
    // Un SVG puede no traer tamaño: se dibuja grande para que no quede borroso.
    const nw = img.naturalWidth || 1200;
    const nh = img.naturalHeight || 600;
    const side = Math.max(nw, nh);
    const k0 = side > 1600 ? 1600 / side : file.type === 'image/svg+xml' && side < 600 ? 600 / side : 1;
    const w = Math.max(1, Math.round(nw * k0));
    const h = Math.max(1, Math.round(nh * k0));
    const work = document.createElement('canvas');
    work.width = w;
    work.height = h;
    const wctx = work.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    wctx.drawImage(img, 0, 0, w, h);
    const data = wctx.getImageData(0, 0, w, h);
    const bg = quitarFondo ? backgroundColor(data.data, w, h) : null;
    if (bg !== null) removeBackground(data.data, w, h, bg);
    wctx.putImageData(data, 0, 0);
    const box = visibleBox(data.data, w, h);
    if (box === null) return null;
    const light = isLight(data.data);

    // Recortado, con un poco de aire, y del tamaño justo.
    const k = Math.min(1, MAX_W / box.w, MAX_H / box.h);
    const lw = Math.round(box.w * k);
    const lh = Math.round(box.h * k);
    const pad = light ? Math.round(Math.max(lw, lh) * 0.12) : 0;
    const out = document.createElement('canvas');
    out.width = lw + pad * 2;
    out.height = lh + pad * 2;
    const ctx = out.getContext('2d') as CanvasRenderingContext2D;
    if (light) {
      ctx.fillStyle = TINTA;
      ctx.beginPath();
      ctx.roundRect(0, 0, out.width, out.height, Math.min(out.width, out.height) * 0.18);
      ctx.fill();
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(work, box.x, box.y, box.w, box.h, pad, pad, lw, lh);
    const url = out.toDataURL('image/png');
    const png = url.split(',')[1] ?? '';
    if (png.length > 400_000) return null;
    return { png, url, sinFondo: bg !== null, placa: light };
  } catch {
    return null;
  }
}
