import type { ComponentChildren } from 'preact';
import { BitcoinB } from './BitcoinB.tsx';

// Ilustraciones de la página "¿Por qué Bitcoin?": una alegoría por franja de edad y la escena
// de los Reyes Magos llevando bitcoin al pesebre. Mismo estilo que GiftCardArt (plano,
// colorido, trazo tinta grueso y moneda dorada con ₿). SVG en línea, sin ids ni <style>:
// compatible con la CSP.

const T = '#1A1530';
const AMARILLO = '#FFD23F';
const ROSA = '#FF5D8F';
const CELESTE = '#4CC9F0';
const NARANJA = '#FF8A1F';
const BLANCO = '#FFFFFF';
const PIEL = '#F2C9A0';
const MADERA = '#9A6236';

/** Trazo de la marca, un poco más fino que en la tarjeta porque el dibujo es más chico. */
const S = { stroke: T, 'stroke-width': 4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' } as const;

/** Moneda dorada con ₿. */
function Coin({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={AMARILLO} {...S} stroke-width={r > 12 ? 3.5 : 3} />
      <circle cx={cx} cy={cy} r={r * 0.72} fill="none" stroke="#E0A800" stroke-width="1.5" />
      <BitcoinB cx={cx} cy={cy} h={r * 1.05} color={T} />
    </g>
  );
}

/** Brillitos alrededor de la moneda. */
const destellos = (cx: number, cy: number, r: number) => (
  <path
    d={`M${cx - r - 6} ${cy - r + 2} l-6 -5 M${cx + r + 6} ${cy - r + 2} l6 -5 M${cx} ${cy - r - 6} v-7`}
    stroke={T}
    stroke-width="3"
    stroke-linecap="round"
    fill="none"
  />
);

/** Brazo o pierna: contorno tinta y relleno encima, para que se vea el trazo de la marca. */
const miembro = (d: string, fill: string, ancho = 9) => (
  <>
    <path d={d} fill="none" stroke={T} stroke-width={ancho + 7} stroke-linecap="round" stroke-linejoin="round" />
    <path d={d} fill="none" stroke={fill} stroke-width={ancho} stroke-linecap="round" stroke-linejoin="round" />
  </>
);

/** Confeti estático de fondo. */
const confeti = (piezas: readonly (readonly [x: number, y: number, color: string, forma: 'c' | 'r'])[]) => (
  <>
    {piezas.map(([x, y, color, forma], i) =>
      forma === 'c' ? (
        <circle key={i} cx={x} cy={y} r="3.5" fill={color} />
      ) : (
        <rect key={i} x={x - 5} y={y - 2.5} width="10" height="5" rx="2.5" fill={color} transform={`rotate(${(i * 37) % 90 - 45} ${x} ${y})`} />
      ),
    )}
  </>
);

const ojos = (x1: number, x2: number, y: number) => (
  <>
    <circle cx={x1} cy={y} r="2.4" fill={T} />
    <circle cx={x2} cy={y} r="2.4" fill={T} />
  </>
);

// Lienzo de 200 × 150 para las franjas de edad.

/** 0–4: bebé dormido en el cochecito, con la medallita (la moneda) arriba. */
const bebe = (
  <>
    {confeti([
      [170, 22, BLANCO, 'r'],
      [184, 52, ROSA, 'c'],
      [14, 112, BLANCO, 'c'],
      [24, 92, AMARILLO, 'r'],
    ])}
    <path d="M44 84 L30 58 H18" fill="none" {...S} />
    <circle cx="80" cy="72" r="16" fill={PIEL} {...S} />
    <path d="M76 57 q2 -9 9 -6" fill="none" {...S} stroke-width="3" />
    <path d="M71 72 q3 3 6 0 M83 72 q3 3 6 0" fill="none" stroke={T} stroke-width="2.5" stroke-linecap="round" />
    <circle cx="70" cy="78" r="3" fill={ROSA} opacity=".5" />
    <path d="M102 82 V34 A48 48 0 0 1 150 82 Z" fill={CELESTE} {...S} />
    <path d="M126 40 V82 M114 36 V82" stroke={BLANCO} stroke-width="3" opacity=".7" />
    <path d="M42 82 H164 Q164 122 122 126 H84 Q42 122 42 82 Z" fill={ROSA} {...S} />
    <path d="M52 98 H154" stroke={BLANCO} stroke-width="4" stroke-linecap="round" />
    <circle cx="72" cy="134" r="10" fill={BLANCO} {...S} />
    <circle cx="134" cy="134" r="10" fill={BLANCO} {...S} />
    <circle cx="72" cy="134" r="2.5" fill={T} />
    <circle cx="134" cy="134" r="2.5" fill={T} />
    {destellos(40, 32, 15)}
    <Coin cx={40} cy={32} r={15} />
  </>
);

/** 5–12: chico que pone la moneda en el chanchito (su primera alcancía). */
const chico = (
  <>
    {confeti([
      [100, 18, BLANCO, 'r'],
      [186, 30, CELESTE, 'c'],
      [14, 30, ROSA, 'r'],
      [190, 140, BLANCO, 'c'],
    ])}
    {miembro('M54 120 V142', '#3A5BA0', 10)}
    {miembro('M70 120 V142', '#3A5BA0', 10)}
    <rect x="42" y="78" width="40" height="46" rx="12" fill={NARANJA} {...S} />
    {miembro('M78 90 Q96 92 106 76', PIEL)}
    <circle cx="62" cy="56" r="19" fill={PIEL} {...S} />
    <path d="M43 54 Q44 34 62 36 Q80 34 81 52 Q70 46 58 48 Q50 46 43 54 Z" fill="#6B3E26" {...S} stroke-width="3" />
    {ojos(56, 70, 59)}
    <path d="M58 66 q5 5 10 0" fill="none" stroke={T} stroke-width="2.5" stroke-linecap="round" />
    <ellipse cx="140" cy="110" rx="38" ry="27" fill={ROSA} {...S} />
    <path d="M118 88 L114 72 L130 84 Z" fill={ROSA} {...S} stroke-width="3" />
    <ellipse cx="177" cy="108" rx="8" ry="10" fill="#FF8FB1" {...S} stroke-width="3" />
    <circle cx="175" cy="105" r="1.6" fill={T} />
    <circle cx="179" cy="111" r="1.6" fill={T} />
    <circle cx="160" cy="100" r="2.6" fill={T} />
    <path d="M122 134 v8 M136 136 v8 M148 136 v8 M162 134 v8" stroke={T} stroke-width="7" stroke-linecap="round" />
    <path d="M131 84 H149" stroke={T} stroke-width="4" stroke-linecap="round" />
    <path d="M102 116 q-10 2 -8 -10" fill="none" {...S} stroke-width="3" />
    <path d="M140 74 v-6 M134 76 l-4 -4 M146 76 l4 -4" stroke={T} stroke-width="2.5" stroke-linecap="round" />
    <Coin cx={140} cy={52} r={14} />
  </>
);

/** 13–17: adolescente con auriculares mirando el celular con la ₿ en la pantalla. */
const adolescente = (
  <>
    {confeti([
      [24, 30, BLANCO, 'r'],
      [176, 24, AMARILLO, 'c'],
      [180, 110, BLANCO, 'r'],
      [18, 120, CELESTE, 'c'],
    ])}
    <path d="M58 152 L64 100 Q100 82 136 100 L142 152 Z" fill="#7B5CE0" {...S} />
    <path d="M86 92 Q100 108 114 92" fill="none" {...S} stroke-width="3" />
    <path d="M92 102 L90 124 M108 102 L110 124" stroke={BLANCO} stroke-width="3" stroke-linecap="round" />
    <circle cx="100" cy="56" r="21" fill={PIEL} {...S} />
    <path d="M78 54 Q76 30 100 30 Q124 30 122 52 Q114 42 106 46 Q98 38 90 46 Q84 44 78 54 Z" fill="#2E2147" {...S} stroke-width="3" />
    <path d="M76 58 Q74 22 100 22 Q126 22 124 58" fill="none" stroke={T} stroke-width="5" stroke-linecap="round" />
    <rect x="70" y="50" width="11" height="18" rx="5" fill={CELESTE} {...S} stroke-width="3" />
    <rect x="119" y="50" width="11" height="18" rx="5" fill={CELESTE} {...S} stroke-width="3" />
    <path d="M91 62 q3 -2 6 0 M103 62 q3 -2 6 0" fill="none" stroke={T} stroke-width="2.5" stroke-linecap="round" />
    <path d="M96 70 q4 3 8 0" fill="none" stroke={T} stroke-width="2.5" stroke-linecap="round" />
    <rect x="82" y="102" width="36" height="52" rx="7" fill={T} {...S} stroke-width="3" />
    <rect x="86" y="108" width="28" height="38" rx="3" fill={BLANCO} />
    <Coin cx={100} cy={127} r={10} />
    <ellipse cx="82" cy="134" rx="7" ry="8" fill={PIEL} {...S} stroke-width="3" />
    <ellipse cx="118" cy="134" rx="7" ry="8" fill={PIEL} {...S} stroke-width="3" />
    <path d="M142 70 l8 -6 M146 82 h10 M142 94 l8 6" stroke={T} stroke-width="3" stroke-linecap="round" />
  </>
);

/** 18–69: adulto que abre su billetera y le salta la moneda. */
const adulto = (
  <>
    {confeti([
      [180, 22, BLANCO, 'c'],
      [20, 24, ROSA, 'r'],
      [186, 136, AMARILLO, 'r'],
      [16, 132, BLANCO, 'c'],
    ])}
    <path d="M40 152 L46 96 Q72 82 98 96 L104 152 Z" fill={NARANJA} {...S} />
    <path d="M62 90 L72 112 L82 90" fill={BLANCO} {...S} stroke-width="3" />
    <path d="M72 112 V152" stroke={T} stroke-width="3" stroke-linecap="round" />
    {miembro('M96 104 Q108 124 122 120', NARANJA, 11)}
    <circle cx="72" cy="58" r="20" fill={PIEL} {...S} />
    <path d="M52 56 Q50 36 72 36 Q94 36 92 54 Q84 46 72 48 Q60 46 52 56 Z" fill="#4A3020" {...S} stroke-width="3" />
    {ojos(66, 80, 60)}
    <path d="M66 68 q6 5 12 0" fill="none" stroke={T} stroke-width="2.5" stroke-linecap="round" />
    <rect x="116" y="104" width="58" height="38" rx="7" fill={MADERA} {...S} />
    <path d="M116 116 H174" stroke={T} stroke-width="3" />
    <rect x="152" y="116" width="22" height="14" rx="4" fill="#C98A52" {...S} stroke-width="3" />
    <circle cx="160" cy="123" r="2.5" fill={T} />
    <ellipse cx="124" cy="120" rx="8" ry="8" fill={PIEL} {...S} stroke-width="3" />
    <path d="M145 98 v-8 M132 100 l-5 -6 M158 100 l5 -6" stroke={T} stroke-width="2.5" stroke-linecap="round" />
    {destellos(145, 66, 17)}
    <Coin cx={145} cy={66} r={17} />
  </>
);

/** 70+: abuela en su sillón, con anteojos, y la moneda entre las manos. */
const mayor = (
  <>
    {confeti([
      [22, 26, AMARILLO, 'r'],
      [180, 26, ROSA, 'c'],
      [16, 120, BLANCO, 'r'],
      [186, 124, CELESTE, 'c'],
    ])}
    <rect x="50" y="34" width="100" height="112" rx="26" fill={ROSA} {...S} />
    <rect x="38" y="92" width="26" height="54" rx="12" fill="#FF8FB1" {...S} />
    <rect x="136" y="92" width="26" height="54" rx="12" fill="#FF8FB1" {...S} />
    <path d="M70 146 L74 96 Q100 82 126 96 L130 146 Z" fill={CELESTE} {...S} />
    <path d="M100 92 V146" stroke={T} stroke-width="3" />
    <circle cx="94" cy="110" r="2" fill={T} />
    <circle cx="94" cy="128" r="2" fill={T} />
    <circle cx="100" cy="34" r="10" fill="#D9D6E4" {...S} stroke-width="3" />
    <circle cx="100" cy="60" r="19" fill={PIEL} {...S} />
    <path d="M81 60 Q80 40 100 41 Q120 40 119 60 Q114 50 100 50 Q86 50 81 60 Z" fill="#D9D6E4" {...S} stroke-width="3" />
    <circle cx="93" cy="62" r="6" fill="none" stroke={T} stroke-width="2.5" />
    <circle cx="107" cy="62" r="6" fill="none" stroke={T} stroke-width="2.5" />
    <path d="M99 62 h2" stroke={T} stroke-width="2.5" />
    <circle cx="93" cy="62" r="1.6" fill={T} />
    <circle cx="107" cy="62" r="1.6" fill={T} />
    <path d="M95 71 q5 4 10 0" fill="none" stroke={T} stroke-width="2.5" stroke-linecap="round" />
    <Coin cx={100} cy={120} r={14} />
    <ellipse cx="85" cy="124" rx="7" ry="8" fill={PIEL} {...S} stroke-width="3" />
    <ellipse cx="115" cy="124" rx="7" ry="8" fill={PIEL} {...S} stroke-width="3" />
    {miembro('M172 64 q8 0 8 8 V146', MADERA, 4)}
  </>
);

const AGE_ART: Readonly<Record<1 | 2 | 3 | 4 | 5, ComponentChildren>> = { 1: bebe, 2: chico, 3: adolescente, 4: adulto, 5: mayor };

/** Ilustración alegórica de una franja de edad (decorativa: el nombre va al lado, en texto). */
export function AgeArt({ n, class: className }: { n: 1 | 2 | 3 | 4 | 5; class?: string }) {
  return (
    <svg class={className} viewBox="0 0 200 150" aria-hidden="true" focusable="false">
      {AGE_ART[n]}
    </svg>
  );
}

/** Estrella de 5 puntas como path. */
function starPath(cx: number, cy: number, R: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(1)} ${(cy + rad * Math.sin(ang)).toFixed(1)}`);
  }
  return `M${pts.join(' L')}Z`;
}

type Regalo = 'caja' | 'vasija' | 'moneda';

/** Un rey mago de perfil hacia el pesebre, con su regalo en las manos. */
function rey(x: number, manto: string, piel: string, barba: string, regalo: Regalo) {
  return (
    <g>
      <path d={`M${x - 24} 190 L${x - 14} 126 Q${x} 116 ${x + 14} 126 L${x + 24} 190 Z`} fill={manto} {...S} />
      <path d={`M${x - 20} 172 H${x + 20}`} stroke={AMARILLO} stroke-width="5" stroke-linecap="round" />
      <circle cx={x} cy={106} r={13} fill={piel} {...S} stroke-width="3.5" />
      <path d={`M${x - 10} 110 Q${x - 6} 128 ${x + 4} 126 Q${x + 12} 122 ${x + 12} 110 Q${x + 4} 116 ${x - 10} 110 Z`} fill={barba} {...S} stroke-width="3" />
      <circle cx={x + 6} cy={103} r="2" fill={T} />
      <path d={`M${x - 12} 96 L${x - 13} 80 L${x - 6} 88 L${x} 76 L${x + 6} 88 L${x + 13} 80 L${x + 12} 96 Z`} fill={AMARILLO} {...S} stroke-width="3" />
      {miembro(`M${x + 2} 136 Q${x + 12} 146 ${x + 20} 140`, manto, 7)}
      {regalo === 'caja' && (
        <>
          <rect x={x + 14} y={124} width={22} height={20} rx="3" fill={ROSA} {...S} stroke-width="3" />
          <path d={`M${x + 25} 124 V144 M${x + 14} 133 H${x + 36}`} stroke={AMARILLO} stroke-width="3" />
        </>
      )}
      {regalo === 'vasija' && (
        <path d={`M${x + 18} 122 H${x + 32} L${x + 30} 128 Q${x + 38} 136 ${x + 32} 146 H${x + 18} Q${x + 12} 136 ${x + 20} 128 Z`} fill={CELESTE} {...S} stroke-width="3" />
      )}
      {regalo === 'moneda' && <Coin cx={x + 27} cy={132} r={13} />}
      <ellipse cx={x + 21} cy={140} rx="5" ry="5" fill={piel} {...S} stroke-width="2.5" />
    </g>
  );
}

const estrellitas: readonly (readonly [number, number, number])[] = [
  [20, 22, 2],
  [62, 40, 1.5],
  [104, 18, 2.2],
  [148, 46, 1.5],
  [190, 20, 2],
  [222, 54, 1.6],
  [338, 24, 2],
  [350, 70, 1.5],
  [34, 70, 1.4],
  [176, 74, 1.4],
];

/** Escena del cuento: los tres Reyes Magos llegan al pesebre; uno trae la moneda de bitcoin. */
export function CuentoArt({ label, class: className }: { label: string; class?: string }) {
  return (
    <svg class={className} viewBox="0 0 360 220" preserveAspectRatio="xMidYMid slice" role="img" aria-label={label} focusable="false">
      <rect x="0" y="0" width="360" height="220" fill="#2A2347" />
      {estrellitas.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={BLANCO} />
      ))}
      <path d="M288 44 L248 176 H332 Z" fill={AMARILLO} opacity=".14" />
      <path d="M288 14 v-8 M288 58 v8 M260 36 h-8 M316 36 h8" stroke={AMARILLO} stroke-width="3" stroke-linecap="round" />
      <path d={starPath(288, 36, 17, 7.5)} fill={AMARILLO} {...S} stroke-width="3" />
      <path d="M0 184 Q90 168 180 178 T360 174 V220 H0 Z" fill="#2F7D57" {...S} stroke-width="3" />
      {/* Pesebre: techo a dos aguas, pared del fondo, postes y el niño en la cuna con paja. */}
      <rect x="250" y="114" width="78" height="68" fill="#7A4A2A" {...S} stroke-width="3" />
      <rect x="244" y="110" width="9" height="74" rx="2" fill={MADERA} {...S} stroke-width="3" />
      <rect x="325" y="110" width="9" height="74" rx="2" fill={MADERA} {...S} stroke-width="3" />
      <path d="M232 118 L289 76 L346 118 Z" fill="#C47A3C" {...S} />
      <path d="M252 106 L289 80 L326 106" fill="none" stroke="#E2A266" stroke-width="3" stroke-linecap="round" />
      <circle cx="289" cy="158" r="12" fill="none" stroke={AMARILLO} stroke-width="2.5" opacity=".8" />
      <circle cx="289" cy="158" r="7" fill={PIEL} {...S} stroke-width="2.5" />
      <ellipse cx="292" cy="168" rx="15" ry="7" fill={BLANCO} {...S} stroke-width="2.5" />
      <path d="M266 170 L312 170 L305 188 L273 188 Z" fill="#E0A060" {...S} stroke-width="3" />
      <path d="M264 171 l5 -6 l4 6 l5 -7 l4 7 l5 -6 l4 6 l5 -7 l4 7 l5 -6 l4 6" fill={AMARILLO} stroke={T} stroke-width="2" stroke-linejoin="round" />
      {rey(52, ROSA, '#8D5524', '#2B1A10', 'caja')}
      {rey(124, CELESTE, PIEL, '#F1EEF6', 'vasija')}
      {rey(196, NARANJA, '#C68B59', '#5A3A22', 'moneda')}
    </svg>
  );
}
