import { useEffect } from 'preact/hooks';
import type { Key } from './i18n/index.ts';
import { SiteFooter, SiteHeader, useI18n } from './ui.tsx';

// Página "Sin custodia" (/sin-custodia): explica, sin jerga, por qué nosotros no podemos tocar
// los bitcoins de un regalo. Todo lo que dice tiene que seguir siendo cierto según
// docs/arquitectura.md y docs/derivacion.md: si cambia qué guarda el servidor (por ejemplo, el
// link guardado para envíos programados), hay que actualizar estos textos.

const STEPS = [1, 2, 3, 4] as const;

/** Lista de dos columnas: lo que sí (con tilde) y lo que no (con cruz). */
function TwoLists({ yes, no }: { yes: { title: Key; items: readonly Key[] }; no: { title: Key; items: readonly Key[] } }) {
  const { t } = useI18n();
  return (
    <div class="custodia-listas">
      {[
        { kind: 'si', ...yes },
        { kind: 'no', ...no },
      ].map(({ kind, title, items }) => (
        <article class={`custodia-lista custodia-lista-${kind}`} key={kind}>
          <h3>{t(title)}</h3>
          <ul>
            {items.map((item) => (
              <li key={item}>
                <svg class="custodia-marca" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d={kind === 'si' ? 'M5 12.5l4.5 4.5L19 7' : 'M6 6l12 12M18 6L6 18'} />
                </svg>
                <span>{t(item)}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

/** Ilustración: un teléfono con la llave adentro y un candado. Decorativa. */
function PhoneKey() {
  return (
    <svg class="custodia-ilustracion" viewBox="0 0 240 240" fill="none" aria-hidden="true">
      <circle cx="198" cy="40" r="8" fill="#ffd23f" />
      <rect x="22" y="58" width="16" height="10" rx="3" fill="#4cc9f0" transform="rotate(-20 30 63)" />
      <circle cx="34" cy="190" r="6" fill="#ffffff" />
      <rect x="196" y="176" width="18" height="10" rx="3" fill="#ff5d8f" transform="rotate(25 205 181)" />
      <rect x="66" y="20" width="108" height="200" rx="22" fill="#ffffff" stroke="#1a1530" stroke-width="6" />
      <rect x="102" y="34" width="36" height="7" rx="3.5" fill="#1a1530" />
      <circle cx="120" cy="100" r="30" fill="#ffd23f" stroke="#1a1530" stroke-width="6" />
      <circle cx="120" cy="100" r="10" fill="#ffffff" stroke="#1a1530" stroke-width="5" />
      <path d="M120 130v58M120 158h16M120 176h12" stroke="#1a1530" stroke-width="7" stroke-linecap="round" />
    </svg>
  );
}

export function NoCustodyPage({ testnet }: { testnet: boolean }) {
  const { t, lang } = useI18n();

  useEffect(() => {
    document.title = `${t('custodia.titulo')} · Regalale Bitcoins`;
  }, [lang]);

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
          <div class="custodia-hero-cuerpo">
            <div class="porque-hero-texto">
              <p class="kicker kicker-tinta">{t('custodia.titulo')}</p>
              <h1>{t('custodia.hero.titulo')}</h1>
              <p class="bajada">{t('custodia.hero.bajada')}</p>
            </div>
            <PhoneKey />
          </div>
        </div>
      </section>

      <main class="home-secciones">
        <section class="seccion" aria-labelledby="custodia-como">
          <h2 id="custodia-como">{t('custodia.como.titulo')}</h2>
          <ol class="custodia-pasos">
            {STEPS.map((n) => (
              <li class={`custodia-paso custodia-paso-${n}`} key={n}>
                <span class="custodia-paso-numero" aria-hidden="true">
                  {n}
                </span>
                <h3>{t(`custodia.paso${n}.t` as Key)}</h3>
                <p>{t(`custodia.paso${n}.d` as Key)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section class="seccion" aria-labelledby="custodia-guardamos">
          <h2 id="custodia-guardamos">{t('custodia.guardamos.titulo')}</h2>
          <TwoLists
            yes={{ title: 'custodia.guardamos.si', items: ['custodia.guardamos.si1', 'custodia.guardamos.si2', 'custodia.guardamos.si3', 'custodia.guardamos.si4'] }}
            no={{ title: 'custodia.guardamos.no', items: ['custodia.guardamos.no1', 'custodia.guardamos.no2', 'custodia.guardamos.no3'] }}
          />
        </section>

        <section class="seccion" aria-labelledby="custodia-podemos">
          <h2 id="custodia-podemos">{t('custodia.podemos.titulo')}</h2>
          <TwoLists
            yes={{ title: 'custodia.podemos.si', items: ['custodia.podemos.si1', 'custodia.podemos.si2', 'custodia.podemos.si3'] }}
            no={{ title: 'custodia.podemos.no', items: ['custodia.podemos.no1', 'custodia.podemos.no2', 'custodia.podemos.no3', 'custodia.podemos.no4'] }}
          />
        </section>

        <section class="seccion" aria-labelledby="custodia-desaparece">
          <article class="historia custodia-bloque">
            <h2 id="custodia-desaparece">{t('custodia.desaparece.titulo')}</h2>
            <p>{t('custodia.desaparece.p1')}</p>
            <p>{t('custodia.desaparece.p2')}</p>
            <p>{t('custodia.desaparece.p3')}</p>
            <p>
              {t('custodia.desaparece.ayuda')}{' '}
              <a class="custodia-link" href="https://bitcoin.ar" target="_blank" rel="noopener noreferrer">
                bitcoin.ar
              </a>
              .
            </p>
          </article>
        </section>

        <section class="seccion" aria-labelledby="custodia-confianza">
          <article class="historia custodia-bloque">
            <h2 id="custodia-confianza">{t('custodia.confianza.titulo')}</h2>
            <p>{t('custodia.confianza.p1')}</p>
            <p>{t('custodia.confianza.p2')}</p>
          </article>
        </section>

        <section class="seccion" aria-labelledby="custodia-otra">
          <article class="custodia-otra">
            <p class="kicker kicker-tinta">{t('custodia.otra.kicker')}</p>
            <h2 id="custodia-otra">{t('custodia.otra.titulo')}</h2>
            <p>{t('custodia.otra.p1')}</p>
            <p>
              <strong>{t('custodia.otra.p2')}</strong>
            </p>
          </article>
        </section>

        <section class="porque-cta">
          <h2>{t('custodia.cta.titulo')}</h2>
          <p>{t('custodia.cta.texto')}</p>
          <a class="boton boton-primario boton-grande" href="/regalar">
            {t('home.regalar')}
          </a>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
