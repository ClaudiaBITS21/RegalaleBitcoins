import { useEffect, useState } from 'preact/hooks';
import { api, type Products } from './api.ts';
import { formatSatsShort, formatUsdExact, satsToUsd } from './format.ts';
import type { Key } from './i18n/index.ts';
import { ConMarca, SiteFooter, SiteHeader, useI18n } from './ui.tsx';

// Página "Precios" (handoff 2026-10-19, «cobro y créditos»). Precios en sats (decisión de Rodolfo,
// 20/10: lo que se paga no depende de la cotización) con su valor de hoy en dólares debajo. Es un costo por servicio que se paga aparte: nunca sale del regalo. Mientras
// el cobro no esté activo, un aviso lo dice. «lista_otras» no se muestra sola: va el pack con 10
// regalos por el mismo precio.

/** Una celda de la tabla: incluye (✓), no incluye (—), una cantidad o un texto. */
type Celda = 'si' | 'no' | number | readonly [Key, Record<string, number>?];

/** Qué incluye un producto. Los valores y límites pueden cambiar (Rodolfo, 20/10): salen de la API. */
interface Contenido {
  readonly sats: bigint;
  /** null = regalos libres. */
  readonly regalos: number | null;
  readonly listas: number;
  readonly plan: boolean;
  /** Vigencia del plan; null = para siempre. */
  readonly dias: number | null;
  /** Cuántos se venden; null = sin límite. */
  readonly cupo: number | null;
  /** Si trae la salutación automática (Satoshi no, 21/10). */
  readonly saludo: boolean;
  /** Imagen con IA y tarjeta imprimible: lo gratis las trae si el admin las incluye (23/10). */
  readonly ia: boolean;
  readonly tarjeta: boolean;
}

interface Producto {
  /** Clave del nombre en i18n («precios.<id>.n»). */
  readonly id: 'bienvenida' | 'pack10' | 'listaOtras' | 'anual' | 'fundador';
  /** Código del producto en la API (el que se compra). */
  readonly codigo: string;
  /** Lo que incluye mientras no llega de /api/productos (los planes de Rodolfo del 20/10). */
  readonly base: Contenido;
}

// Primero lo que trae todo, también lo gratis, para que se vea lo que ya incluye (Rodolfo, 21/10);
// después lo que suman los planes.
const FILAS: readonly Key[] = [
  'precios.fila.regalos',
  'precios.fila.listas',
  'precios.fila.estilos',
  'precios.fila.panel',
  'precios.fila.recordatorio',
  'precios.fila.recupero',
  'precios.fila.ia',
  'precios.fila.tarjeta',
  'precios.fila.saludo',
  'precios.fila.vigencia',
];

// Una sola tabla comparativa: la bienvenida gratis y los cuatro planes (Satoshi, Node, Hodler y
// Genesis). Hodler (código «anual») no vence desde el 21/10; Satoshi no trae la salutación. Lo gratis
// trae lo que el admin le incluya (23/10); de entrada, sin imagen con IA, tarjeta imprimible (solo
// la vista previa) ni salutación automática. Los planes sí (Rodolfo, 20/10).
const PRODUCTOS: readonly Producto[] = [
  { id: 'bienvenida', codigo: 'bienvenida', base: { sats: 0n, regalos: 5, listas: 0, plan: false, dias: null, cupo: null, saludo: false, ia: false, tarjeta: false } },
  { id: 'pack10', codigo: 'pack10', base: { sats: 10_500n, regalos: 10, listas: 0, plan: false, dias: null, cupo: null, saludo: false, ia: true, tarjeta: true } },
  { id: 'listaOtras', codigo: 'pack10_lista', base: { sats: 21_000n, regalos: 10, listas: 1, plan: false, dias: null, cupo: null, saludo: true, ia: true, tarjeta: true } },
  { id: 'anual', codigo: 'anual', base: { sats: 42_000n, regalos: 30, listas: 3, plan: false, dias: null, cupo: null, saludo: true, ia: true, tarjeta: true } },
  { id: 'fundador', codigo: 'fundador', base: { sats: 210_000n, regalos: null, listas: 10, plan: true, dias: null, cupo: 21, saludo: true, ia: true, tarjeta: true } },
];

function contenido(p: Producto, vivos: Products | null): Contenido {
  const v = vivos?.productos.find((x) => x.codigo === p.codigo);
  // Sin precio en sats (API anterior), los de la tabla.
  if (v === undefined || typeof v.precioSats !== 'string') return p.base;
  return {
    sats: BigInt(v.precioSats),
    regalos: v.regalosLibres ? null : v.regalos,
    listas: v.listasCumple + v.listasOtras,
    plan: v.plan !== null,
    dias: v.dias,
    cupo: v.cupo,
    // API anterior (sin el dato): el de la tabla.
    saludo: v.saludo ?? p.base.saludo,
    ia: v.ia ?? p.base.ia,
    tarjeta: v.tarjeta ?? p.base.tarjeta,
  };
}

function celdas(c: Contenido): readonly Celda[] {
  // Lo que no vence dice «No vencen» en todos, también Genesis (21/10).
  const vigencia: Celda = !c.plan || c.dias === null
    ? ['precios.v.noVencen']
    : c.dias % 365 === 0
        ? c.dias === 365
          ? ['precios.v.unAnio']
          : ['precios.v.anios', { n: c.dias / 365 }]
        : ['precios.v.dias', { n: c.dias }];
  return [
    c.regalos === null ? ['precios.v.libres'] : c.regalos,
    c.listas === 0 ? 'no' : c.listas,
    'si',
    'si',
    'si',
    'si',
    c.ia ? 'si' : 'no',
    c.tarjeta ? 'si' : 'no',
    c.saludo ? 'si' : 'no',
    vigencia,
  ];
}

/**
 * Lo que suma un pack, en una frase (Claudia, 25/10): con lo gratis completo, la tarjeta del
 * celular dice esto en grande en vez de una lista larga que solo cambia en una fila.
 */
function suma(c: Contenido, lang: string): readonly [Key, Record<string, string>?] | null {
  const f = (x: number) => new Intl.NumberFormat(lang).format(x);
  const l = { l: f(c.listas) };
  if (c.regalos === null) return c.listas === 0 ? ['precios.suma.libres'] : c.listas === 1 ? ['precios.suma.libresLista'] : ['precios.suma.libresListas', l];
  if (c.regalos === 0) return c.listas === 0 ? null : c.listas === 1 ? ['precios.suma.lista'] : ['precios.suma.listas', l];
  const n = { n: f(c.regalos), ...l };
  return c.listas === 0 ? ['precios.suma.regalos', n] : c.listas === 1 ? ['precios.suma.regalosLista', n] : ['precios.suma.regalosListas', n];
}

function Valor({ c }: { c: Celda }) {
  const { t, lang } = useI18n();
  if (c === 'si')
    return (
      <span class="precio-si" role="img" aria-label={t('precios.si')}>
        ✓
      </span>
    );
  if (c === 'no')
    return (
      <span class="precio-no" role="img" aria-label={t('precios.no')}>
        —
      </span>
    );
  if (typeof c === 'number') return <strong>{new Intl.NumberFormat(lang).format(c)}</strong>;
  return <>{t(c[0], c[1])}</>;
}

export function PricingPage({ testnet }: { testnet: boolean }) {
  const { t, lang, trato } = useI18n();
  const [usdPorBtc, setUsdPorBtc] = useState<number | null>(null);
  const [vivos, setVivos] = useState<Products | null>(null);

  useEffect(() => {
    document.title = `${t('precios.kicker')} · Regalale Bitcoin`;
  }, [lang, trato]);

  useEffect(() => {
    api
      .price()
      .then((p) => setUsdPorBtc(p.usdPorBtc))
      .catch(() => setUsdPorBtc(null));
    api
      .products()
      .then(setVivos)
      .catch(() => setVivos(null));
  }, []);
  // Mientras el cobro no esté activo (o no se sepa), la página avisa que hoy regalar es gratis.
  const cobroActivo = vivos?.cobroActivo === true;

  return (
    <div class="pagina pagina-home pagina-precios">
      {testnet && (
        <p class="aviso-red" role="note">
          {t('red.prueba')}
        </p>
      )}
      <section class="porque-hero">
        <div class="hero-contenido">
          <SiteHeader onOrange />
          <div class="porque-hero-texto">
            <p class="kicker kicker-tinta">{t('precios.kicker')}</p>
            <h1>{t('precios.titulo')}</h1>
            <p class="bajada">{t('precios.bajada')}</p>
          </div>
        </div>
      </section>

      <main class="home-secciones">
        <section class="seccion" aria-label={t('precios.kicker')}>
          {!cobroActivo && (
            <p class="precios-aviso" role="note">
              {t('precios.aviso')}
            </p>
          )}
          <div class="precios-caja" role="region" aria-label={t('precios.kicker')} tabindex={0}>
            <table class="precios-tabla">
              <thead>
                <tr>
                  <td />
                  {PRODUCTOS.map((p) => {
                    const { sats } = contenido(p, vivos);
                    return (
                      <th scope="col" key={p.id} class={p.id === 'listaOtras' ? 'precios-destacado' : undefined}>
                        <span class="precio-nombre">{t(`precios.${p.id}.n` as Key)}</span>
                        <span class="precio-monto">{sats === 0n ? t('precios.gratis') : formatSatsShort(sats, lang)}</span>
                        {sats > 0n && usdPorBtc !== null && <span class="precio-sats">{t('precios.usdHoy', { usd: formatUsdExact(satsToUsd(sats, usdPorBtc), lang) })}</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {FILAS.map((fila, i) => (
                  <tr key={fila}>
                    <th scope="row">{t(fila)}</th>
                    {PRODUCTOS.map((p) => {
                      const c = celdas(contenido(p, vivos))[i] as Celda;
                      return (
                        <td key={p.id} class={p.id === 'listaOtras' ? 'precios-destacado' : undefined}>
                          <Valor c={c} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  {PRODUCTOS.map((p) => {
                    const { sats, cupo } = contenido(p, vivos);
                    const agotado = p.id === 'fundador' && vivos !== null && vivos.fundadoresQuedan <= 0;
                    return (
                      <td key={p.id} class={p.id === 'listaOtras' ? 'precios-destacado' : undefined}>
                        {/* Se puede comprar en cuanto hay llave de cobro, aunque el cobro no esté activo (compra de prueba). */}
                        {sats > 0n && vivos?.seVende === true && !agotado && (
                          <a class="boton boton-contorno precio-comprar" href={`/comprar?producto=${p.codigo}`}>
                            {t('precios.comprar')}
                          </a>
                        )}
                        {/* Los lugares que quedan de Genesis, debajo del botón (Rodolfo, 21/10). */}
                        {p.id === 'fundador' && cupo !== null && vivos !== null && (
                          <span class="precio-sats">{agotado ? t('comprar.agotado') : t('precios.quedanFundadores', { n: vivos.fundadoresQuedan })}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
          {/* En el celular, una tarjeta por plan en vez de la tabla ancha (Rodolfo, 21/10). */}
          <ul class="precios-tarjetas">
            {PRODUCTOS.map((p, n) => {
              const ct = contenido(p, vivos);
              const agotado = p.id === 'fundador' && vivos !== null && vivos.fundadoresQuedan <= 0;
              const cs = celdas(ct);
              // Cada plan pago lista todo lo que trae por encima de lo gratis (Rodolfo, 21/10):
              // «Todo lo gratis, y además: …», sin repetir lo que ya trae la bienvenida.
              const gratis = PRODUCTOS[0] as Producto;
              const prevCs = n === 0 ? null : celdas(contenido(gratis, vivos));
              const filas = FILAS.map((fila, i) => ({ fila, c: cs[i] as Celda })).filter(({ c }, i) => prevCs === null || JSON.stringify(c) !== JSON.stringify(prevCs[i]));
              // En los packs, regalos y listas van en la frase de arriba; abajo, solo lo que agrega aparte.
              const frase = n === 0 ? null : suma(ct, lang);
              const resto = frase === null ? filas : filas.filter(({ fila }) => fila !== 'precios.fila.regalos' && fila !== 'precios.fila.listas');
              // Lo que trae lo gratis y este pack no (Satoshi, sin salutación) no es un «además»: va aparte.
              const extras = frase === null ? resto : resto.filter(({ c }) => c !== 'no');
              const falta = frase === null ? [] : resto.filter(({ c }) => c === 'no').map(({ fila }) => t(fila).replace(/^./, (x) => x.toLowerCase()));
              return (
                <li key={p.id} class={`precio-tarjeta${p.id === 'listaOtras' ? ' precios-destacado' : ''}`}>
                  <div class="precio-tarjeta-cabeza">
                    <span class="precio-nombre">{t(`precios.${p.id}.n` as Key)}</span>
                    <span class="precio-monto">{ct.sats === 0n ? t('precios.gratis') : formatSatsShort(ct.sats, lang)}</span>
                    {ct.sats > 0n && usdPorBtc !== null && <span class="precio-sats">{t('precios.usdHoy', { usd: formatUsdExact(satsToUsd(ct.sats, usdPorBtc), lang) })}</span>}
                  </div>
                  {frase !== null && <p class="precio-tarjeta-suma">{t(frase[0], frase[1])}</p>}
                  {n > 0 && extras.length > 0 && <p class="precio-tarjeta-base">{t(frase === null ? 'precios.todoLoGratis' : 'precios.suma.ademas')}</p>}
                  <dl class="precio-tarjeta-filas">
                    {extras.map(({ fila, c }) => (
                      <div key={fila} class={c === 'no' ? 'fila-no' : undefined}>
                        <dt>{t(fila)}</dt>
                        <dd>
                          <Valor c={c} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {falta.length > 0 && <p class="precio-tarjeta-falta">{t('precios.suma.noIncluye', { que: falta.join(', ') })}</p>}
                  {ct.sats > 0n && vivos?.seVende === true && !agotado && (
                    <a class="boton boton-contorno precio-comprar" href={`/comprar?producto=${p.codigo}`}>
                      {t('precios.comprar')}
                    </a>
                  )}
                  {/* Los lugares que quedan de Genesis, solo debajo del botón (Rodolfo, 21/10). */}
                  {p.id === 'fundador' && ct.cupo !== null && vivos !== null && (
                    <span class="precio-sats precio-quedan">{agotado ? t('comprar.agotado') : t('precios.quedanFundadores', { n: vivos.fundadoresQuedan })}</span>
                  )}
                </li>
              );
            })}
          </ul>
          <p class="texto-suave precios-nota">{t('precios.cotizacion')}</p>
        </section>

        <section class="seccion precios-como" aria-labelledby="precios-como">
          <h2 id="precios-como">{t('precios.como.titulo')}</h2>
          <ul>
            {(['precios.como.1', 'precios.como.2', 'precios.como.3', 'precios.como.4'] as const).map((k) => (
              <li key={k}>
                <ConMarca text={t(k)} />
              </li>
            ))}
          </ul>
        </section>

        {/* Botón de arrepentimiento al final de Precios (Rodolfo, 20/10); también va en el pie legal. */}
        <section class="seccion precios-arrepentimiento" aria-labelledby="precios-arrepentimiento">
          <h2 id="precios-arrepentimiento">{t('pie.arrepentimiento')}</h2>
          <p>{t('precios.arrepentimiento')}</p>
          <a class="boton boton-contorno" href="/arrepentimiento">
            {t('pie.arrepentimiento')}
          </a>
        </section>

        <div class="comparativa-cierre">
          <a class="boton boton-primario boton-grande" href="/regalar">
            {t('precios.cta')} →
          </a>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
