import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import { BitcoinB } from './BitcoinB.tsx';
import { isOccasion, type OccasionKey } from './occasions.ts';

// Imagen de la tarjeta del regalo, estilo "Ilustración" (docs/diseno/DISENO.md §6): plana y
// colorida, con un motivo reconocible por ocasión y siempre una moneda dorada con ₿. Es SVG
// en línea (sin imágenes externas ni "data:"), sin ids ni <style>, compatible con la CSP.
// Hay una sola imagen por estilo (handoff 2026-10-19, «imágenes de la tarjeta»): los regalos
// viejos con `imagen` 2..4 guardado se muestran igual que los nuevos.

const TINTA = '#1A1530';
const AMARILLO = '#FFD23F';
const VERDE = '#2FBF71';
const ROJO = '#E2483D';

/** Colores de la tarjeta: a = principal, b = secundario, c = terciario, d = claro, e = contraste. */
interface Palette {
  readonly a: string;
  readonly b: string;
  readonly c: string;
  readonly d: string;
  readonly e: string;
}

const FONDO = '#FF8A1F';
const PALETA: Palette = { a: '#FF5D8F', b: AMARILLO, c: '#4CC9F0', d: '#FFFFFF', e: TINTA };
/** Moneda: centro y radio. */
const MONEDA = [160, 48, 24] as const;

/** Trazo de la marca: contorno tinta grueso y redondeado. */
const S = { stroke: TINTA, 'stroke-width': 5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' } as const;

/** Estrella de 5 puntas como path. */
function starPath(cx: number, cy: number, R: number, r: number, points = 5): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const ang = (Math.PI / points) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(1)} ${(cy + rad * Math.sin(ang)).toFixed(1)}`);
  }
  return `M${pts.join(' L')}Z`;
}

// Motivos. Coordenadas de un lienzo de 320 × 250: el motivo ocupa x 70–250, y 84–222,
// arriba queda lugar para la moneda.

type Motif = (p: Palette) => ComponentChildren;

const torta: Motif = (p) => (
  <>
    <rect x="80" y="160" width="160" height="58" rx="10" fill={p.a} {...S} />
    <path d="M80 176 q13.3 13 26.7 0 t26.7 0 t26.7 0 t26.7 0 t26.7 0 t26.7 0" fill="none" stroke={p.d} stroke-width="6" stroke-linecap="round" />
    <rect x="102" y="124" width="116" height="40" rx="8" fill={p.b} {...S} />
    <rect x="128" y="98" width="8" height="26" fill={p.c} {...S} stroke-width="3" />
    <rect x="184" y="98" width="8" height="26" fill={p.c} {...S} stroke-width="3" />
    <path d="M132 94 q-7 -9 0 -17 q7 8 0 17z M188 94 q-7 -9 0 -17 q7 8 0 17z" fill="#FFF3B0" {...S} stroke-width="2.5" />
  </>
);

const nube = (x: number, y: number, s: number, fill: string) => (
  <path
    transform={`translate(${x} ${y}) scale(${s})`}
    d="M0 28 a22 22 0 0 1 40 -12 a26 26 0 0 1 48 6 a18 18 0 0 1 10 34 h-90 a16 16 0 0 1 -8 -28z"
    fill={fill}
    {...S}
    stroke-width={4 / s}
  />
);

const paloma: Motif = (p) => (
  <>
    {nube(80, 172, 0.9, '#E6F7FD')}
    {nube(168, 180, 0.75, '#E6F7FD')}
    <path
      d="M116 146 q30 -40 70 -20 q-10 10 -4 22 q30 -6 40 16 q-36 4 -56 22 q-30 10 -50 -10 q-14 -4 -22 -14 q12 -2 22 -16z"
      fill="#FFFFFF"
      {...S}
    />
    <path d="M150 150 q18 -18 40 -10" fill="none" stroke={TINTA} stroke-width="3" stroke-linecap="round" />
    <circle cx="178" cy="138" r="3.5" fill={TINTA} />
    <path d="M186 142 l12 2 l-10 5z" fill={p.a} {...S} stroke-width="3" />
    <path d="M196 150 q10 6 8 18" fill="none" stroke={VERDE} stroke-width="4" stroke-linecap="round" />
    <ellipse cx="206" cy="160" rx="6" ry="3.5" fill={VERDE} transform="rotate(50 206 160)" />
  </>
);

const arbol: Motif = (p) => (
  <>
    <rect x="150" y="196" width="20" height="24" rx="3" fill="#9A6236" {...S} />
    <path d="M160 96 L210 148 H188 L228 200 H92 L132 148 H110 Z" fill={VERDE} {...S} />
    <circle cx="142" cy="176" r="7" fill={p.a} {...S} stroke-width="3" />
    <circle cx="184" cy="184" r="7" fill={p.c} {...S} stroke-width="3" />
    <circle cx="160" cy="134" r="6" fill={p.d} {...S} stroke-width="3" />
    <circle cx="200" cy="168" r="5" fill={p.d} {...S} stroke-width="3" />
    <circle cx="124" cy="190" r="5" fill={p.b} {...S} stroke-width="3" />
    <path d={starPath(160, 92, 15, 6.5)} fill={AMARILLO} {...S} stroke-width="3.5" />
  </>
);

/** Un rey mago que trae un regalo con la ₿. */
const reyMago: Motif = (p) => (
  <g transform="translate(160 88) scale(0.8) translate(-160 -76)">
    <path d="M108 220 L124 150 Q160 136 196 150 L212 220 Z" fill={p.a} {...S} />
    <path d="M160 146 L160 220" stroke={TINTA} stroke-width="4" stroke-linecap="round" />
    <circle cx="160" cy="128" r="22" fill="#F2C9A0" {...S} />
    <path d="M138 132 Q140 168 160 172 Q180 168 182 132 Q170 142 160 140 Q150 142 138 132 Z" fill={p.d} {...S} stroke-width="4" />
    <circle cx="152" cy="124" r="2.8" fill={TINTA} />
    <circle cx="168" cy="124" r="2.8" fill={TINTA} />
    <path d="M136 108 L134 82 L148 96 L160 76 L172 96 L186 82 L184 108 Z" fill={AMARILLO} {...S} stroke-width="4" />
    <circle cx="160" cy="76" r="5" fill={p.c} {...S} stroke-width="3" />
    <rect x="132" y="168" width="56" height="44" rx="5" fill={p.c} {...S} />
    <rect x="155" y="168" width="10" height="44" fill={p.b} {...S} stroke-width="3" />
    <path d="M160 168 q-16 -16 -20 -4 q4 8 20 4 q16 4 20 -4 q-4 -12 -20 4z" fill={p.b} {...S} stroke-width="3" />
    <circle cx="160" cy="194" r="12" fill={AMARILLO} {...S} stroke-width="3.5" />
    <BitcoinB cx={160} cy={194} h={14} color={TINTA} weight={5} />
    <ellipse cx="126" cy="184" rx="9" ry="8" fill="#F2C9A0" {...S} stroke-width="3.5" />
    <ellipse cx="194" cy="184" rx="9" ry="8" fill="#F2C9A0" {...S} stroke-width="3.5" />
  </g>
);

/** Estallido de fuegos artificiales. */
const estallido = (cx: number, cy: number, r: number, color: string) => {
  const rays = [];
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i;
    const x1 = cx + r * 0.35 * Math.cos(ang);
    const y1 = cy + r * 0.35 * Math.sin(ang);
    const x2 = cx + r * Math.cos(ang);
    const y2 = cy + r * Math.sin(ang);
    rays.push(`M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`);
  }
  return <path d={rays.join(' ')} stroke={color} stroke-width="5" stroke-linecap="round" fill="none" />;
};

const copa = (x: number, ang: number, fill: string) => (
  <g transform={`rotate(${ang} ${x} 216)`}>
    <path d={`M${x - 13} 136 H${x + 13} L${x + 9} 182 Q${x} 192 ${x - 9} 182 Z`} fill={fill} {...S} />
    <path d={`M${x - 11} 150 H${x + 11}`} stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" />
    <path d={`M${x} 190 V214 M${x - 13} 216 H${x + 13}`} fill="none" {...S} />
  </g>
);

const fuegos: Motif = (p) => (
  <>
    {estallido(110, 108, 26, p.a)}
    {estallido(212, 102, 22, p.c)}
    {estallido(236, 160, 14, p.d)}
    {copa(146, -14, AMARILLO)}
    {copa(176, 14, AMARILLO)}
    <circle cx="160" cy="124" r="4" fill={p.d} />
    <circle cx="152" cy="112" r="3" fill={p.d} />
    <circle cx="168" cy="104" r="3.5" fill={p.d} />
  </>
);

const anillos: Motif = (p) => (
  <>
    <circle cx="136" cy="174" r="38" fill="none" stroke={TINTA} stroke-width="18" />
    <circle cx="136" cy="174" r="38" fill="none" stroke={AMARILLO} stroke-width="9" />
    <circle cx="186" cy="174" r="38" fill="none" stroke={TINTA} stroke-width="18" />
    <circle cx="186" cy="174" r="38" fill="none" stroke="#FFFFFF" stroke-width="9" />
    {/* El primer anillo vuelve a pasar por delante: quedan entrelazados. */}
    <path d="M168 154 A38 38 0 0 1 172 182" fill="none" stroke={TINTA} stroke-width="18" />
    <path d="M168 154 A38 38 0 0 1 172 182" fill="none" stroke={AMARILLO} stroke-width="9" />
    <path d="M186 118 l12 -12 h-24z M174 106 l12 -12 l12 12z" fill={p.c} {...S} stroke-width="3.5" />
    <path d="M100 110 c-8 -10 -22 0 -12 10 l12 10 l12 -10 c10 -10 -4 -20 -12 -10z" fill={p.a} {...S} stroke-width="3.5" />
  </>
);

const cochecito: Motif = (p) => (
  <>
    <path d="M100 152 L78 118 H64" fill="none" {...S} />
    <path d="M96 150 H226 Q226 198 180 202 H142 Q96 198 96 150 Z" fill={p.a} {...S} />
    <path d="M162 150 V94 A56 56 0 0 1 218 150 Z" fill={p.c} {...S} />
    <path d="M190 104 L190 150 M176 98 L176 150" stroke={p.d} stroke-width="4" opacity=".7" />
    <path d="M106 168 H216" stroke={p.d} stroke-width="5" stroke-linecap="round" />
    <circle cx="132" cy="210" r="12" fill={p.d} {...S} />
    <circle cx="194" cy="210" r="12" fill={p.d} {...S} />
    <circle cx="132" cy="210" r="3" fill={TINTA} />
    <circle cx="194" cy="210" r="3" fill={TINTA} />
  </>
);

const birrete: Motif = (p) => (
  <>
    <path d="M200 196 h40 v22 h-40z" fill={p.d} {...S} transform="rotate(-10 220 207)" />
    <path d="M206 202 h28 M206 210 h20" stroke="#C9C5D9" stroke-width="3" stroke-linecap="round" transform="rotate(-10 220 207)" />
    <path d="M114 150 V190 Q160 214 206 190 V150 L160 166 Z" fill={p.e === TINTA ? '#3A3060' : p.c} {...S} />
    <path d="M160 100 L248 134 L160 168 L72 134 Z" fill={p.e === TINTA ? TINTA : p.c} {...S} />
    <path d="M160 134 L226 150 V184" fill="none" stroke={AMARILLO} stroke-width="5" stroke-linecap="round" />
    <path d="M219 182 h14 l3 20 h-20z" fill={AMARILLO} {...S} stroke-width="3" />
    <circle cx="160" cy="134" r="6" fill={AMARILLO} {...S} stroke-width="3" />
  </>
);

const corazon: Motif = (p) => (
  <>
    <path d="M160 216 C96 174 84 134 108 114 C128 98 152 106 160 126 C168 106 192 98 212 114 C236 134 224 174 160 216 Z" fill={p.a} {...S} />
    <path d="M118 132 q6 -12 20 -12" fill="none" stroke={p.d} stroke-width="6" stroke-linecap="round" />
    <path d="M232 96 c-5 -7 -15 0 -8 7 l8 7 l8 -7 c7 -7 -3 -14 -8 -7z" fill={p.c} {...S} stroke-width="3" />
    <path d="M86 176 c-4 -6 -12 0 -7 5 l7 6 l7 -6 c5 -5 -3 -11 -7 -5z" fill={p.d} {...S} stroke-width="3" />
  </>
);

const huevo: Motif = (p) => (
  <>
    <ellipse cx="160" cy="158" rx="52" ry="62" fill={p.d} {...S} />
    <path d="M110 148 l12 -10 l12 10 l12 -10 l12 10 l12 -10 l12 10 l12 -10 l12 10 l10 -8" fill="none" stroke={p.c} stroke-width="7" stroke-linejoin="round" />
    <path d="M114 186 H206" stroke={p.a} stroke-width="9" />
    <circle cx="160" cy="118" r="6" fill={AMARILLO} />
    <circle cx="140" cy="126" r="4" fill={p.a} />
    <circle cx="180" cy="126" r="4" fill={p.a} />
    <circle cx="140" cy="204" r="4" fill={p.c} />
    <circle cx="180" cy="204" r="4" fill={p.c} />
    <ellipse cx="160" cy="158" rx="52" ry="62" fill="none" {...S} />
    <path d="M84 220 q8 -20 14 0 q6 -16 12 0 M212 220 q6 -18 12 0 q6 -14 12 0" fill="none" stroke={VERDE} stroke-width="5" stroke-linecap="round" />
  </>
);

const casa: Motif = (p) => (
  <>
    <rect x="186" y="98" width="18" height="34" fill={p.c} {...S} />
    <rect x="104" y="140" width="112" height="80" fill={p.d} {...S} />
    <path d="M90 148 L160 92 L230 148 Z" fill={p.a} {...S} />
    <rect x="148" y="176" width="26" height="44" rx="4" fill={p.c} {...S} />
    <circle cx="167" cy="200" r="2.5" fill={TINTA} />
    <rect x="116" y="158" width="22" height="22" rx="3" fill={AMARILLO} {...S} />
    <path d="M127 158 V180 M116 169 H138" stroke={TINTA} stroke-width="3" />
    <path d="M190 166 c-5 -7 -15 0 -8 7 l8 7 l8 -7 c7 -7 -3 -14 -8 -7z" fill={p.a} {...S} stroke-width="3" />
  </>
);

const pizza: Motif = (p) => (
  <>
    <path d="M160 222 L102 106 Q160 86 218 106 Z" fill={AMARILLO} {...S} />
    <path d="M96 100 Q160 76 224 100 L216 116 Q160 94 104 116 Z" fill="#E9A75B" {...S} />
    <circle cx="146" cy="132" r="10" fill={ROJO} {...S} stroke-width="3" />
    <circle cx="180" cy="142" r="9" fill={ROJO} {...S} stroke-width="3" />
    <circle cx="158" cy="176" r="8" fill={ROJO} {...S} stroke-width="3" />
    <path d="M130 150 v14 M190 120 v12 M172 196 v10" stroke="#FFF3B0" stroke-width="5" stroke-linecap="round" />
    <path d="M128 112 q4 -2 8 0" stroke={VERDE} stroke-width="4" stroke-linecap="round" fill="none" />
    <circle cx="240" cy="200" r="5" fill={p.d} />
  </>
);

const bloque = (x: number, y: number, w: number, fill: string, top: string) => (
  <>
    <path d={`M${x} ${y} l12 -12 h${w} l-12 12 Z`} fill={top} {...S} />
    <path d={`M${x + w} ${y} l12 -12 v${w} l-12 12 Z`} fill={fill} {...S} opacity=".95" />
    <rect x={x} y={y} width={w} height={w} rx="3" fill={fill} {...S} />
  </>
);

const cadena: Motif = (p) => (
  <>
    <path d="M118 186 H138 M178 186 H198" stroke={TINTA} stroke-width="7" stroke-linecap="round" />
    {bloque(76, 164, 44, p.a, p.d)}
    {bloque(138, 164, 44, p.c, p.d)}
    {bloque(198, 164, 40, p.d, p.d)}
    <path d={starPath(98, 186, 11, 5)} fill={AMARILLO} {...S} stroke-width="3" />
    <path d="M150 178 h20 M150 188 h20 M150 198 h14" stroke={TINTA} stroke-width="3" stroke-linecap="round" />
  </>
);

const halving: Motif = (p) => (
  <>
    <g transform="rotate(-10 128 172)">
      <path d="M96 124 H150 L142 146 L152 168 L140 190 L150 214 H96 Z" fill={p.a} {...S} />
    </g>
    <g transform="rotate(10 192 172)">
      <path d="M224 124 H174 L166 146 L176 168 L164 190 L174 214 H224 Z" fill={p.c} {...S} />
    </g>
    <path d="M160 108 v-10 M146 112 l-6 -8 M174 112 l6 -8" stroke={p.d} stroke-width="5" stroke-linecap="round" />
  </>
);

const papel: Motif = (p) => (
  <>
    <path d="M118 98 H196 L218 120 V220 H118 Z" fill={p.d} {...S} transform="rotate(-6 168 160)" />
    <g transform="rotate(-6 168 160)">
      <path d="M196 98 V120 H218" fill="none" {...S} />
      <path d="M132 136 H200 M132 150 H200 M132 164 H186 M132 178 H200 M132 192 H170" stroke="#C9C5D9" stroke-width="5" stroke-linecap="round" />
      <path d="M134 114 H176" stroke={TINTA} stroke-width="6" stroke-linecap="round" />
    </g>
    <path d="M86 214 L104 150 L112 156 L94 218 Z" fill={p.a} {...S} stroke-width="4" />
  </>
);

const globos: Motif = (p) => (
  <>
    <path d="M124 160 Q130 190 160 218 M168 146 Q160 180 160 218 M206 166 Q196 196 160 218" fill="none" stroke={TINTA} stroke-width="3" />
    <ellipse cx="122" cy="130" rx="26" ry="32" fill={p.a} {...S} />
    <ellipse cx="206" cy="138" rx="24" ry="30" fill={AMARILLO} {...S} />
    <ellipse cx="166" cy="114" rx="28" ry="34" fill={p.c} {...S} />
    <path d="M119 162 l5 -2 l5 2 l-5 4z M163 148 l5 -2 l5 2 l-5 4z M203 168 l5 -2 l5 2 l-5 4z" fill={TINTA} />
    <path d="M110 116 q4 -10 12 -12 M154 98 q4 -10 12 -12 M196 124 q4 -8 10 -10" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" />
  </>
);

const manzana: Motif = (p) => (
  <>
    <rect x="96" y="200" width="128" height="18" rx="4" fill={p.c} {...S} />
    <path d="M104 200 V218" stroke={p.d} stroke-width="4" />
    <path d="M160 128 C132 108 98 124 102 162 C106 194 134 206 160 196 C186 206 214 194 218 162 C222 124 188 108 160 128 Z" fill={ROJO} {...S} />
    <path d="M160 128 q0 -16 10 -26" fill="none" {...S} />
    <path d="M168 112 q18 -18 36 -8 q-14 18 -36 8z" fill={VERDE} {...S} stroke-width="4" />
    <path d="M122 146 q4 -10 14 -12" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" />
  </>
);

const regalo: Motif = (p) => (
  <>
    <rect x="92" y="142" width="136" height="76" rx="8" fill={p.a} {...S} />
    <rect x="82" y="122" width="156" height="28" rx="6" fill={p.a} {...S} />
    <rect x="148" y="122" width="24" height="96" fill={p.d} {...S} />
    <path d="M160 122 q-34 -36 -48 -14 q-6 14 48 14z M160 122 q34 -36 48 -14 q6 14 -48 14z" fill={AMARILLO} {...S} />
  </>
);

const MOTIFS: Readonly<Record<OccasionKey, Motif>> = {
  cumple: torta,
  quince: torta,
  bautismo: paloma,
  comunion: paloma,
  navidad: arbol,
  reyes: reyMago,
  anionuevo: fuegos,
  casamiento: anillos,
  aniversario: anillos,
  nacimiento: cochecito,
  babyshower: cochecito,
  egresados: birrete,
  recibido: birrete,
  graduacion: birrete,
  maestro: manzana,
  sanvalentin: corazon,
  diamadre: corazon,
  diapadre: corazon,
  abuelos: corazon,
  amigo: corazon,
  pascuas: huevo,
  casanueva: casa,
  pizzaday: pizza,
  genesis: cadena,
  whitepaper: papel,
  halving: halving,
  dianino: globos,
  mitzva: regalo,
  jubilacion: regalo,
  trabajo: regalo,
  gracias: regalo,
  mejorate: regalo,
  porque: regalo,
  otra: regalo,
};

function Confeti({ p }: { p: Palette }) {
  return (
    <>
      <circle cx="40" cy="40" r="6" fill={AMARILLO} />
      <circle cx="282" cy="60" r="5" fill={p.d} />
      <rect x="258" y="160" width="8" height="16" rx="2" fill={p.c} transform="rotate(30 262 168)" />
      <rect x="46" y="150" width="8" height="16" rx="2" fill={p.a} transform="rotate(-25 50 158)" />
      <circle cx="86" cy="86" r="4" fill={p.d} />
      <circle cx="244" cy="112" r="5" fill={p.a} />
      <rect x="216" y="30" width="8" height="15" rx="2" fill={p.d} transform="rotate(-20 220 37)" />
      <circle cx="30" cy="210" r="4" fill={p.c} />
    </>
  );
}

/** Moneda (o medallita) dorada con el ₿, propia: no imita monedas reales. */
function Coin({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={AMARILLO} {...S} />
      <circle cx={cx} cy={cy} r={r - 7} fill="none" stroke="#E0A800" stroke-width="2" />
      <BitcoinB cx={cx} cy={cy} h={r * 1.05} color={TINTA} />
    </g>
  );
}

/** Estilos que ofrece la web. 'realista' (banco de fotos) se suma cuando haya fotos. */
export type CardStyle = 'ilustracion' | 'mano' | 'elegante' | 'propia';
export const CARD_STYLES: readonly CardStyle[] = ['ilustracion', 'mano', 'elegante', 'propia'];
export const isCardStyle = (s: unknown): s is CardStyle => typeof s === 'string' && (CARD_STYLES as readonly string[]).includes(s);

/** Estilos que se recorren tocando la imagen («Con tu IA» queda afuera: no hay qué mostrar). */
export const DRAWN_STYLES: readonly CardStyle[] = ['ilustracion', 'mano', 'elegante'];

/** Fondo papel y garabatos de fibra para el estilo "Dibujo a mano". */
const PAPEL = '#FBF6EA';
function Garabatos({ p }: { p: Palette }) {
  const t = { fill: 'none', 'stroke-width': 4, 'stroke-linecap': 'round' } as const;
  return (
    <>
      <path d="M34 34 l10 14 M50 30 l4 12" stroke={p.a} {...t} />
      <path d="M272 40 q8 -6 14 2" stroke={p.c} {...t} />
      <path d="M40 176 l14 -4" stroke={p.c} {...t} />
      <path d="M276 168 l12 6 M280 186 l10 -2" stroke={p.a} {...t} />
      <path d="M248 112 l6 6" stroke={AMARILLO} {...t} />
      <path d="M70 100 l-6 8" stroke={AMARILLO} {...t} />
    </>
  );
}

/**
 * Imagen de la tarjeta para la ocasión y el estilo elegidos. Es decorativa (aria-hidden): quien
 * la usa pone el texto accesible. Con `name`, el nombre de quien recibe va en una etiqueta abajo
 * (salvo en la imagen propia, donde el nombre lo pone la IA).
 */
export function GiftCardArt({
  occasion,
  name,
  class: className,
  estilo,
  src,
}: {
  occasion: string;
  name?: string | undefined;
  class?: string;
  estilo?: string | undefined;
  /** Imagen propia (estilo 'propia'): data: en el navegador o /api/gifts/<id>/imagen. */
  src?: string | null | undefined;
}) {
  const id = useId().replace(/[^A-Za-z0-9_-]/g, '');
  if (estilo === 'propia' && src) return <OwnCard src={src} className={className} />;
  if (estilo === 'elegante') return <ElegantCard occasion={occasion} name={name} className={className} />;
  if (estilo === 'mano') return <HandCard occasion={occasion} name={name} className={className} fid={`mano-${id}`} />;
  const motif = MOTIFS[isOccasion(occasion) ? occasion : 'otra'];
  const [cx, cy, r] = MONEDA;
  const label = name?.trim() ?? '';
  // Ancho aproximado del texto (Bricolage 800 ≈ 0,58 em por carácter) para la etiqueta.
  const chars = [...label].length;
  const size = Math.min(20, 250 / Math.max(1, chars * 0.58));
  const pill = chars * size * 0.58 + 32;
  return (
    <svg class={`arte-tarjeta${className ? ` ${className}` : ''}`} viewBox="0 0 320 250" aria-hidden="true" focusable="false">
      <rect width="320" height="250" fill={FONDO} />
      <Confeti p={PALETA} />
      <ellipse cx="160" cy="222" rx="100" ry="12" fill={TINTA} opacity=".2" />
      {motif(PALETA)}
      <Coin cx={cx} cy={cy} r={r} />
      {label !== '' && (
        <g>
          <rect x={160 - pill / 2} y="206" width={pill} height="34" rx="17" fill="#FFFFFF" {...S} stroke-width="3" />
          <text x="160" y={223 + size * 0.36} text-anchor="middle" font-family="Bricolage Grotesque, system-ui, sans-serif" font-weight="800" font-size={size} fill={TINTA}>
            {label}
          </text>
        </g>
      )}
    </svg>
  );
}

/**
 * Estilo "Dibujo a mano": los mismos motivos sobre papel, con el trazo temblado y grano de
 * crayón (filtro SVG). El filtro usa un id único por tarjeta; no carga nada externo.
 */
function HandCard({ occasion, name, className, fid }: { occasion: string; name?: string | undefined; className?: string | undefined; fid: string }) {
  const motif = MOTIFS[isOccasion(occasion) ? occasion : 'otra'];
  const p = PALETA;
  const label = name?.trim() ?? '';
  const chars = [...label].length;
  const size = Math.min(34, 250 / Math.max(1, chars * 0.42));
  return (
    <svg class={`arte-tarjeta${className ? ` ${className}` : ''}`} viewBox="0 0 320 250" aria-hidden="true" focusable="false">
      <defs>
        <filter id={fid} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="1" result="ondas" />
          <feDisplacementMap in="SourceGraphic" in2="ondas" scale="6" xChannelSelector="R" yChannelSelector="G" result="temblor" />
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="7" result="grano" />
          <feColorMatrix in="grano" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 2.1" result="poros" />
          <feComposite in="temblor" in2="poros" operator="in" />
        </filter>
      </defs>
      <rect width="320" height="250" fill={PAPEL} />
      <g filter={`url(#${fid})`}>
        <Garabatos p={p} />
        {motif(p)}
        <Coin cx={MONEDA[0]} cy={MONEDA[1]} r={MONEDA[2]} />
      </g>
      {label !== '' && (
        <g transform="rotate(-3 160 222)">
          <rect x={160 - (chars * size * 0.42 + 36) / 2} y="200" width={chars * size * 0.42 + 36} height="40" rx="4" fill="#FFFFFF" opacity=".92" stroke={TINTA} stroke-width="2.5" stroke-dasharray="7 4" />
          <text x="160" y={220 + size * 0.34} text-anchor="middle" font-family="Caveat, 'Segoe Print', 'Bradley Hand', cursive" font-weight="700" font-size={size} fill={TINTA}>
            {label}
          </text>
        </g>
      )}
    </svg>
  );
}

/** Imagen propia (hecha con IA o subida): misma proporción que los dibujos. El nombre ya viene en
 * la imagen (lo pone la IA, en una cinta abajo): no le superponemos nada. */
function OwnCard({ src, className }: { src: string; className?: string | undefined }) {
  return (
    <span class={`arte-tarjeta arte-propia${className ? ` ${className}` : ''}`} aria-hidden="true">
      <img src={src} alt="" decoding="async" />
    </span>
  );
}

const DORADO = '#E2B84A';
const NOCHE = '#14122B';

/**
 * Estilo "Elegante": fondo noche, marco y motivo en línea dorada (el CSS de .arte-elegante pasa
 * los rellenos a trazo dorado) y el nombre en letra serif.
 */
function ElegantCard({ occasion, name, className }: { occasion: string; name?: string | undefined; className?: string | undefined }) {
  const motif = MOTIFS[isOccasion(occasion) ? occasion : 'otra'];
  const label = name?.trim() ?? '';
  const size = Math.min(24, 250 / Math.max(1, [...label].length * 0.5));
  const stars: readonly [number, number, number][] = [
    [40, 40, 7],
    [282, 52, 9],
    [262, 180, 5],
    [56, 168, 5],
  ];
  return (
    <svg class={`arte-tarjeta arte-elegante${className ? ` ${className}` : ''}`} viewBox="0 0 320 250" aria-hidden="true" focusable="false">
      <rect width="320" height="250" fill={NOCHE} />
      <rect x="12" y="12" width="296" height="226" rx="6" fill="none" stroke={DORADO} stroke-width="1.5" opacity=".7" />
      {stars.map(([x, y, r]) => (
        <path key={`${x}-${y}`} d={starPath(x, y, r, r * 0.35, 4)} fill={DORADO} opacity=".9" />
      ))}
      <g class="motivo-linea" transform={label === '' ? 'translate(32 18) scale(0.8)' : 'translate(40 6) scale(0.75)'}>
        {motif(PALETA)}
      </g>
      <circle cx="160" cy="42" r="17" fill="none" stroke={DORADO} stroke-width="2" />
      <BitcoinB cx={160} cy={42} h={19} color={DORADO} weight={3.5} />
      {label !== '' && (
        <text x="160" y="226" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size={size} fill={DORADO}>
          {label}
        </text>
      )}
    </svg>
  );
}
