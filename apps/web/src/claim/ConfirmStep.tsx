import { type Destination, type GiftWallet, isCoreError, type Network, planSweep, signSweep, type SweepPlan } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import { ApiFailure, api, type GiftView } from '../api.ts';
import { formatSats, formatUsd, satsToUsd } from '../format.ts';
import type { Key } from '../i18n/index.ts';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';

type Mode = 'ahora' | 'esperar';
type Plans = { ahora: SweepPlan; esperar: SweepPlan | null };

const FEE_WARNING_USD = 1;

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

  const load = async () => {
    setPlans(null);
    setError(null);
    try {
      const [utxos, fees] = await Promise.all([api.utxos(gift.id), api.fees()]);
      const plan = (feeRate: number) => planSweep({ network, utxos, giftScript: wallet.script, destination, feeRate });
      const ahora = plan(fees.halfHour);
      let esperar: SweepPlan | null = null;
      if (fees.economy < fees.halfHour) {
        try {
          esperar = plan(fees.economy);
        } catch {
          esperar = null;
        }
      }
      setPlans({ ahora, esperar });
    } catch (e) {
      if (isCoreError(e, 'AMOUNT_BELOW_DUST')) setError('confirmar.polvo');
      else if (e instanceof ApiFailure && (e.status === 0 || e.status >= 500)) setError('reclamo.sinRed');
      else setError('confirmar.error');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const send = async () => {
    const plan = mode === 'esperar' ? plans?.esperar : plans?.ahora;
    if (plan === null || plan === undefined || sending) return;
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

  const usd = gift.usdPorBtcHoy;
  const withUsd = (sats: bigint) => (usd === null ? formatSats(sats, lang) : `${formatSats(sats, lang)} (≈ ${formatUsd(satsToUsd(sats, usd), lang)})`);
  const selected = mode === 'esperar' && plans?.esperar ? plans.esperar : plans?.ahora;

  return (
    <div class="paso">
      <StepTitle>{t('confirmar.titulo')}</StepTitle>
      {plans === null && error === null && <p class="texto-suave">{t('confirmar.calculando')}</p>}
      {selected !== undefined && selected !== null && (
        <>
          <div class="caja montos">
            <p>{t('confirmar.recibis', { monto: withUsd(selected.amount) })}</p>
            <p>{t('confirmar.comision', { comision: withUsd(selected.fee) })}</p>
          </div>
          {usd !== null && satsToUsd(plans?.ahora.fee ?? 0n, usd) > FEE_WARNING_USD && <Notice>{t('confirmar.comisionAlta')}</Notice>}
          {plans?.esperar !== null && (
            <div class="opciones" role="radiogroup" aria-label={t('confirmar.titulo')}>
              {(['ahora', 'esperar'] as const).map((m) => (
                <button type="button" role="radio" aria-checked={mode === m} class={`opcion ${mode === m ? 'elegida' : ''}`} key={m} onClick={() => setMode(m)}>
                  {t(m === 'ahora' ? 'confirmar.ahora' : 'confirmar.esperar')}
                </button>
              ))}
            </div>
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
      <Button disabled={plans === null || sending} onClick={() => void send()}>
        {t('confirmar.cta')}
      </Button>
    </div>
  );
}
