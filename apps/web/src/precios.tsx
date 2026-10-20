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
}

interface Producto {
  /** Clave del nombre en i18n («precios.<id>.n»). */
  readonly id: 'bienvenida' | 'pack10' | 'listaOtras' | 'anual' | 'fundador';
  /** Código del producto en la API (el que se compra). */
  readonly codigo: string;
  /** Lo que incluye mientras no llega de /api/productos (los planes de Rodolfo del 20/10). */
  readonly base: Contenido;
}

const FILAS: readonly Key[] = ['precios.fila.regalos', 'precios.fila.listas', 'precios.fila.ia', 'precios.fila.tarjeta', 'precios.fila.saludo', 'precios.fila.vigencia'];

// Una sola tabla comparativa: la bienvenida gratis y los cuatro planes (Satoshi, Node, Timechain y
// Genesis). Lo gratis no trae imagen con IA, tarjeta imprimible (solo la vista previa) ni la
// salutación automática; los planes sí (Rodolfo, 20/10).
const PRODUCTOS: readonly Producto[] = [
  { id: 'bienvenida', codigo: 'bienvenida', base: { sats: 0n, regalos: 5, listas: 0, plan: false, dias: null, cupo: null } },
  { id: 'pack10', codigo: 'pack10', base: { sats: 10_500n, regalos: 10, listas: 0, plan: false, dias: null, cupo: null } },
  { id: 'listaOtras', codigo: 'pack10_lista', base: { sats: 21_000n, regalos: 10, listas: 1, plan: false, dias: null, cupo: null } },
  { id: 'anual', codigo: 'anual', base: { sats: 42_000n, regalos: 30, listas: 3, plan: true, dias: 365, cupo: null } },
  { id: 'fundador', codigo: 'fundador', base: { sats: 210_000n, regalos: null, listas: 10, plan: true, dias: null, cupo: 21 } },
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
  };
}

function celdas(c: Contenido): readonly Celda[] {
  const vigencia: Celda = !c.plan
    ? ['precios.v.noVencen']
    : c.dias === null
      ? ['precios.v.siempre']
      : c.dias % 365 === 0
        ? c.dias === 365
          ? ['precios.v.unAnio']
          : ['precios.v.anios', { n: c.dias / 365 }]
        : ['precios.v.dias', { n: c.dias }];
  const gratis = c.sats === 0n;
  return [
    c.regalos === null ? ['precios.v.libres'] : c.regalos,
    c.listas === 0 ? 'no' : c.listas,
    gratis ? 'no' : 'si',
    gratis ? ['precios.v.vistaPrevia'] : 'si',
    gratis ? 'no' : 'si',
    vigencia,
  ];
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
  const numero = (n: number) => new Intl.NumberFormat(lang).format(n);

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
                    const { sats, cupo } = contenido(p, vivos);
                    return (
                      <th scope="col" key={p.id} class={p.id === 'listaOtras' ? 'precios-destacado' : undefined}>
                        <span class="precio-nombre">{t(`precios.${p.id}.n` as Key)}</span>
                        {cupo !== null && <span class="precio-cupo">{t('precios.soloN', { n: numero(cupo) })}</span>}
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
                          {c === 'si' ? (
                            <span class="precio-si" role="img" aria-label={t('precios.si')}>
                              ✓
                            </span>
                          ) : c === 'no' ? (
                            <span class="precio-no" role="img" aria-label={t('precios.no')}>
                              —
                            </span>
                          ) : typeof c === 'number' ? (
                            <strong>{numero(c)}</strong>
                          ) : (
                            t(c[0], c[1])
                          )}
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
                        {p.id === 'fundador' && cupo !== null && vivos !== null && (
                          <span class="precio-sats">{agotado ? t('comprar.agotado') : t('precios.quedanFundadores', { n: vivos.fundadoresQuedan })}</span>
                        )}
                        {/* Se puede comprar en cuanto hay llave de cobro, aunque el cobro no esté activo (compra de prueba). */}
                        {sats > 0n && vivos?.seVende === true && !agotado && (
                          <a class="boton boton-contorno precio-comprar" href={`/comprar?producto=${p.codigo}`}>
                            {t('precios.comprar')}
                          </a>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
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
