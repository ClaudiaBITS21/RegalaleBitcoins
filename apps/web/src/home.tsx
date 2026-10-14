import { useState } from 'preact/hooks';
import { choiceLabel, giveHref, type OccasionChoice, OccasionPicker } from './content/OccasionPicker.tsx';
import { ReasonsFan } from './content/ReasonsFan.tsx';
import { SiteFooter, SiteHeader, useI18n } from './ui.tsx';

// Home "Confeti" (docs/diseno/DISENO.md §2): hero naranja → ¿Qué festejamos? → Así de
// fácil → 21 razones → ¿Festejo grande? → pie.

function Confetti() {
  return (
    <>
      <svg class="confeti confeti-celu" viewBox="0 0 390 520" aria-hidden="true">
        <rect x="30" y="80" width="10" height="18" rx="3" fill="#ffd23f" transform="rotate(25 35 89)" />
        <rect x="320" y="60" width="10" height="18" rx="3" fill="#4cc9f0" transform="rotate(-30 325 69)" />
        <circle cx="350" cy="150" r="6" fill="#ffffff" />
        <circle cx="70" cy="190" r="5" fill="#ff5d8f" />
        <rect x="290" y="210" width="9" height="16" rx="3" fill="#ff5d8f" transform="rotate(40 294 218)" />
        <circle cx="200" cy="70" r="4" fill="#ffffff" />
        <rect x="110" y="40" width="9" height="16" rx="3" fill="#4cc9f0" transform="rotate(-15 114 48)" />
        <circle cx="25" cy="300" r="5" fill="#ffd23f" />
        <rect x="355" y="320" width="10" height="18" rx="3" fill="#ffd23f" transform="rotate(20 360 329)" />
        <circle cx="250" cy="120" r="5" fill="#ff5d8f" />
      </svg>
      <svg class="confeti confeti-compu" viewBox="0 0 1600 640" aria-hidden="true">
        <rect x="120" y="130" width="14" height="26" rx="4" fill="#ffd23f" transform="rotate(25 127 143)" />
        <rect x="1420" y="90" width="14" height="26" rx="4" fill="#4cc9f0" transform="rotate(-30 1427 103)" />
        <circle cx="1480" cy="300" r="8" fill="#ffffff" />
        <circle cx="230" cy="420" r="7" fill="#ff5d8f" />
        <rect x="1300" y="470" width="13" height="24" rx="4" fill="#ff5d8f" transform="rotate(40 1306 482)" />
        <circle cx="700" cy="90" r="6" fill="#ffffff" />
        <rect x="480" y="560" width="13" height="24" rx="4" fill="#4cc9f0" transform="rotate(-15 486 572)" />
        <circle cx="90" cy="560" r="7" fill="#ffd23f" />
        <rect x="1540" y="560" width="14" height="26" rx="4" fill="#ffd23f" transform="rotate(20 1547 573)" />
        <circle cx="1010" cy="60" r="7" fill="#ff5d8f" />
        <circle cx="860" cy="590" r="6" fill="#ffffff" />
        <rect x="330" y="70" width="12" height="22" rx="4" fill="#ffffff" transform="rotate(35 336 81)" />
      </svg>
    </>
  );
}

function GiftBox({ label }: { label: string }) {
  return (
    <svg class="caja-regalo" viewBox="0 0 220 200" role="img" aria-label={label}>
      <g class="moneda-salta">
        <circle cx="110" cy="52" r="40" fill="#ffd23f" stroke="#1a1530" stroke-width="5" />
        <text x="110" y="68" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="44" fill="#1a1530">
          ₿
        </text>
      </g>
      <path d="M60 40 l-14 -10 M160 40 l14 -10" stroke="#1a1530" stroke-width="5" stroke-linecap="round" />
      <rect x="34" y="104" width="152" height="90" rx="10" fill="#ff5d8f" stroke="#1a1530" stroke-width="5" />
      <rect x="24" y="86" width="172" height="30" rx="8" fill="#ff5d8f" stroke="#1a1530" stroke-width="5" transform="rotate(-8 110 101)" />
      <rect x="98" y="104" width="24" height="90" fill="#ffffff" stroke="#1a1530" stroke-width="5" />
    </svg>
  );
}

export function Home({ testnet }: { testnet: boolean }) {
  const { t, lang } = useI18n();
  const [occasion, setOccasion] = useState<OccasionChoice | null>(null);
  const [soon, setSoon] = useState(false);
  const steps = [1, 2, 3] as const;

  return (
    <div class="pagina pagina-home">
      {testnet && (
        <p class="aviso-red" role="note">
          {t('red.prueba')}
        </p>
      )}
      <section class="hero">
        <Confetti />
        <div class="hero-contenido">
          <SiteHeader onOrange />
          <div class="hero-cuerpo">
            <div class="hero-texto">
              <h1>{t('home.titulo')}</h1>
              <p class="bajada">{t('home.bajada')}</p>
              <div class="hero-botones">
                <a class="boton boton-primario boton-grande" href="/regalar">
                  {t('home.regalar')}
                </a>
                <a class="boton boton-blanco" href="/abrir">
                  {t('home.reclamar')}
                </a>
              </div>
              <button type="button" class="link-lista" onClick={() => setSoon(true)}>
                {t('home.lista')} →
              </button>
              {soon && (
                <p class="aviso-pronto" role="status">
                  {t('home.pronto')}
                </p>
              )}
            </div>
            <GiftBox label={t('home.caja')} />
          </div>
        </div>
      </section>

      <main class="home-secciones">
        <section class="seccion seccion-centrada">
          <h2>{t('home.festejamos')}</h2>
          <OccasionPicker value={occasion} onPick={setOccasion} />
          {occasion !== null && (
            <a class="boton boton-primario boton-grande boton-ancho" href={giveHref(occasion)}>
              {t('home.regalarPara', { ocasion: choiceLabel(occasion, lang) })}
            </a>
          )}
        </section>

        <section class="seccion" id="como">
          <h2 class="titulo-centrado">{t('home.facil')}</h2>
          <div class="pasos">
            {steps.map((n) => (
              <div class={`paso-home paso-home-${n}`} key={n}>
                <span class="paso-numero">{n}</span>
                <strong>{t(`home.paso${n}.t`)}</strong>
                <span>{t(`home.paso${n}.d`)}</span>
              </div>
            ))}
          </div>
        </section>

        <section class="razones" id="razones">
          <div class="razones-texto">
            <p class="kicker">{t('razones.kicker')}</p>
            <h2>{t('razones.titulo')}</h2>
            <p class="razones-ayuda">{t('razones.ayuda')}</p>
            <a class="link-porque" href="/por-que">
              {t('porque.verTodo')} →
            </a>
          </div>
          <ReasonsFan ctaHref="/regalar" />
          <p class="razones-aviso">{t('razones.aviso')}</p>
        </section>

        <section class="seccion grande">
          <h2>{t('home.grande')}</h2>
          <p class="texto-suave">{t('home.grande.texto')}</p>
          <button type="button" class="boton boton-rosa" onClick={() => setSoon(true)}>
            {t('home.grande.cta')}
          </button>
          {soon && (
            <p class="aviso-pronto" role="status">
              {t('home.pronto')}
            </p>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
