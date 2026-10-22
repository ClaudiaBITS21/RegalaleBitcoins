import type { Network } from '@regalale/core';
import { useEffect, useRef } from 'preact/hooks';
import type { Credits } from '../api.ts';
import { formatSats } from '../format.ts';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';
import type { MadeGift } from './GivePage.tsx';
import { PayBox } from './PayBox.tsx';
import { SinBitcoin } from './SinBitcoin.tsx';
import { receivedSats, useGiftStatus } from './useGiftStatus.ts';

/** «Te quedan…»: qué crédito usa este regalo (solo con el cobro activo). */
function creditNote(c: Credits | null): { key: 'regalar.creditos.plan' | 'regalar.creditos.bienvenida' | 'regalar.creditos.pagos'; n: number } | null {
  // Los regalos de un admin no descuentan créditos.
  if (c === null || !c.cobroActivo || c.admin === true) return null;
  if (c.plan !== null) return { key: 'regalar.creditos.plan', n: 0 };
  if (c.regalos.bienvenida > 0) return { key: 'regalar.creditos.bienvenida', n: c.regalos.bienvenida };
  if (c.regalos.pagos > 0) return { key: 'regalar.creditos.pagos', n: c.regalos.pagos };
  return null;
}

export function PayStep({ gift, network, credits = null, onPaid }: { gift: MadeGift; network: Network; credits?: Credits | null; onPaid: () => void }) {
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
  const note = creditNote(credits);
  return (
    <div class="paso">
      <StepTitle>{t('regalar.pagar.titulo', { monto: amount })}</StepTitle>
      <p class="texto-suave">{t('regalar.pagar.texto')}</p>
      {note !== null && <p class="texto-suave">{t(note.key, { n: note.n })}</p>}
      <PayBox address={gift.address} sats={gift.sats} network={network.name} />
      {received === 0n && <SinBitcoin address={gift.address} sats={gift.sats} network={network.name} />}
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
