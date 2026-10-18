import { useEffect, useState } from 'preact/hooks';
import { AgeArt, CuentoArt } from './content/PorqueArt.tsx';
import { ReasonsFan } from './content/ReasonsFan.tsx';
import { COIN_COLORS, reasonsFor } from './content/razones.ts';
import type { Key } from './i18n/index.ts';
import { SiteFooter, SiteHeader, useI18n } from './ui.tsx';

// Página "¿Por qué Bitcoin?" (docs/contenido.md §2): las 21 razones en abanico → según quién
// lo recibe (5 tarjetas que se dan vuelta) → nuestra historia → el cuento para bajar → "¿Regalamos?".
// Todo el texto va en el DOM aunque esté del lado de atrás de una carta: es la página que
// tiene que posicionar en los buscadores, y la leen igual los lectores de pantalla.

const AGES = [
  { n: 1, range: '0–4', color: '#bdebfa' },
  { n: 2, range: '5–12', color: '#ffd8b5' },
  { n: 3, range: '13–17', color: '#ffc7d8' },
  { n: 4, range: '18–69', color: '#d9f5c9' },
  { n: 5, range: '70+', color: '#eee9ff' },
] as const;

/**
 * El cuento para bajar. Cuando esté el archivo, se pone en apps/web/public/ (mismo origen) y
 * acá su ruta, por ejemplo '/el-cuento-de-navidad.pdf'; mientras sea null el botón dice "Muy pronto".
 */
const CUENTO_URL: string | null = '/cuento-navidad.pdf';
/** Canal con los cuentos de Florando Dragones. */
const MAS_CUENTOS_URL = 'https://www.youtube.com/@NaryanayNarydu';

/** Tarjeta de una franja de edad: frente con la ilustración, dorso con el porqué. */
function AgeCard({ n, range, color }: (typeof AGES)[number]) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const name = t(`porque.edad${n}.t` as Key);
  return (
    <li class="porque-edad-item">
      {/* Sin aria-label: el nombre del botón es nombre + franja + texto, siempre completo;
          aria-pressed dice de qué lado está. Las pistas y el nombre repetido van ocultos. */}
      <button type="button" class="porque-edad" aria-pressed={open} onClick={() => setOpen(!open)}>
        <span class={`porque-edad-giro${open ? ' abierta' : ''}`}>
          <span class="porque-edad-cara porque-edad-frente" style={{ background: color }}>
            <AgeArt n={n} class="porque-edad-arte" />
            <span class="porque-edad-rango">{t('porque.edad.anios', { rango: range })}</span>
            <span class="porque-edad-nombre">{name}</span>
            <span class="porque-edad-pista" aria-hidden="true">
              {t('porque.edad.tocar')} →
            </span>
          </span>
          <span class="porque-edad-cara porque-edad-dorso">
            <span class="porque-edad-nombre" aria-hidden="true">
              {name}
            </span>
            <span class="porque-edad-texto">{t(`porque.edad${n}.d` as Key)}</span>
            <span class="porque-edad-pista" aria-hidden="true">
              ← {t('porque.edad.volver')}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}

export function WhyPage({ testnet }: { testnet: boolean }) {
  const { t, lang, trato } = useI18n();
  const reasons = reasonsFor(lang, trato);

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
        <section class="razones porque-razones" aria-labelledby="porque-razones">
          <div class="razones-texto">
            <h2 id="porque-razones">{t('razones.titulo')}</h2>
            <p class="razones-ayuda">{t('razones.ayuda')}</p>
          </div>
          <ReasonsFan ctaHref="/regalar" />
          <p class="razones-aviso">{t('razones.aviso')}</p>
        </section>

        <section class="seccion porque-lista-seccion">
          {/* Las 21 juntas, para leerlas de corrido (y para buscadores y lectores de pantalla). */}
          <details class="porque-lista">
            <summary>{t('porque.razones.verTodas')}</summary>
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
          </details>
        </section>

        <section class="seccion" aria-labelledby="porque-edades">
          <h2 id="porque-edades">{t('porque.edades.titulo')}</h2>
          <p class="texto-suave porque-intro">
            {t('porque.edades.texto')} {t('porque.edades.ayuda')}
          </p>
          <ul class="porque-edades">
            {AGES.map((age) => (
              <AgeCard key={age.n} {...age} />
            ))}
          </ul>
        </section>

        <section class="seccion" aria-labelledby="porque-historia">
          <article class="historia">
            <p class="kicker kicker-naranja">{t('porque.historia.kicker')}</p>
            <h2 id="porque-historia">{t('porque.historia.titulo')}</h2>
            <p>{t('porque.historia.p1')}</p>
            <p>{t('porque.historia.p2')}</p>
            <p>{t('porque.historia.p3')}</p>
          </article>
        </section>

        <section class="seccion" aria-labelledby="porque-cuento">
          <div class="porque-cuento">
            <CuentoArt label={t('porque.cuento.imagen')} class="porque-cuento-arte" />
            <div class="porque-cuento-texto">
              <p class="kicker kicker-naranja">{t('porque.cuento.kicker')}</p>
              <h2 id="porque-cuento">{t('porque.cuento.titulo')}</h2>
              <p>{t('porque.cuento.texto')}</p>
              <p>
                <a class="porque-cuento-mas" href={MAS_CUENTOS_URL} target="_blank" rel="noopener noreferrer">
                  {t('porque.cuento.mas')}
                </a>
              </p>
              {CUENTO_URL !== null ? (
                <a class="boton boton-primario porque-cuento-boton" href={CUENTO_URL} download="Una-Natividad-Moderna-RegalaleBitcoins.pdf">
                  {t('porque.cuento.bajar')}
                </a>
              ) : (
                <button type="button" class="boton porque-cuento-boton" disabled>
                  {t('porque.cuento.bajar')}
                  <span class="porque-pronto">{t('porque.cuento.pronto')}</span>
                </button>
              )}
            </div>
          </div>
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
