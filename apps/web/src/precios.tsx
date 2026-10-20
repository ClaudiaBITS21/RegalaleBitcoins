import { useEffect, useState } from 'preact/hooks';
import { api, type Products } from './api.ts';
import { formatSats, formatUsdPrice, usdCentsToSats } from './format.ts';
import type { Key } from './i18n/index.ts';
import { ConMarca, SiteFooter, SiteHeader, useI18n } from './ui.tsx';

// Página "Precios" (handoff 2026-10-19, «cobro y créditos»). Precios en dólares con su valor de
// hoy en sats debajo. Es un costo por servicio que se paga aparte: nunca sale del regalo. Mientras
// el cobro no esté activo, un aviso lo dice. «lista_otras» no se muestra sola: va el pack con 10
// regalos por el mismo precio.

/** Una celda de la tabla: incluye (✓), no incluye (—) o un texto (cantidad o condición). */
type Celda = 'si' | 'no' | Key;

interface Producto {
  readonly id: 'bienvenida' | 'pack10' | 'listaCumple' | 'listaOtras' | 'anual' | 'fundador';
  /** Código del producto en la API (el que se compra). */
  readonly codigo: string;
  /** Centavos de dólar; 0 = gratis. Los vigentes llegan de /api/productos (los edita el admin). */
  readonly centavos: number;
  /** Regalos · tarjeta completa · listas · vigencia. */
  readonly celdas: readonly [Celda, Celda, Celda, Celda];
}

const FILAS: readonly Key[] = ['precios.fila.regalos', 'precios.fila.tarjeta', 'precios.fila.listas', 'precios.fila.vigencia'];

// Una sola tabla comparativa (Rodolfo, 20/10). Precios de la tabla del handoff, mientras llegan los de la API.
const PRODUCTOS: readonly Producto[] = [
  { id: 'bienvenida', codigo: 'bienvenida', centavos: 0, celdas: ['precios.v.cinco', 'precios.v.basica', 'no', 'precios.v.noVencen'] },
  { id: 'pack10', codigo: 'pack10', centavos: 1050, celdas: ['10' as Key, 'si', 'no', 'precios.v.noVencen'] },
  { id: 'listaCumple', codigo: 'lista_cumple', centavos: 1050, celdas: ['no', 'no', 'precios.v.unaCumple', 'precios.v.noVencen'] },
  { id: 'listaOtras', codigo: 'pack10_lista', centavos: 2100, celdas: ['10' as Key, 'si', 'precios.v.unaOtra', 'precios.v.noVencen'] },
  { id: 'anual', codigo: 'anual', centavos: 4200, celdas: ['precios.v.libres', 'si', 'precios.v.libres', 'precios.v.anio'] },
  { id: 'fundador', codigo: 'fundador', centavos: 21000, celdas: ['precios.v.libres', 'si', 'precios.v.diezAnio', 'precios.v.siempre'] },
];

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
  const centavos = (p: Producto) => {
    const v = vivos?.productos.find((x) => x.codigo === p.codigo);
    return v === undefined ? p.centavos : Math.round(v.precioUsd * 100);
  };

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
                    const cents = centavos(p);
                    return (
                      <th scope="col" key={p.id} class={p.id === 'listaOtras' ? 'precios-destacado' : undefined}>
                        <span class="precio-nombre">{t(`precios.${p.id}.n` as Key)}</span>
                        <span class="precio-monto">{cents === 0 ? t('precios.gratis') : formatUsdPrice(cents / 100, lang)}</span>
                        {cents > 0 && usdPorBtc !== null && <span class="precio-sats">{t('precios.enSats', { sats: formatSats(usdCentsToSats(BigInt(cents), usdPorBtc), lang) })}</span>}
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
                      const c = p.celdas[i] as Celda;
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
                          ) : /^\d+$/.test(c) ? (
                            <strong>{c}</strong>
                          ) : (
                            t(c)
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
                    const cents = centavos(p);
                    const agotado = p.id === 'fundador' && vivos !== null && vivos.fundadoresQuedan <= 0;
                    return (
                      <td key={p.id} class={p.id === 'listaOtras' ? 'precios-destacado' : undefined}>
                        {p.id === 'fundador' && (
                          <span class="precio-sats">{agotado ? t('comprar.agotado') : vivos === null ? t('precios.soloCien') : t('precios.quedanFundadores', { n: vivos.fundadoresQuedan })}</span>
                        )}
                        {/* Se puede comprar en cuanto hay llave de cobro, aunque el cobro no esté activo (compra de prueba). */}
                        {cents > 0 && vivos?.seVende === true && !agotado && (
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
