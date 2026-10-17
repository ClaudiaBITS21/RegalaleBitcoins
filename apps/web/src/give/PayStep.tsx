import type { Network } from '@regalale/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatSats, groupAddress, paymentUri, satsToBtcString } from '../format.ts';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';
import type { MadeGift } from './GivePage.tsx';
import { Qr } from './Qr.tsx';
import { receivedSats, useGiftStatus } from './useGiftStatus.ts';

export function PayStep({ gift, network, onPaid }: { gift: MadeGift; network: Network; onPaid: () => void }) {
  const { t, lang } = useI18n();
  const { view, failed } = useGiftStatus(gift.id);
  const [copied, setCopied] = useState<'direccion' | 'monto' | null>(null);
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

  const copy = async (what: 'direccion' | 'monto', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2_000);
    } catch {
      // Sin permiso para el portapapeles: la dirección queda visible para copiarla a mano.
    }
  };

  const amount = formatSats(gift.sats, lang);
  return (
    <div class="paso">
      <StepTitle>{t('regalar.pagar.titulo', { monto: amount })}</StepTitle>
      <p class="texto-suave">{t('regalar.pagar.texto')}</p>
      <div class="pago">
        <Qr text={paymentUri(gift.address, gift.sats)} label={t('regalar.pagar.qr')} />
        <p class="monto-btc">
          <strong>{satsToBtcString(gift.sats)} BTC</strong>
          {network.name !== 'mainnet' && <span class="texto-suave"> ({network.name})</span>}
        </p>
        <p class="mono direccion-completa" aria-label={t('regalar.pagar.direccion')} translate={false}>
          {groupAddress(gift.address)}
        </p>
        <div class="botones-copiar">
          <Button kind="contorno" onClick={() => void copy('direccion', gift.address)}>
            {copied === 'direccion' ? t('regalar.pagar.copiado') : t('regalar.pagar.copiarDireccion')}
          </Button>
          <Button kind="contorno" onClick={() => void copy('monto', satsToBtcString(gift.sats))}>
            {copied === 'monto' ? t('regalar.pagar.copiado') : t('regalar.pagar.copiarMonto')}
          </Button>
        </div>
      </div>
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
