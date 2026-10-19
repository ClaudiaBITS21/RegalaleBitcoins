import { useEffect, useState } from 'preact/hooks';
import { api } from './api.ts';
import { formatSats, formatUsdPrice, usdCentsToSats } from './format.ts';
import type { Key } from './i18n/index.ts';
import { ConMarca, SiteFooter, SiteHeader, useI18n } from './ui.tsx';

// Página "Precios" (handoff 2026-10-19, «cobro y créditos»). Precios en dólares con su valor de
// hoy en sats debajo. Es un costo por servicio que se paga aparte: nunca sale del regalo. Mientras
// el cobro no esté activo, un aviso lo dice. «lista_otras» no se muestra sola: va el pack con 10
// regalos por el mismo precio.

interface Producto {
  readonly id: 'bienvenida' | 'pack10' | 'listaCumple' | 'listaOtras' | 'anual' | 'fundador';
  /** Centavos de dólar; 0 = gratis. */
  readonly centavos: number;
  readonly items: number;
}

// Los mismos precios que la tabla del handoff; cuando exista el admin, salen de la API.
const PRODUCTOS: readonly Producto[] = [
  { id: 'bienvenida', centavos: 0, items: 2 },
  { id: 'pack10', centavos: 1050, items: 2 },
  { id: 'listaCumple', centavos: 1050, items: 2 },
  { id: 'listaOtras', centavos: 2100, items: 2 },
  { id: 'anual', centavos: 4200, items: 2 },
  { id: 'fundador', centavos: 21000, items: 3 },
];

/** Mientras sea false, la página avisa que hoy regalar es gratis. */
const COBRO_ACTIVO = false;

export function PricingPage({ testnet }: { testnet: boolean }) {
  const { t, lang, trato } = useI18n();
  const [usdPorBtc, setUsdPorBtc] = useState<number | null>(null);

  useEffect(() => {
    document.title = `${t('precios.kicker')} · Regalale Bitcoin`;
  }, [lang, trato]);

  useEffect(() => {
    api
      .price()
      .then((p) => setUsdPorBtc(p.usdPorBtc))
      .catch(() => setUsdPorBtc(null));
  }, []);

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
          {!COBRO_ACTIVO && (
            <p class="precios-aviso" role="note">
              {t('precios.aviso')}
            </p>
          )}
          <ul class="precios-grilla">
            {PRODUCTOS.map((p) => (
              <li class={`precio-tarjeta${p.centavos === 0 ? ' precio-gratis' : ''}`} key={p.id}>
                <h2>{t(`precios.${p.id}.n` as Key)}</h2>
                <p class="precio-monto">{p.centavos === 0 ? t('precios.gratis') : formatUsdPrice(p.centavos / 100, lang)}</p>
                {p.centavos > 0 && usdPorBtc !== null && (
                  <p class="precio-sats">{t('precios.enSats', { sats: formatSats(usdCentsToSats(BigInt(p.centavos), usdPorBtc), lang) })}</p>
                )}
                <ul class="precio-items">
                  {Array.from({ length: p.items }, (_, i) => (
                    <li key={i}>{t(`precios.${p.id}.i${i + 1}` as Key)}</li>
                  ))}
                </ul>
              </li>
            ))}
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
