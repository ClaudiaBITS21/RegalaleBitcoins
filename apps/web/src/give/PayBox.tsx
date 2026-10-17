import type { NetworkName } from '@regalale/core';
import { useState } from 'preact/hooks';
import { groupAddress, paymentUri, satsToBtcString } from '../format.ts';
import { Button, useI18n } from '../ui.tsx';
import { Qr } from './Qr.tsx';

// Datos para pagar: QR, monto y dirección, con tres formas de copiar. "Dirección y monto" copia el
// link de pago (bitcoin:…?amount=…), que BlueWallet, Muun y la mayoría de las billeteras completan
// solos al pegarlo; tocar el QR copia lo mismo. Las otras dos, para billeteras que no lo entienden.

type What = 'ambos' | 'direccion' | 'monto';

export function PayBox({ address, sats, network }: { address: string; sats: bigint; network: NetworkName }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<What | null>(null);
  const uri = paymentUri(address, sats, false);

  const copy = async (what: What, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2_000);
    } catch {
      // Sin permiso para el portapapeles: la dirección y el monto quedan visibles para copiarlos a mano.
    }
  };
  const label = (what: What, key: 'regalar.pagar.copiarAmbos' | 'regalar.pagar.copiarDireccion' | 'regalar.pagar.copiarMonto') =>
    copied === what ? t('regalar.pagar.copiado') : t(key);

  return (
    <div class="pago">
      <button type="button" class="qr-copiar" onClick={() => void copy('ambos', uri)} title={t('regalar.pagar.qrCopiar')}>
        <Qr text={paymentUri(address, sats)} label={t('regalar.pagar.qr')} />
        <span class="qr-copiar-texto" aria-live="polite">
          {copied === 'ambos' ? t('regalar.pagar.copiado') : t('regalar.pagar.qrCopiar')}
        </span>
      </button>
      <p class="monto-btc">
        <strong>{satsToBtcString(sats)} BTC</strong>
        {network !== 'mainnet' && <span class="texto-suave"> ({network})</span>}
      </p>
      <p class="mono direccion-completa" aria-label={t('regalar.pagar.direccion')} translate={false}>
        {groupAddress(address)}
      </p>
      <div class="botones-copiar">
        <Button onClick={() => void copy('ambos', uri)}>{label('ambos', 'regalar.pagar.copiarAmbos')}</Button>
        <Button kind="contorno" onClick={() => void copy('direccion', address)}>
          {label('direccion', 'regalar.pagar.copiarDireccion')}
        </Button>
        <Button kind="contorno" onClick={() => void copy('monto', satsToBtcString(sats))}>
          {label('monto', 'regalar.pagar.copiarMonto')}
        </Button>
      </div>
    </div>
  );
}
