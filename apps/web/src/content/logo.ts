import { B_PATH, WM } from './marca-trazos.ts';

// El logotipo armado como SVG (manual de identidad v1, 19/10/2026): lo usan el mediakit (muestras
// y descargas) y el cupón del link corto (/c/…, la página y su imagen para compartir).

export type Caja = 'claro' | 'naranja' | 'negro' | 'rosa';

const CAJA: Readonly<Record<Caja, { caja: string; borde: string; sombra: string; b: string }>> = {
  claro: { caja: '#FF8A1F', borde: '#1A1530', sombra: '#1A1530', b: '#1A1530' },
  naranja: { caja: '#FFFFFF', borde: '#1A1530', sombra: '#1A1530', b: '#FF8A1F' },
  negro: { caja: '#FF8A1F', borde: '#000000', sombra: '#B3470A', b: '#FFFFFF' },
  rosa: { caja: '#FF5D8F', borde: '#1A1530', sombra: '#1A1530', b: '#4CC9F0' },
};

export const NS = 'xmlns="http://www.w3.org/2000/svg"';

export function caja(f: Caja, giro = -10): string {
  const c = CAJA[f];
  return (
    `<g transform="rotate(${giro} 112 128)">` +
    `<path d="M108 78c-14-30-46-34-46-14 0 12 24 17 46 14zM108 78c14-30 46-34 46-14 0 12-24 17-46 14z" fill="${c.caja}" stroke="${c.borde}" stroke-width="5" stroke-linejoin="round"/>` +
    `<rect x="64" y="86" width="104" height="96" rx="16" fill="${c.sombra}"/>` +
    `<rect x="56" y="78" width="104" height="96" rx="16" fill="${c.caja}" stroke="${c.borde}" stroke-width="5"/>` +
    `<g transform="translate(108 126) scale(1.75) translate(-33 -36)"><path d="${B_PATH}" fill="none" stroke="${c.b}" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/></g></g>`
  );
}

/** Versiones del logotipo: color de REGALALE, color de BITCOIN y caja. */
export type Version = 'claro' | 'naranja' | 'oscuro';
export const LOGO: Readonly<Record<Version, readonly [string, string, Caja]>> = {
  claro: ['#1A1530', '#FF8A1F', 'claro'],
  naranja: ['#1A1530', '#FFFFFF', 'naranja'],
  oscuro: ['#FFFFFF', '#FF8A1F', 'negro'],
};

// Versión compacta: el texto va del borde de arriba de la caja al de abajo de la sombra.
const COMPACTO = (() => {
  const arriba = 70.4;
  const abajo = 171.5;
  const salto = Math.round(WM.cap * 1.35 * 10) / 10;
  const k = (WM.cap + salto) / (abajo - arriba);
  const b1 = Math.round(((arriba - 34) * k + WM.cap) * 10) / 10;
  return { ch: Math.round(160 * k * 10) / 10, cw: Math.round(148 * k * 10) / 10, gap: 30, b1, b2: Math.round((b1 + salto) * 10) / 10, top: Math.round((arriba - 34) * k * 10) / 10 };
})();

export function svgCompacto(v: Version, guias = false): string {
  const [a, b, f] = LOGO[v];
  const g = COMPACTO;
  const tx = g.cw + g.gap;
  const w = Math.round((tx + Math.max(WM.wa, WM.wb)) * 10) / 10;
  const lineas = guias ? `<path d="M0 ${g.top}H${w}M0 ${g.b2}H${w}" stroke="#4CC9F0" stroke-width="2" stroke-dasharray="8 6" fill="none"/>` : '';
  return (
    `<svg ${NS} viewBox="0 0 ${w} ${g.ch}" width="${w}" height="${g.ch}"><svg x="0" y="0" width="${g.cw}" height="${g.ch}" viewBox="38 34 148 160">${caja(f)}</svg>` +
    `<path transform="translate(${tx} ${g.b1})" d="${WM.b1}" fill="${a}"/><path transform="translate(${tx} ${g.b2})" d="${WM.b2}" fill="${b}"/>${lineas}</svg>`
  );
}

export const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
