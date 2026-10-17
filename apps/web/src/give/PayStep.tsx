import type { Network } from '@regalale/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatSats } from '../format.ts';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';
import type { MadeGift } from './GivePage.tsx';
import { PayBox } from './PayBox.tsx';
import { receivedSats, useGiftStatus } from './useGiftStatus.ts';

export function PayStep({ gift, network, onPaid }: { gift: MadeGift; network: Network; onPaid: () => void }) {
  const { t, lang } = useI18n();
  const { view, failed } = useGiftStatus(gift.id);
  const seen = useRef(false);
  const advanced = useRef(false);
  const received = view === null ? 0n : receivedSats(view);
  const replaced = view !== null && received === 0n && seen.current;
  if (received > 0n) seen.current = true;

  // Pago completo visto en la red (aunque sin confirmar): pasa a mandar el regalo.
  useEffect(() => {
    if (!advanced.current && received >= gift.sats) {
      advanced.current = true;
      onPaid();
    }
  }, [received]);

  const amount = formatSats(gift.sats, lang);
  return (
    <div class="paso">
      <StepTitle>{t('regalar.pagar.titulo', { monto: amount })}</StepTitle>
      <p class="texto-suave">{t('regalar.pagar.texto')}</p>
      <PayBox address={gift.address} sats={gift.sats} network={network.name} />
      {received === 0n && !replaced && (
        <p class="esperando" role="status">
          {t('regalar.pagar.esperando')}
        </p>
      )}
      {replaced && <Notice kind="error">{t('regalar.pagar.reemplazado')}</Notice>}
      {view?.pagoTrabado === true && <Notice>{t('regalar.pagar.trabado')}</Notice>}
      {received > 0n && received < gift.sats && (
        <>
          <Notice>{t('regalar.pagar.menos', { llego: formatSats(received, lang), esperado: amount })}</Notice>
          <Button kind="contorno" onClick={onPaid}>
            {t('regalar.pagar.seguirIgual')}
          </Button>
        </>
      )}
      {failed && <Notice kind="error">{t('reclamo.sinRed')}</Notice>}
      <p class="texto-suave">{t('regalar.pagar.cerrar')}</p>
    </div>
  );
}
