import { useEffect } from 'preact/hooks';
import type { Key } from './i18n/index.ts';
import { SiteFooter, SiteHeader, useI18n } from './ui.tsx';

// Landing «Regalo empresarial» (Claudia, 08/11/2026): explica la oportunidad e invita a escribir.
// Todavía no hay lotes en la web (docs/analisis/2026-11-08-plan-b2b.md): se arma con cada empresa.

const CONTACTO = 'hola@regalalebitcoin.com';
const USOS = [1, 2, 3, 4] as const;
const PASOS = [1, 2, 3, 4] as const;
const PORQUE = [1, 2, 3, 4] as const;

function Check() {
  return (
    <svg class="custodia-marca" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function BusinessPage({ testnet }: { testnet: boolean }) {
  const { t, lang } = useI18n();
  useEffect(() => {
    document.title = `${t('empresas.kicker')} · Regalale Bitcoin`;
  }, [lang]);
  const mail = `mailto:${CONTACTO}?subject=${encodeURIComponent(t('empresas.asunto'))}`;

  return (
    <div class="pagina pagina-home pagina-porque pagina-custodia">
      {testnet && (
        <p class="aviso-red" role="note">
          {t('red.prueba')}
        </p>
      )}
      <section class="porque-hero">
        <div class="hero-contenido">
          <SiteHeader onOrange />
          <div class="porque-hero-texto">
            <p class="kicker kicker-tinta">{t('empresas.kicker')}</p>
            <h1>{t('empresas.titulo')}</h1>
            <p class="bajada">{t('empresas.bajada')}</p>
            <a class="boton boton-primario boton-grande" href={mail}>
              {t('empresas.cta.boton')}
            </a>
          </div>
        </div>
      </section>

      <main class="home-secciones">
        <section class="seccion" aria-labelledby="empresas-usos">
          <h2 id="empresas-usos">{t('empresas.usos.titulo')}</h2>
          <div class="custodia-listas">
            <article class="custodia-lista custodia-lista-si">
              <ul>
                {USOS.map((n) => (
                  <li key={n}>
                    <Check />
                    <span>{t(`empresas.usos.${n}` as Key)}</span>
                  </li>
                ))}
              </ul>
            </article>
            <article class="custodia-lista custodia-lista-si">
              <h3>{t('empresas.porque.titulo')}</h3>
              <ul>
                {PORQUE.map((n) => (
                  <li key={n}>
                    <Check />
                    <span>{t(`empresas.porque.${n}` as Key)}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section class="seccion" aria-labelledby="empresas-como">
          <h2 id="empresas-como">{t('empresas.como.titulo')}</h2>
          <ol class="custodia-pasos">
            {PASOS.map((n) => (
              <li class={`custodia-paso custodia-paso-${n}`} key={n}>
                <span class="custodia-paso-numero" aria-hidden="true">
                  {n}
                </span>
                <h3>{t(`empresas.paso${n}.t` as Key)}</h3>
                <p>{t(`empresas.paso${n}.d` as Key)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section class="porque-cta">
          <h2>{t('empresas.cta.titulo')}</h2>
          <p>{t('empresas.cta.texto')}</p>
          <a class="boton boton-primario boton-grande" href={mail}>
            {t('empresas.cta.boton')}
          </a>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
