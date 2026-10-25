import { type Destination, type GiftWallet, isCoreError, type Network, planSweep, signSweep, type SweepPlan } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import { ApiFailure, api, type GiftView } from '../api.ts';
import { formatSats, formatUsd, satsToUsd } from '../format.ts';
import type { Key } from '../i18n/index.ts';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';

type Mode = 'ahora' | 'esperar';
type Plans = { ahora: SweepPlan | null; esperar: SweepPlan | null };

const FEE_WARNING_USD = 1;
/**
 * Tope propio de tasa (sat/vB): no se confía a ciegas en lo que informa el servidor. Por encima
 * de esto, la transacción sale igual pero más lenta.
 */
export const CLIENT_MAX_FEE_RATE = 500;
/** Si la comisión se lleva más que esta parte del regalo, se pide una confirmación aparte. */
const FEE_SHARE_CONFIRM = 0.1;

/** Arma el plan o null si a esa tasa no queda nada para enviar (polvo). */
function tryPlan(make: (rate: number) => SweepPlan, rate: number): SweepPlan | null {
  try {
    return make(Math.min(rate, CLIENT_MAX_FEE_RATE));
  } catch (e) {
    if (isCoreError(e, 'AMOUNT_BELOW_DUST')) return null;
    throw e;
  }
}

/** La comisión se lleva una parte grande del regalo. */
const expensive = (p: SweepPlan): boolean => Number(p.fee) > Number(p.total) * FEE_SHARE_CONFIRM;

export function ConfirmStep({
  gift,
  network,
  wallet,
  destination,
  onDone,
}: {
  gift: GiftView;
  network: Network;
  wallet: GiftWallet;
  destination: Destination;
  onDone: (result: { txid: string; modo: Mode }) => void;
}) {
  const { t, lang } = useI18n();
  const [plans, setPlans] = useState<Plans | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [mode, setMode] = useState<Mode>('ahora');
  const [sending, setSending] = useState(false);
  const [feeAccepted, setFeeAccepted] = useState(false);

  const load = async () => {
    setPlans(null);
    setError(null);
    try {
      const [utxos, fees] = await Promise.all([api.utxos(gift.id), api.fees()]);
      const plan = (feeRate: number) =>
        planSweep({ network, utxos, giftScript: wallet.script, destination, feeRate, ...(wallet.witnessScript === undefined ? {} : { witnessScript: wallet.witnessScript }) });
      // "Ahora" y "esperar" se arman por separado: si a la tasa rápida no alcanza, igual se puede
      // dejar programado a la económica o, como último recurso, a la mínima.
      const ahora = tryPlan(plan, fees.halfHour);
      let esperar = fees.economy < fees.halfHour || ahora === null ? tryPlan(plan, fees.economy) : null;
      if (ahora === null && esperar === null && fees.minimum < fees.economy) esperar = tryPlan(plan, fees.minimum);
      if (ahora === null && esperar === null) {
        setError('confirmar.polvo');
        return;
      }
      setMode(ahora === null ? 'esperar' : 'ahora');
      setFeeAccepted(false);
      setPlans({ ahora, esperar });
    } catch (e) {
      if (e instanceof ApiFailure && (e.status === 0 || e.status >= 500)) setError('reclamo.sinRed');
      else setError('confirmar.error');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const send = async () => {
    const plan = mode === 'esperar' ? plans?.esperar : plans?.ahora;
    if (plan === null || plan === undefined || sending || (expensive(plan) && !feeAccepted)) return;
    setSending(true);
    setError(null);
    try {
      const signed = signSweep(plan, wallet);
      const result = await api.claim(gift.id, signed.hex, mode);
      onDone({ txid: result.txid, modo: mode });
    } catch (e) {
      setSending(false);
      if (e instanceof ApiFailure && e.code === 'fondos_cambiaron') {
        setError('confirmar.cambio');
        void load();
      } else if (e instanceof ApiFailure && (e.status === 0 || e.status >= 500)) {
        setError('reclamo.sinRed');
      } else {
        setError('confirmar.error');
      }
    }
  };

  // Sin el valor en plata si quien regala no lo quiso mostrar (25/10).
  const usd = gift.mostrarValor === false ? null : gift.usdPorBtcHoy;
  // Sin sats (25/10): en plata si se puede mostrar; si no, ningún monto (lo que le llega es lo que le llega).
  const inMoney = (sats: bigint) => (usd === null ? formatSats(sats, lang) : `≈ ${formatUsd(satsToUsd(sats, usd), lang)}`);
  const selected = mode === 'esperar' ? plans?.esperar : plans?.ahora;
  const choices = (['ahora', 'esperar'] as const).filter((m) => plans?.[m] != null);

  return (
    <div class="paso">
      <StepTitle>{t('confirmar.titulo')}</StepTitle>
      {plans === null && error === null && <p class="texto-suave">{t('confirmar.calculando')}</p>}
      {selected !== undefined && selected !== null && (
        <>
          {usd !== null && (
            <div class="caja montos">
              <p>{t('confirmar.recibis', { monto: inMoney(selected.amount) })}</p>
              <p>{t('confirmar.comision', { comision: inMoney(selected.fee) })}</p>
            </div>
          )}
          {usd !== null && satsToUsd(selected.fee, usd) > FEE_WARNING_USD && <Notice>{t('confirmar.comisionAlta')}</Notice>}
          {choices.length > 1 && (
            <div class="opciones" role="radiogroup" aria-label={t('confirmar.titulo')}>
              {choices.map((m) => (
                <button type="button" role="radio" aria-checked={mode === m} class={`opcion ${mode === m ? 'elegida' : ''}`} key={m} onClick={() => setMode(m)}>
                  {t(m === 'ahora' ? 'confirmar.ahora' : 'confirmar.esperar')}
                </button>
              ))}
            </div>
          )}
          {choices.length === 1 && mode === 'esperar' && <Notice>{t('confirmar.soloEsperar')}</Notice>}
          {expensive(selected) && (
            <label class="casilla">
              <input type="checkbox" checked={feeAccepted} onChange={(e) => setFeeAccepted((e.currentTarget as HTMLInputElement).checked)} />
              <span>{t('confirmar.aceptoComision', { parte: new Intl.NumberFormat(lang, { style: 'percent' }).format(Number(selected.fee) / Number(selected.total)) })}</span>
            </label>
          )}
        </>
      )}
      {error !== null && <Notice kind="error">{t(error)}</Notice>}
      {error !== null && plans === null && (
        <Button kind="contorno" onClick={() => void load()}>
          {t('reintentar')}
        </Button>
      )}
      {sending && <p class="texto-suave">{t('confirmar.enviando')}</p>}
      <Button disabled={selected == null || sending || (expensive(selected) && !feeAccepted)} onClick={() => void send()}>
        {t('confirmar.cta')}
      </Button>
    </div>
  );
}
