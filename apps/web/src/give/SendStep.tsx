import { useState } from 'preact/hooks';
import { GiftCardArt } from '../content/GiftCardArt.tsx';
import { formatSats, formatUsd, satsToUsd } from '../format.ts';
import { type Key, translate, type UiLang } from '../i18n/index.ts';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';
import type { MadeGift } from './GivePage.tsx';
import { receivedSats, useGiftStatus } from './useGiftStatus.ts';

type Channel = 'whatsapp' | 'mail' | 'copiar' | 'mano';

/**
 * Mandar el regalo: el link por un canal y las 4 palabras por otro distinto. Los mensajes
 * van en el idioma de quien recibe. Todo sale del navegador: el servidor no ve el link.
 */
export function SendStep({ gift, ceilingUsd, onAnother }: { gift: MadeGift; ceilingUsd: number; onAnother: () => void }) {
  const { t, lang } = useI18n();
  const { view } = useGiftStatus(gift.id);
  const [linkBy, setLinkBy] = useState<Channel | null>(null);
  const [wordsBy, setWordsBy] = useState<Channel | null>(null);
  const r = (key: Key, vars?: Record<string, string>) => translate(gift.lang as UiLang, key, vars);

  const linkText = r('regalar.mandar.mensajeLink', { para: gift.to, link: gift.link });
  const wordsText = r('regalar.mandar.mensajePalabras', { palabras: gift.words.join(' ') });
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
          <GiftCardArt occasion={view.ocasion} variant={view.imagen} estilo={view.estilo} src={`/api/gifts/${view.id}/imagen`} name={view.para} class="tarjeta-imagen" />
        </div>
      )}
      <p class="texto-suave">{t('regalar.mandar.monto', { monto: formatSats(received, lang) })}</p>

      <section class="caja envio">
        <h3>{t('regalar.mandar.link')}</h3>
        <p class="mono enlace-regalo" translate={false}>
          {gift.link}
        </p>
        <div class="canales">
          <a class="boton boton-contorno" href={href('whatsapp', linkText, '')} target="_blank" rel="noopener noreferrer" onClick={() => setLinkBy('whatsapp')}>
            {t('regalar.mandar.whatsapp')}
          </a>
          <a class="boton boton-contorno" href={href('mail', linkText, r('regalar.mandar.asunto'))} onClick={() => setLinkBy('mail')}>
            {t('regalar.mandar.mail')}
          </a>
          <Button kind="contorno" onClick={() => void copy(gift.link, setLinkBy)}>
            {t('regalar.mandar.copiar')}
          </Button>
        </div>
        {linkBy !== null && <small class="texto-suave">{t('regalar.mandar.hecho', { canal: t(`regalar.mandar.${linkBy}` as Key) })}</small>}
      </section>

      <section class="caja envio">
        <h3>{t('regalar.mandar.palabras')}</h3>
        <p class="texto-suave">{t('regalar.mandar.palabrasTexto')}</p>
        <ol class="palabras-regalo" translate={false}>
          {gift.words.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ol>
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
          <Button kind="contorno" onClick={() => void copy(gift.words.join(' '), setWordsBy)}>
            {t('regalar.mandar.copiar')}
          </Button>
          <Button kind="contorno" onClick={() => setWordsBy('mano')}>
            {t('regalar.mandar.mano')}
          </Button>
        </div>
        {linkBy !== null && linkBy !== 'copiar' && <small class="texto-suave">{t('regalar.mandar.mismoCanal')}</small>}
        {wordsBy !== null && <small class="texto-suave">{t('regalar.mandar.hecho', { canal: t(`regalar.mandar.${wordsBy}` as Key) })}</small>}
      </section>

      <Notice>{t('regalar.mandar.guarda')}</Notice>
      <Button kind="acento" onClick={onAnother}>
        {t('regalar.mandar.otro')}
      </Button>
    </div>
  );
}
