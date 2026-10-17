import { decodeGiftFragment } from '@regalale/core';

/**
 * Del texto pegado saca la ruta del regalo (/r/<id>#<semilla>) para abrirla en este
 * mismo sitio, sea cual sea el dominio que traía. null si no hay un link de regalo válido.
 */
export function parseGiftLink(input: string): string | null {
  const text = input.trim();
  const at = text.search(/\/r\/[A-Za-z0-9_-]{22}#/);
  if (at < 0) return null;
  const m = /^\/r\/([A-Za-z0-9_-]{22})#([A-Za-z0-9_-]+)/.exec(text.slice(at));
  if (m === null) return null;
  try {
    decodeGiftFragment(`#${m[2]}`);
  } catch {
    return null;
  }
  return `/r/${m[1]}#${m[2]}`;
}
