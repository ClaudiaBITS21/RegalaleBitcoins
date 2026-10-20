import { useEffect, useState } from 'preact/hooks';
import { GiftCardArt } from '../content/GiftCardArt.tsx';
import { formatSats, formatUsd, satsToUsd } from '../format.ts';
import { type Key, translate, type UiLang } from '../i18n/index.ts';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';
import type { MadeGift } from './GivePage.tsx';
import { usePlanFeatures } from './planFeatures.ts';
import { PrintCard } from './PrintCard.tsx';
import { numberedWords, WordsList } from './WordsList.tsx';
import { receivedSats, useGiftStatus } from './useGiftStatus.ts';

type Channel = 'whatsapp' | 'mail' | 'copiar' | 'mano';
const CHANNELS = ['whatsapp', 'mail', 'copiar', 'mano'] as const;

/**
 * Por qué canal salió el link y por cuál las palabras, recordado mientras dure la pestaña
 * (solo el nombre del canal, nunca el link ni las palabras).
 */
function useSentBy(giftId: string, part: 'link' | 'palabras'): [Channel | null, (c: Channel) => void] {
  const key = `envio:${giftId}:${part}`;
  const [value, setValue] = useState<Channel | null>(() => {
    try {
      const v = sessionStorage.getItem(key);
      return (CHANNELS as readonly string[]).includes(v ?? '') ? (v as Channel) : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (value !== null) sessionStorage.setItem(key, value);
    } catch {
      // Sin almacenamiento (modo privado): se recuerda solo mientras no se recargue.
    }
  }, [key, value]);
  return [value, setValue];
}

/**
 * Mandar el regalo: el link por un canal y las 4 palabras por otro distinto. Los mensajes
 * van en el idioma de quien recibe. Todo sale del navegador: el servidor no ve el link.
 */
export function SendStep({ gift, ceilingUsd, onAnother }: { gift: MadeGift; ceilingUsd: number; onAnother: () => void }) {
  const { t, lang, trato } = useI18n();
  const { view } = useGiftStatus(gift.id);
  const conPlan = usePlanFeatures();
  // El link y las palabras nunca por el mismo canal: quien vea los dos se queda con el regalo.
  const [linkBy, setLinkBy] = useSentBy(gift.id, 'link');
  const [wordsBy, setWordsBy] = useSentBy(gift.id, 'palabras');
  const r = (key: Key, vars?: Record<string, string>) => translate(gift.lang as UiLang, key, vars, trato);

  const linkText = r('regalar.mandar.mensajeLink', { para: gift.to, link: gift.link });
  const wordsText = r('regalar.mandar.mensajePalabras', { palabras: numberedWords(gift.words) });
  const href = (channel: 'whatsapp' | 'mail', text: string, subject: string) =>
    channel === 'whatsapp'
      ? `https://wa.me/?text=${encodeURIComponent(text)}`
      : `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  const copy = async (text: string, channel: (c: Channel) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      channel('copiar');
    } catch {
      // El link y las palabras quedan a la vista para copiarlos a mano.
    }
  };

  const received = view === null ? gift.sats : receivedSats(view);
  const overCeiling = view?.usdPorBtcHoy != null && satsToUsd(received, view.usdPorBtcHoy) > ceilingUsd;
  const confirmed = view?.estado === 'activo';

  return (
    <div class="paso">
      <StepTitle>{t('regalar.mandar.titulo')}</StepTitle>
      <Notice kind={confirmed ? 'ok' : 'info'}>{t(confirmed ? 'regalar.mandar.activo' : 'regalar.mandar.confirmando')}</Notice>
      {overCeiling && <Notice>{t('regalar.pagar.techo', { maximo: formatUsd(ceilingUsd, lang) })}</Notice>}
      {view !== null && (
        <div class="tarjeta vista-tarjeta">
          <GiftCardArt occasion={view.ocasion} estilo={view.estilo} src={`/api/gifts/${view.id}/imagen`} name={view.para} class="tarjeta-imagen" />
        </div>
      )}
      <p class="texto-suave">{t('regalar.mandar.monto', { monto: formatSats(received, lang) })}</p>

      <section class="caja envio">
        <h3>{t('regalar.mandar.link')}</h3>
        <p class="mono enlace-regalo" translate={false}>
          {gift.link}
        </p>
        <div class="canales">
          {(['whatsapp', 'mail'] as const).map((c) =>
            c === wordsBy ? (
              <button type="button" key={c} class="boton boton-contorno" disabled title={t('regalar.mandar.mismoCanal')}>
                {t(`regalar.mandar.${c}`)}
              </button>
            ) : (
              <a
                key={c}
                class="boton boton-contorno"
                href={href(c, linkText, r('regalar.mandar.asunto'))}
                target={c === 'whatsapp' ? '_blank' : undefined}
                rel="noopener noreferrer"
                onClick={() => setLinkBy(c)}
              >
                {t(`regalar.mandar.${c}`)}
              </a>
            ),
          )}
          <Button kind="contorno" onClick={() => void copy(gift.link, setLinkBy)}>
            {t('regalar.mandar.copiar')}
          </Button>
        </div>
        {linkBy !== null && <small class="texto-suave">{t('regalar.mandar.hecho', { canal: t(`regalar.mandar.${linkBy}` as Key) })}</small>}
        {(wordsBy === 'whatsapp' || wordsBy === 'mail') && <small class="texto-suave">{t('regalar.mandar.mismoCanalLink')}</small>}
      </section>

      <section class="caja envio">
        <h3>{t('regalar.mandar.palabras')}</h3>
        <p class="texto-suave">{t('regalar.mandar.palabrasTexto')}</p>
        <WordsList words={gift.words} />
        <p class="texto-suave">
          <strong>{t('regalar.mandar.orden')}</strong>
        </p>
        <div class="canales">
          {(['whatsapp', 'mail'] as const).map((c) =>
            c === linkBy ? (
              <button type="button" key={c} class="boton boton-contorno" disabled title={t('regalar.mandar.mismoCanal')}>
                {t(`regalar.mandar.${c}`)}
              </button>
            ) : (
              <a
                key={c}
                class="boton boton-contorno"
                href={href(c, wordsText, r('regalar.mandar.asuntoPalabras'))}
                target={c === 'whatsapp' ? '_blank' : undefined}
                rel="noopener noreferrer"
                onClick={() => setWordsBy(c)}
              >
                {t(`regalar.mandar.${c}`)}
              </a>
            ),
          )}
          <Button kind="contorno" onClick={() => void copy(numberedWords(gift.words), setWordsBy)}>
            {t('regalar.mandar.copiar')}
          </Button>
          <Button kind="contorno" onClick={() => setWordsBy('mano')}>
            {t('regalar.mandar.mano')}
          </Button>
        </div>
        {linkBy !== null && linkBy !== 'copiar' && <small class="texto-suave">{t('regalar.mandar.mismoCanal')}</small>}
        {wordsBy !== null && <small class="texto-suave">{t('regalar.mandar.hecho', { canal: t(`regalar.mandar.${wordsBy}` as Key) })}</small>}
      </section>

      {view !== null && <PrintCard link={gift.link} view={view} conPlan={conPlan} />}

      <Notice>{t('regalar.mandar.guarda')}</Notice>
      <Button kind="acento" onClick={onAnother}>
        {t('regalar.mandar.otro')}
      </Button>
    </div>
  );
}
