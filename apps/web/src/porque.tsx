import { useEffect } from 'preact/hooks';
import { COIN_COLORS, REASONS } from './content/razones.ts';
import type { Key } from './i18n/index.ts';
import { SiteFooter, SiteHeader, useI18n } from './ui.tsx';

// Página "¿Por qué Bitcoin?" (docs/contenido.md §2): las 21 razones → según quién lo
// recibe (5 franjas de edad) → nuestra historia → disclaimer → "¿Regalamos?". Todo el texto
// va en el DOM, a la vista: es la página que tiene que posicionar en los buscadores.

const AGES = [
  { n: 1, range: '0–4', color: '#bdebfa' },
  { n: 2, range: '5–12', color: '#ffd23f' },
  { n: 3, range: '13–17', color: '#ffc7d8' },
  { n: 4, range: '18–69', color: '#d9f5c9' },
  { n: 5, range: '70+', color: '#ffd8b5' },
] as const;

export function WhyPage({ testnet }: { testnet: boolean }) {
  const { t, lang } = useI18n();
  const reasons = REASONS[lang];

  useEffect(() => {
    document.title = `${t('porque.titulo')} · Regalale Bitcoins`;
  }, [lang]);

  return (
    <div class="pagina pagina-home pagina-porque">
      {testnet && (
        <p class="aviso-red" role="note">
          {t('red.prueba')}
        </p>
      )}
      <section class="porque-hero">
        <div class="hero-contenido">
          <SiteHeader onOrange />
          <div class="porque-hero-texto">
            <p class="kicker kicker-tinta">{t('razones.kicker')}</p>
            <h1>{t('porque.titulo')}</h1>
            <p class="bajada">{t('porque.bajada')}</p>
          </div>
        </div>
      </section>

      <main class="home-secciones">
        <section class="seccion" aria-labelledby="porque-razones">
          <h2 id="porque-razones">{t('razones.titulo')}</h2>
          <ol class="razones-lista">
            {reasons.map(([title, detail], i) => (
              <li class="razon" key={i}>
                <span class="razon-moneda" style={{ background: COIN_COLORS[i % COIN_COLORS.length] }} aria-hidden="true">
                  {i + 1}
                </span>
                <span class="razon-texto">
                  <strong>{title}</strong> <span>{detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <p class="aviso-precio">{t('razones.aviso')}</p>
        </section>

        <section class="seccion" aria-labelledby="porque-edades">
          <h2 id="porque-edades">{t('porque.edades.titulo')}</h2>
          <p class="texto-suave porque-intro">{t('porque.edades.texto')}</p>
          <div class="edades">
            {AGES.map(({ n, range, color }) => (
              <article class="edad" key={n}>
                <span class="edad-rango" style={{ background: color }}>
                  {range}
                </span>
                <h3>{t(`porque.edad${n}.t` as Key)}</h3>
                <p>{t(`porque.edad${n}.d` as Key)}</p>
              </article>
            ))}
          </div>
        </section>

        <section class="seccion" aria-labelledby="porque-historia">
          <article class="historia">
            <p class="kicker kicker-naranja">{t('porque.historia.kicker')}</p>
            <h2 id="porque-historia">{t('porque.historia.titulo')}</h2>
            <p>{t('porque.historia.p1')}</p>
            <p>{t('porque.historia.p2')}</p>
            <p>{t('porque.historia.p3')}</p>
            <p class="firma">— Rodolfo Andragnes</p>
          </article>
        </section>

        <section class="porque-cta">
          <h2>{t('porque.cta.titulo')}</h2>
          <p>{t('porque.cta.texto')}</p>
          <a class="boton boton-primario boton-grande" href="/regalar">
            {t('home.regalar')}
          </a>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
