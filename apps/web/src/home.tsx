import { useState } from 'preact/hooks';
import { Button, Notice, useI18n } from './ui.tsx';

export function Home() {
  const { t } = useI18n();
  const [hint, setHint] = useState<'pronto' | 'reclamar' | null>(null);
  const features = [1, 2, 3, 4] as const;
  return (
    <div class="inicio">
      <section class="presentacion">
        <h1>{t('home.titulo')}</h1>
        <p class="bajada">{t('home.bajada')}</p>
      </section>
      <nav class="acciones" aria-label={t('home.regalar')}>
        <a class="boton boton-primario" href="/regalar">
          {t('home.regalar')}
        </a>
        <Button kind="acento" onClick={() => setHint('reclamar')}>
          {t('home.reclamar')}
        </Button>
        <Button kind="contorno" onClick={() => setHint('pronto')}>
          {t('home.lista')}
        </Button>
        {hint !== null && <Notice>{t(hint === 'pronto' ? 'home.pronto' : 'home.comoReclamar')}</Notice>}
      </nav>
      <section class="beneficios">
        {features.map((n) => (
          <div class="beneficio" key={n}>
            <strong>{t(`home.f${n}.titulo`)}</strong>
            <span>{t(`home.f${n}.texto`)}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
