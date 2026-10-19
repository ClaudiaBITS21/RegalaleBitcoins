// Imagen propia de la tarjeta ("Hacela con tu IA" o "Subí tu imagen"). Se procesa en el
// navegador antes de subirla: se recorta a la proporción de la tarjeta, se achica y se vuelve a
// codificar en un canvas, lo que además descarta los metadatos (ubicación GPS, cámara, fecha).

/** Mismo tope que la API (OWN_IMAGE_MAX_BYTES). */
const MAX_BYTES = 600_000;
const WIDTH = 1024;
const HEIGHT = 800; // 320 × 250 de la tarjeta
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export interface ProcessedImage {
  /** data:image/...;base64,… para mostrarla (la CSP permite data:, no blob:). */
  readonly dataUrl: string;
  /** Solo el base64, para la API. */
  readonly base64: string;
}

export class OwnImageError extends Error {}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new OwnImageError('lectura'));
    reader.readAsDataURL(blob);
  });
}

export async function processOwnImage(file: File): Promise<ProcessedImage> {
  if (!ACCEPTED.includes(file.type) || file.size > 25_000_000) throw new OwnImageError('tipo');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new OwnImageError('tipo');
  }
  // Recorte con la proporción de la tarjeta: si sobra ancho, al centro; si sobra alto, anclado abajo,
  // para no cortar la cinta con el nombre que la IA pone abajo al centro.
  const ratio = WIDTH / HEIGHT;
  let sw = bitmap.width;
  let sh = Math.round(sw / ratio);
  if (sh > bitmap.height) {
    sh = bitmap.height;
    sw = Math.round(sh * ratio);
  }
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new OwnImageError('canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, Math.round((bitmap.width - sw) / 2), bitmap.height - sh, sw, sh, 0, 0, WIDTH, HEIGHT);
  bitmap.close();
  // WebP si el navegador lo sabe codificar; si no, JPEG. Baja la calidad hasta entrar en el tope.
  for (const quality of [0.85, 0.75, 0.6, 0.45]) {
    let blob = await toBlob(canvas, 'image/webp', quality);
    if (blob === null || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
    if (blob !== null && blob.size <= MAX_BYTES) {
      const dataUrl = await toDataUrl(blob);
      return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
    }
  }
  throw new OwnImageError('tamano');
}
