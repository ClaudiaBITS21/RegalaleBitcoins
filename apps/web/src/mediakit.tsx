import { useEffect, useState } from 'preact/hooks';
import { B_PATH, WM } from './content/marca-trazos.ts';
import { SiteFooter, SiteHeader, useI18n } from './ui.tsx';

// Mediakit (regalalebitcoin.com/mediakit): el manual de identidad v1 (19/10/2026) y las
// descargas de logos, todo en esta página (pedido de Rodolfo, 19/10). La política de seguridad
// del sitio no deja scripts ni estilos en línea ni innerHTML: cada muestra es una imagen SVG
// armada acá (data:) con la misma geometría que se descarga. El manual está en castellano.

/** Contacto de prensa (Rodolfo, 20/10): por ahora hola@. */
const PRENSA = 'hola@regalalebitcoin.com';

type Caja = 'claro' | 'naranja' | 'negro' | 'rosa';

const CAJA: Readonly<Record<Caja, { caja: string; borde: string; sombra: string; b: string }>> = {
  claro: { caja: '#FF8A1F', borde: '#1A1530', sombra: '#1A1530', b: '#1A1530' },
  naranja: { caja: '#FFFFFF', borde: '#1A1530', sombra: '#1A1530', b: '#FF8A1F' },
  negro: { caja: '#FF8A1F', borde: '#000000', sombra: '#B3470A', b: '#FFFFFF' },
  rosa: { caja: '#FF5D8F', borde: '#1A1530', sombra: '#1A1530', b: '#4CC9F0' },
};

const NS = 'xmlns="http://www.w3.org/2000/svg"';

function caja(f: Caja, giro = -10): string {
  const c = CAJA[f];
  return (
    `<g transform="rotate(${giro} 112 128)">` +
    `<path d="M108 78c-14-30-46-34-46-14 0 12 24 17 46 14zM108 78c14-30 46-34 46-14 0 12-24 17-46 14z" fill="${c.caja}" stroke="${c.borde}" stroke-width="5" stroke-linejoin="round"/>` +
    `<rect x="64" y="86" width="104" height="96" rx="16" fill="${c.sombra}"/>` +
    `<rect x="56" y="78" width="104" height="96" rx="16" fill="${c.caja}" stroke="${c.borde}" stroke-width="5"/>` +
    `<g transform="translate(108 126) scale(1.75) translate(-33 -36)"><path d="${B_PATH}" fill="none" stroke="${c.b}" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/></g></g>`
  );
}

function moneda(fill: string): string {
  return `<circle cx="36" cy="36" r="32" fill="${fill}" stroke="#1A1530" stroke-width="5"/><circle cx="36" cy="36" r="23.5" fill="none" stroke="#1A1530" stroke-width="2.5"/><path d="${B_PATH}" fill="none" stroke="#1A1530" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const svgIso = (f: Caja, giro = -10) => `<svg ${NS} viewBox="38 34 148 160" width="148" height="160">${caja(f, giro)}</svg>`;

function svgApp(fondo: 'naranja' | 'negro', redondeado: boolean): string {
  const color = fondo === 'negro' ? '#000000' : '#FF8A1F';
  return `<svg ${NS} viewBox="0 0 160 160" width="160" height="160"><rect width="160" height="160"${redondeado ? ' rx="36"' : ''} fill="${color}"/><svg x="22" y="17.5" width="116" height="125" viewBox="38 34 148 160">${caja(fondo)}</svg></svg>`;
}

const svgMoneda = (fill = '#FF8A1F') => `<svg ${NS} viewBox="0 0 72 72" width="72" height="72">${moneda(fill)}</svg>`;

const CAJA_ABIERTA =
  `<svg ${NS} viewBox="0 0 200 200" width="200" height="200">` +
  '<path d="M58 40 l-14 -8 M54 64 l-16 0 M142 40 l14 -8 M146 64 l16 0" stroke="#1A1530" stroke-width="4" stroke-linecap="round" fill="none"/>' +
  `<g transform="rotate(-10 100 56) translate(66 22) scale(0.944)">${moneda('#FFD23F')}</g>` +
  '<rect x="52" y="126" width="96" height="64" rx="5" fill="#FF5D8F" stroke="#1A1530" stroke-width="4"/>' +
  '<rect x="92" y="126" width="16" height="64" fill="#FFD23F" stroke="#1A1530" stroke-width="3"/>' +
  '<g transform="rotate(-14 44 122)"><rect x="40" y="100" width="120" height="26" rx="5" fill="#FF5D8F" stroke="#1A1530" stroke-width="4"/>' +
  '<rect x="92" y="100" width="16" height="26" fill="#FFD23F" stroke="#1A1530" stroke-width="3"/></g></svg>';

/** Versiones del logotipo: color de REGALALE, color de BITCOIN y caja. */
type Version = 'claro' | 'naranja' | 'oscuro';
const LOGO: Readonly<Record<Version, readonly [string, string, Caja]>> = {
  claro: ['#1A1530', '#FF8A1F', 'claro'],
  naranja: ['#1A1530', '#FFFFFF', 'naranja'],
  oscuro: ['#FFFFFF', '#FF8A1F', 'negro'],
};

function svgLogo(v: Version, colores?: readonly [string, string, Caja]): string {
  const [a, b, f] = colores ?? LOGO[v];
  return `<svg ${NS} viewBox="0 0 ${WM.w} ${WM.h}" width="${WM.w}" height="${WM.h}"><svg x="0" y="0" width="145" height="157" viewBox="38 34 148 160">${caja(f)}</svg><path d="${WM.p1}" fill="${a}"/><path d="${WM.p2}" fill="${b}"/></svg>`;
}

// Versión compacta: el texto va del borde de arriba de la caja al de abajo de la sombra.
const COMPACTO = (() => {
  const arriba = 70.4;
  const abajo = 171.5;
  const salto = Math.round(WM.cap * 1.35 * 10) / 10;
  const k = (WM.cap + salto) / (abajo - arriba);
  const b1 = Math.round(((arriba - 34) * k + WM.cap) * 10) / 10;
  return { ch: Math.round(160 * k * 10) / 10, cw: Math.round(148 * k * 10) / 10, gap: 30, b1, b2: Math.round((b1 + salto) * 10) / 10, top: Math.round((arriba - 34) * k * 10) / 10 };
})();

function svgCompacto(v: Version, guias = false): string {
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

const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function Img({ svg, alt, class: cls }: { svg: string; alt: string; class?: string }) {
  return <img class={cls} src={dataUrl(svg)} alt={alt} />;
}

interface Descarga {
  readonly t: string;
  readonly d: string;
  readonly bg: 'claro' | 'naranja' | 'oscuro' | 'negro' | 'cuadros';
  readonly svg: () => string;
  readonly f: string;
  readonly png: number;
}

const DESCARGAS: readonly Descarga[] = [
  { t: 'Logotipo horizontal · sobre claro', d: 'Para fondos blancos o claros.', bg: 'claro', svg: () => svgLogo('claro'), f: 'regalale-bitcoin-logotipo-claro', png: 2400 },
  { t: 'Logotipo horizontal · sobre naranja', d: 'Caja blanca; BITCOIN en blanco.', bg: 'naranja', svg: () => svgLogo('naranja'), f: 'regalale-bitcoin-logotipo-naranja', png: 2400 },
  { t: 'Logotipo horizontal · sobre oscuro', d: 'Para tinta o negro.', bg: 'oscuro', svg: () => svgLogo('oscuro'), f: 'regalale-bitcoin-logotipo-oscuro', png: 2400 },
  { t: 'Logotipo compacto · sobre claro', d: 'Caja y nombre en dos líneas.', bg: 'claro', svg: () => svgCompacto('claro'), f: 'regalale-bitcoin-logotipo-compacto-claro', png: 2000 },
  { t: 'Logotipo compacto · sobre naranja', d: 'Caja blanca; BITCOIN en blanco.', bg: 'naranja', svg: () => svgCompacto('naranja'), f: 'regalale-bitcoin-logotipo-compacto-naranja', png: 2000 },
  { t: 'Logotipo compacto · sobre oscuro', d: 'Para tinta o negro.', bg: 'oscuro', svg: () => svgCompacto('oscuro'), f: 'regalale-bitcoin-logotipo-compacto-oscuro', png: 2000 },
  { t: 'Ícono de la web y la app', d: 'Fondo naranja con esquinas redondeadas.', bg: 'cuadros', svg: () => svgApp('naranja', true), f: 'regalale-bitcoin-icono', png: 1024 },
  { t: 'Ícono a sangre', d: 'Cuadrado sin esquinas (para redes y tiendas, que recortan solas).', bg: 'cuadros', svg: () => svgApp('naranja', false), f: 'regalale-bitcoin-icono-cuadrado', png: 1024 },
  { t: 'Isotipo · sobre claro', d: 'Caja naranja.', bg: 'claro', svg: () => svgIso('claro'), f: 'regalale-bitcoin-isotipo-claro', png: 1024 },
  { t: 'Isotipo · sobre naranja', d: 'Caja blanca.', bg: 'naranja', svg: () => svgIso('naranja'), f: 'regalale-bitcoin-isotipo-naranja', png: 1024 },
  { t: 'Isotipo · sobre negro', d: 'Caja naranja, ₿ blanca.', bg: 'negro', svg: () => svgIso('negro'), f: 'regalale-bitcoin-isotipo-negro', png: 1024 },
  { t: 'Moneda ₿', d: 'Elemento de apoyo para ilustraciones.', bg: 'claro', svg: () => svgMoneda(), f: 'regalale-bitcoin-moneda', png: 1024 },
];

function guardar(nombre: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function aPng(svg: string, ancho: number): Promise<Blob> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = ancho;
      cv.height = Math.round((ancho * img.naturalHeight) / img.naturalWidth);
      cv.getContext('2d')?.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob((b) => (b === null ? mal(new Error('png')) : ok(b)), 'image/png');
    };
    img.onerror = () => mal(new Error('svg'));
    img.src = dataUrl(svg);
  });
}

const COLORES: readonly (readonly [string, string, string, string])[] = [
  ['Naranja bitcoin', '#FF8A1F', '#1A1530', 'Fondos, botones, isotipo y BITCOIN en el logo. Nunca texto corrido sobre blanco.'],
  ['Tinta', '#1A1530', '#FFFFFF', 'Texto, bordes, sombras del isotipo.'],
  ['Blanco', '#FFFFFF', '#1A1530', 'Fondo principal; caja sobre naranja.'],
  ['Naranja texto', '#B85300', '#FFFFFF', 'Todo texto naranja sobre claro: el nombre, links, títulos.'],
  ['Sombra naranja', '#B3470A', '#FFFFFF', 'Sombra de la caja sobre negro.'],
  ['Amarillo', '#FFD23F', '#1A1530', 'Confeti, moneda que salta, cintas.'],
  ['Rosa', '#FF5D8F', '#1A1530', 'Confeti, caja abierta, ocasiones.'],
  ['Celeste', '#4CC9F0', '#1A1530', 'Confeti, foco del teclado.'],
];

/** Confeti: [izquierda %, arriba %, ancho, alto, color, giro]. */
const CONFETI: readonly (readonly [number, number, number, number, string, number])[] = [
  [5, 12, 22, 22, '#FFD23F', 0],
  [38, 6, 34, 14, '#FF5D8F', 28],
  [92, 10, 18, 18, '#4CC9F0', 0],
  [70, 84, 30, 12, '#4CC9F0', -35],
  [3, 55, 16, 16, '#FFFFFF', 0],
  [95, 80, 22, 22, '#FFFFFF', 0],
  [82, 45, 32, 13, '#1A1530', -20],
  [58, 14, 16, 16, '#FF5D8F', 0],
  [8, 90, 30, 12, '#FFD23F', 60],
];

function Confeti() {
  return (
    <div class="mk-confeti" aria-hidden="true">
      {CONFETI.map(([x, y, w, h, color, giro], i) => (
        <i key={i} style={{ left: `${x}%`, top: `${y}%`, width: `${w}px`, height: `${h}px`, borderRadius: w === h ? '50%' : `${h / 2}px`, background: color, transform: `rotate(${giro}deg)` }} />
      ))}
    </div>
  );
}

function Capitulo({ n, id, titulo, children }: { n: string; id: string; titulo: string; children: preact.ComponentChildren }) {
  return (
    <section class="mk-capitulo" id={id} aria-labelledby={`mk-${id}`}>
      <div class="mk-cabeza">
        <span class="mk-num">{n}</span>
        <h2 id={`mk-${id}`}>{titulo}</h2>
      </div>
      <div class="mk-cuerpo">{children}</div>
    </section>
  );
}

function Muestra({ fondo, titulo, texto, children }: { fondo: 'claro' | 'naranja' | 'negro' | 'tinta'; titulo: preact.ComponentChildren; texto: preact.ComponentChildren; children: preact.ComponentChildren }) {
  return (
    <figure class="mk-figura">
      <div class={`mk-lamina mk-${fondo}`}>{children}</div>
      <figcaption class="mk-pie">
        <strong>{titulo}</strong>
        <span>{texto}</span>
      </figcaption>
    </figure>
  );
}

export function MediakitPage() {
  const { lang } = useI18n();
  const [estado, setEstado] = useState('');
  useEffect(() => {
    document.title = 'Mediakit · Regalale Bitcoin';
  }, [lang]);

  const bajar = async (it: Descarga, tipo: 'svg' | 'png') => {
    setEstado('');
    try {
      const blob = tipo === 'svg' ? new Blob([it.svg()], { type: 'image/svg+xml' }) : await aPng(it.svg(), it.png);
      guardar(`${it.f}.${tipo}`, blob);
      setEstado(`Listo: ${it.f}.${tipo}`);
    } catch {
      setEstado(`No se pudo descargar ${it.f}.${tipo}. Probá de nuevo.`);
    }
  };

  const reglas: readonly { bien: boolean; fondo: 'claro' | 'naranja'; muestra: preact.ComponentChildren; t: string; d: string }[] = [
    { bien: false, fondo: 'claro', muestra: <Img svg={svgLogo('claro')} alt="" class="mk-regla-logo mk-estirado" />, t: 'No deformar', d: 'Ni estirar ni comprimir. Se escala siempre en proporción.' },
    { bien: false, fondo: 'claro', muestra: <Img svg={svgLogo('claro', ['#1A1530', '#4CC9F0', 'rosa'])} alt="" class="mk-regla-logo" />, t: 'No cambiar los colores', d: 'Solo las tres versiones: claro, naranja y negro.' },
    {
      bien: false,
      fondo: 'claro',
      muestra: (
        <span class="mk-reescrito">
          <Img svg={svgIso('claro')} alt="" />
          Regalale<b>Bitcoins</b>
        </span>
      ),
      t: 'No reescribir las palabras',
      d: 'Ni minúsculas, ni plural, ni otra tipografía.',
    },
    { bien: false, fondo: 'claro', muestra: <Img svg={svgIso('claro', 14)} alt="" class="mk-regla-iso" />, t: 'No girar la caja de otra forma', d: 'El giro es siempre −10°.' },
    { bien: false, fondo: 'claro', muestra: <span class="mk-b-tipografia">₿</span>, t: 'No usar la ₿ de una tipografía', d: 'Siempre el trazo propio de la marca.' },
    { bien: false, fondo: 'naranja', muestra: <Img svg={svgLogo('claro')} alt="" class="mk-regla-logo" />, t: 'No usar la versión clara sobre naranja', d: 'La caja naranja se pierde: sobre naranja va la caja blanca.' },
    { bien: true, fondo: 'naranja', muestra: <Img svg={svgLogo('naranja')} alt="" class="mk-regla-logo" />, t: 'Sobre naranja, así', d: 'Caja blanca con ₿ naranja y palabras en tinta.' },
    { bien: true, fondo: 'claro', muestra: <Img svg={svgLogo('claro')} alt="" class="mk-regla-logo" />, t: 'Sobre claro, así', d: 'Con aire alrededor y sin otros elementos encima.' },
  ];

  return (
    <div class="pagina pagina-home pagina-mediakit" lang="es">
      <section class="porque-hero mk-portada">
        <Confeti />
        <div class="hero-contenido">
          <SiteHeader onOrange />
          <div class="porque-hero-texto">
            <p class="kicker kicker-tinta">Mediakit · Manual de identidad v1 · octubre 2026</p>
            <Img svg={svgLogo('naranja')} alt="Regalale Bitcoin" class="mk-portada-logo" />
            <p class="bajada">Cómo se dibuja, se escribe y se usa la marca de regalalebitcoin.com, con los logos para descargar.</p>
            <a class="boton boton-primario mk-ir" href="#descargas">
              Descargar logos (SVG y PNG) ↓
            </a>
          </div>
        </div>
      </section>

      <main class="home-secciones mk">
        <section class="mk-prensa" aria-labelledby="mk-prensa">
          <h2 id="mk-prensa">Prensa</h2>
          <p>
            Para notas, entrevistas, datos o imágenes en otro formato, escribinos a <a href={`mailto:${PRENSA}`}>{PRENSA}</a>.
          </p>
        </section>

        <Capitulo n="01" id="marca" titulo="La marca">
          <p>
            Un regalo que, al abrirlo, es tuyo de verdad. La marca combina una <strong>caja de regalo con moño</strong> (lo que se da) con la <strong>₿</strong> (lo que hay adentro), en la línea visual Confeti:
            naranja bitcoin, tinta casi negra y acentos de fiesta.
          </p>
          <div class="mk-grilla-2">
            <Muestra fondo="claro" titulo="Logotipo principal" texto="Isotipo + palabras. Sobre blanco o papel.">
              <Img svg={svgLogo('claro')} alt="Logotipo sobre fondo claro" class="mk-logo" />
            </Muestra>
            <Muestra fondo="naranja" titulo="Logotipo sobre naranja" texto="Caja blanca con ₿ naranja; BITCOIN en blanco.">
              <Img svg={svgLogo('naranja')} alt="Logotipo sobre naranja" class="mk-logo" />
            </Muestra>
          </div>
        </Capitulo>

        <Capitulo n="02" id="isotipo" titulo="Isotipo">
          <p>
            La caja va siempre girada −10°, con el moño arriba y una sombra desplazada abajo a la derecha. La ₿ es un trazo propio con puntas redondeadas (las tipografías de la marca no traen el carácter ₿,
            y la del sistema lo muestra con serifa). Hay tres versiones según el fondo; no se mezclan colores entre ellas.
          </p>
          <div class="mk-grilla">
            <Muestra fondo="claro" titulo="Sobre claro" texto="Caja naranja, borde, sombra y ₿ en tinta.">
              <Img svg={svgIso('claro')} alt="Isotipo sobre claro" class="mk-iso" />
            </Muestra>
            <Muestra fondo="naranja" titulo="Sobre naranja" texto="Caja blanca, borde y sombra en tinta, ₿ naranja.">
              <Img svg={svgIso('naranja')} alt="Isotipo sobre naranja" class="mk-iso" />
            </Muestra>
            <Muestra fondo="negro" titulo="Sobre negro" texto="Caja naranja, sombra #B3470A, ₿ blanca.">
              <Img svg={svgIso('negro')} alt="Isotipo sobre negro" class="mk-iso" />
            </Muestra>
          </div>
        </Capitulo>

        <Capitulo n="03" id="icono" titulo="Ícono de la web y de la app">
          <p>
            <strong>El ícono oficial es el de fondo naranja</strong> (decisión del 19/10/2026): la versión «sobre naranja» del isotipo dentro de un cuadrado #FF8A1F. Reemplaza al de fondo negro en favicon,
            ícono del celular y app instalada.
          </p>
          <div class="mk-grilla">
            <Muestra fondo="claro" titulo="Oficial · fondo naranja" texto="Favicon, apple-touch, PWA 192/512 y maskable.">
              <Img svg={svgApp('naranja', true)} alt="Ícono con fondo naranja" class="mk-app" />
            </Muestra>
            <Muestra fondo="claro" titulo="Anterior · fondo negro" texto="Deja de usarse como ícono. El isotipo sobre negro sigue valiendo para piezas oscuras.">
              <Img svg={svgApp('negro', true)} alt="Ícono anterior con fondo negro" class="mk-app" />
            </Muestra>
            <Muestra fondo="claro" titulo="Tamaños chicos" texto="64, 32 y 16 px: la caja blanca se lee incluso como favicon.">
              <span class="mk-tamanos">
                <Img svg={svgApp('naranja', true)} alt="64 px" class="mk-t64" />
                <Img svg={svgApp('naranja', true)} alt="32 px" class="mk-t32" />
                <Img svg={svgApp('naranja', true)} alt="16 px" class="mk-t16" />
              </span>
            </Muestra>
          </div>
          <ul class="mk-lista">
            <li>iOS no acepta transparencia: el naranja va a sangre y el sistema redondea las esquinas.</li>
            <li>Android (maskable) recorta en círculo: la caja ocupa el 72 % del lado para quedar en la zona segura.</li>
            <li>
              El color de la barra del navegador (<code>theme-color</code>) es #FF8A1F.
            </li>
            <li>Nombre debajo del ícono instalado: «Regalale Bitcoin», completo (en pantallas chicas el sistema puede cortarlo con puntos suspensivos).</li>
          </ul>
        </Capitulo>

        <Capitulo n="04" id="logotipo" titulo="Logotipo">
          <p>
            Las palabras van en mayúsculas, en Bricolage Grotesque: <strong>REGALALE</strong> en peso 600 y <strong>BITCOIN</strong> en 800, pegadas, sin espacio. En mayúsculas el acento no se escribe, así que
            se lee igual como regalale, regálale, regalá o regala (sirve para vos y para tú). Para lectores de pantalla, el nombre es «Regalale Bitcoin».
          </p>
          <div class="mk-grilla-2">
            <Muestra fondo="tinta" titulo="Sobre fondo oscuro" texto="Isotipo versión negro; REGALALE en blanco, BITCOIN en naranja.">
              <Img svg={svgLogo('oscuro')} alt="Logotipo sobre tinta" class="mk-logo" />
            </Muestra>
            <Muestra fondo="claro" titulo="Versión reducida" texto="En pantallas de menos de 300 px queda solo la caja.">
              <span class="mk-tamanos">
                <Img svg={svgLogo('claro')} alt="Logotipo chico" class="mk-logo-chico" />
                <Img svg={svgIso('claro')} alt="Solo isotipo" class="mk-iso-chico" />
              </span>
            </Muestra>
          </div>
          <h3>Versión compacta</h3>
          <p class="mk-suave">
            La caja a la izquierda y REGALALE / BITCOIN en dos líneas. El texto va del borde de arriba de la caja al borde de abajo de la sombra; el moño y la punta de abajo sobresalen (líneas celestes). Para
            avatares, sellos, la contratapa de la tarjeta. La horizontal sigue siendo la principal.
          </p>
          <div class="mk-grilla">
            <Muestra fondo="claro" titulo="Sobre claro" texto="">
              <Img svg={svgCompacto('claro')} alt="Logotipo compacto sobre claro" class="mk-compacto" />
            </Muestra>
            <Muestra fondo="naranja" titulo="Sobre naranja" texto="">
              <Img svg={svgCompacto('naranja')} alt="Logotipo compacto sobre naranja" class="mk-compacto" />
            </Muestra>
            <Muestra fondo="tinta" titulo="Sobre oscuro" texto="">
              <Img svg={svgCompacto('oscuro')} alt="Logotipo compacto sobre oscuro" class="mk-compacto" />
            </Muestra>
            <Muestra fondo="claro" titulo="Construcción" texto="Líneas guía: el alto del texto.">
              <Img svg={svgCompacto('claro', true)} alt="Logotipo compacto con líneas guía" class="mk-compacto" />
            </Muestra>
          </div>
          <div class="mk-grilla-2">
            <Muestra fondo="claro" titulo="Espacio libre" texto="Alrededor, como mínimo, la mitad del ancho de la caja. Ningún texto, borde ni imagen entra ahí.">
              <span class="mk-resguardo">
                <Img svg={svgLogo('claro')} alt="Logotipo con su espacio libre" class="mk-logo-chico" />
              </span>
            </Muestra>
            <Muestra fondo="claro" titulo="Tamaños mínimos" texto="Por debajo, se usa el isotipo solo.">
              <span class="mk-cotas">
                <span>Logotipo completo: mínimo 120 px de ancho (en impresión, 30 mm)</span>
                <span>Logotipo compacto: mínimo 80 px de ancho (en impresión, 20 mm)</span>
                <span>Solo isotipo: mínimo 16 px (en impresión, 6 mm)</span>
                <span>Proporción de la caja: 1,45 × 1,57 em del cuerpo del texto</span>
              </span>
            </Muestra>
          </div>
        </Capitulo>

        <Capitulo n="05" id="nombre" titulo="El nombre en un texto">
          <p>
            Fuera del logotipo, el nombre se escribe <strong>separado, sin itálica ni negrita</strong> (el color es el único énfasis), y el color depende del fondo: <strong>naranja sobre claro</strong>,{' '}
            <strong>blanco sobre oscuro</strong>, <strong>blanco y en negrita sobre naranja</strong>. Solo donde no se puede usar color, va <strong>en itálica</strong>. Donde no hay ni color ni itálica, a
            secas. El dominio va en minúscula y junto: regalalebitcoin.com.
          </p>
          <p>
            <strong>El acento sigue al trato.</strong> Con vos: <span class="mk-nombre">Regalale Bitcoin</span> (regalá + le). Con tú: <span class="mk-nombre">Regálale Bitcoin</span> (regala + le). En
            mayúsculas, como en el logotipo, nunca lleva acento. Si no se sabe el trato de quien lee (metadatos, imagen para compartir), va sin acento, que es la versión con vos. En inglés, portugués e
            italiano, «Regalale Bitcoin».
          </p>
          <div class="mk-grilla-2">
            <div class="mk-frase">
              <span class="mk-etiqueta">En un título grande · #B85300</span>
              <span class="mk-nombre mk-nombre-titulo">Regalale Bitcoin</span>
            </div>
            <div class="mk-frase">
              <span class="mk-etiqueta">En texto corrido · #B85300</span>
              <p>
                Con <span class="mk-nombre">Regalale Bitcoin</span> lo armás en dos minutos y le llega por WhatsApp o por mail.
              </p>
            </div>
            <div class="mk-frase mk-en-naranja">
              <span class="mk-etiqueta">Sobre naranja · blanco, en negrita</span>
              <p>
                Abrí tu regalo de <span class="mk-nombre">Regalale Bitcoin</span>.
              </p>
            </div>
            <div class="mk-frase mk-en-oscuro">
              <span class="mk-etiqueta">Sobre oscuro · blanco</span>
              <p>
                Abrí tu regalo de <span class="mk-nombre">Regalale Bitcoin</span>.
              </p>
            </div>
            <div class="mk-frase">
              <span class="mk-etiqueta">Sin color · itálica</span>
              <p>
                Mail en texto plano, WhatsApp, impresión en blanco y negro: <em>Regalale Bitcoin</em> (en WhatsApp, <code>_Regalale Bitcoin_</code>).
              </p>
            </div>
            <div class="mk-frase">
              <span class="mk-etiqueta">Sin color ni itálica</span>
              <p>Asunto de mail, pestaña, notificaciones y metadatos: «Regalale Bitcoin» a secas.</p>
            </div>
          </div>
          <div class="mk-tabla">
            <table>
              <thead>
                <tr>
                  <th>Así</th>
                  <th>Así no</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="mk-si">Regalale Bitcoin (vos) · Regálale Bitcoin (tú)</td>
                  <td>
                    <s>RegalaleBitcoin</s> · <s>RegalaleBitcoins</s> · <s>Regálale Bitcoin</s> en una página con vos
                  </td>
                </tr>
                <tr>
                  <td class="mk-si">regalalebitcoin.com</td>
                  <td>
                    <s>RegalaleBitcoin.com</s> · <s>regalalebitcoins.com</s> (solo redirige)
                  </td>
                </tr>
                <tr>
                  <td class="mk-si">REGALALEBITCOIN (en el logotipo)</td>
                  <td>
                    <s>REGALALE BITCOIN</s> con espacio, o el logotipo en minúsculas
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Capitulo>

        <Capitulo n="06" id="color" titulo="Color">
          <p>El naranja y la tinta son la marca; amarillo, rosa y celeste son la fiesta (confeti, chips de ocasión, ilustraciones), nunca el logotipo.</p>
          <div class="mk-colores">
            {COLORES.map(([nombre, hex, texto, uso]) => (
              <div class="mk-color" key={hex}>
                <div class="mk-chip" style={{ background: hex, color: texto }}>
                  Aa
                </div>
                <div class="mk-datos">
                  <strong>{nombre}</strong>
                  <code>{hex}</code>
                  <span>{uso}</span>
                </div>
              </div>
            ))}
          </div>
          <div class="mk-tabla">
            <table>
              <thead>
                <tr>
                  <th>Combinación</th>
                  <th>Contraste</th>
                  <th>Uso</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['#FFFFFF', '#1A1530', 'tinta sobre blanco', '17,6 : 1', 'Todo', true],
                    ['#FF8A1F', '#1A1530', 'tinta sobre naranja', '7,5 : 1', 'Todo', true],
                    ['#FFFFFF', '#B85300', '#B85300 sobre blanco', '4,9 : 1', 'Texto corrido', true],
                    ['#FFFFFF', '#FF8A1F', 'naranja sobre blanco', '2,4 : 1', 'Nunca para texto', false],
                    ['#FF8A1F', '#FFFFFF', 'blanco sobre naranja', '2,4 : 1', 'Nunca para texto', false],
                  ] as const
                ).map(([fondo, texto, nombre, contraste, uso, ok]) => (
                  <tr key={nombre}>
                    <td>
                      <span class="mk-par" style={{ background: fondo, color: texto }}>
                        Aa
                      </span>{' '}
                      {nombre}
                    </td>
                    <td>{contraste}</td>
                    <td class={ok ? 'mk-si' : 'mk-no'}>{uso}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="mk-suave">El nombre de la marca va en blanco sobre naranja aunque el contraste sea bajo (decisión del 19/10/2026), siempre en negrita.</p>
        </Capitulo>

        <Capitulo n="07" id="tipografia" titulo="Tipografía">
          <div class="mk-tipos">
            <div class="mk-tipo">
              <span class="mk-etiqueta">Títulos y logotipo</span>
              <span class="mk-muestra-tipo mk-bricolage">Bricolage</span>
              <p>
                <strong>Bricolage Grotesque</strong> 800 en títulos; 600 en «REGALALE». Interlineado ajustado (0,95–1,1).
              </p>
            </div>
            <div class="mk-tipo">
              <span class="mk-etiqueta">Texto e interfaz</span>
              <span class="mk-muestra-tipo mk-dmsans">DM Sans</span>
              <p>
                <strong>DM Sans</strong> 400/500 para leer, 700 para botones y énfasis.
              </p>
            </div>
            <div class="mk-tipo">
              <span class="mk-etiqueta">Toque manuscrito</span>
              <span class="mk-muestra-tipo mk-caveat">¡Feliz cumple!</span>
              <p>
                <strong>Caveat</strong> 700, solo dentro de las tarjetas ilustradas (estilo «Dibujo a mano»). Nunca en la interfaz.
              </p>
            </div>
          </div>
          <p class="mk-suave">Las tres son de Google Fonts (licencia OFL). En el sitio van autoalojadas.</p>
        </Capitulo>

        <Capitulo n="08" id="elementos" titulo="Elementos de apoyo">
          <div class="mk-grilla">
            <Muestra fondo="claro" titulo="Moneda ₿" texto="Para ilustraciones, el abanico de las 21 razones y la caja abierta. En amarillo cuando salta de la caja.">
              <Img svg={svgMoneda()} alt="Moneda ₿" class="mk-moneda" />
            </Muestra>
            <Muestra fondo="naranja" titulo="Confeti" texto="Círculos y tiras redondeadas en amarillo, rosa, celeste, blanco y tinta, con giros sueltos. Sobre naranja, poco y en los bordes.">
              <Confeti />
            </Muestra>
            <Muestra fondo="claro" titulo="Caja abierta" texto="Ilustración del momento de abrir el regalo (portada, tarjeta, imagen para compartir). No reemplaza al isotipo.">
              <Img svg={CAJA_ABIERTA} alt="Caja abierta con moneda" class="mk-caja-abierta" />
            </Muestra>
          </div>
        </Capitulo>

        <Capitulo n="09" id="usos" titulo="Usos incorrectos">
          <div class="mk-reglas">
            {reglas.map((r) => (
              <div class={`mk-regla ${r.bien ? 'mk-bien' : 'mk-mal'}`} key={r.t}>
                <div class={`mk-lamina mk-${r.fondo}`}>{r.muestra}</div>
                <div class="mk-regla-txt">
                  <span class="mk-veredicto">{r.bien ? '✓ Sí' : '✕ No'}</span>
                  <strong>{r.t}</strong>
                  <span>{r.d}</span>
                </div>
              </div>
            ))}
          </div>
        </Capitulo>

        <Capitulo n="10" id="voz" titulo="Cómo habla la marca">
          <p>Castellano rioplatense, con vos (tú para el resto de los países), cercano y sin jerga. La marca no promete precio: regala bitcoin, no una inversión.</p>
          <div class="mk-voz">
            {(
              [
                ['Decimos', 'Tengo un regalo para abrir', 'reclamar'],
                ['Decimos', 'Costo por servicio', 'comisión'],
                ['Decimos', 'Es tuyo de verdad · sin custodia', 'lo guardamos por vos'],
                ['Nunca', 'Promesas de precio', 'va a valer más · pequeña fortuna'],
              ] as const
            ).map(([e, si, no]) => (
              <div key={si}>
                <span class="mk-etiqueta">{e}</span>
                <strong>{si}</strong>
                <s>{no}</s>
              </div>
            ))}
          </div>
        </Capitulo>

        <Capitulo n="11" id="descargas" titulo="Descargas">
          <p>SVG para imprenta, diseño y web (las letras están convertidas a curvas, no hace falta tener la tipografía). PNG con fondo transparente para usar rápido; el ícono va con su fondo naranja.</p>
          <div class="mk-descargas">
            {DESCARGAS.map((it) => (
              <div class="mk-descarga" key={it.f}>
                <div class={`mk-vista mk-vista-${it.bg}`}>
                  <Img svg={it.svg()} alt="" />
                </div>
                <div class="mk-info">
                  <strong>{it.t}</strong>
                  <span>{it.d}</span>
                  <div class="mk-botones">
                    <button type="button" class="mk-boton-dl" onClick={() => void bajar(it, 'svg')}>
                      SVG
                    </button>
                    <button type="button" class="mk-boton-dl" onClick={() => void bajar(it, 'png')}>
                      PNG {it.png} px
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p class="mk-suave" aria-live="polite">
            {estado}
          </p>
        </Capitulo>
      </main>
      <SiteFooter />
    </div>
  );
}
