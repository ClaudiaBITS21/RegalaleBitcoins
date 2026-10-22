import { useEffect, useState } from 'preact/hooks';
import { api, type Credits } from '../api.ts';
import { redeemPendingCoupon } from '../cuponPendiente.ts';
import { couponErrorKey } from '../comprar.tsx';
import { occasionLabel } from '../content/occasions.ts';
import type { Key } from '../i18n/index.ts';
import { Button, Notice, useI18n } from '../ui.tsx';

// «Mi plan» (handoff 2026-10-19, «cobro y créditos»): saldo por tipo y plan vigente. El saldo sale
// de los movimientos (solo se agregan). No promete que vengan más regalos gratis. «Tengo un código»
// canjea los cupones que dan regalos o listas (handoff 2026-10-21, «cupones»); los de descuento se
// usan al comprar.

const PLAN_NAME = { anual: 'precios.anual.n', fundador: 'precios.fundador.n' } as const;

export function MyPlan() {
  const { t, lang } = useI18n();
  const [credits, setCredits] = useState<Credits | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true } | { error: Key } | null>(null);
  const load = () =>
    api
      .credits()
      .then(setCredits)
      .catch(() => setCredits(null));
  useEffect(() => {
    // Un código de invitación guardado en este navegador se suma antes de mostrar los créditos.
    void redeemPendingCoupon().then(load);
  }, []);
  const redeem = async () => {
    setBusy(true);
    setResult(null);
    try {
      await api.redeemCoupon(code.trim());
      setResult({ ok: true });
      setCode('');
      await load();
    } catch (e) {
      setResult({ error: couponErrorKey(e) });
    } finally {
      setBusy(false);
    }
  };
  if (credits === null) return null;
  const { plan } = credits;
  const regalos = (n: number | null) => (n === null ? t('plan.regalosLibres') : n === 1 ? t('plan.unRegalo') : t('plan.nRegalos', { n }));
  const listas = (n: number) => (n === 1 ? t('plan.unaLista') : t('plan.nListas', { n }));
  const fecha = (iso: string) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  return (
    <section class="caja mi-plan" aria-labelledby="mi-plan">
      <strong id="mi-plan">{t('plan.titulo')}</strong>
      {credits.admin === true && <Notice kind="ok">{t('plan.admin')}</Notice>}
      {!credits.cobroActivo && <p class="texto-suave">{t('plan.gratis')}</p>}
      <ul>
        {plan !== null && (
          <li>
            {plan.hasta === null
              ? t('plan.sinHasta', { nombre: t(PLAN_NAME[plan.tipo]), regalos: regalos(plan.regalosQuedan), listas: listas(plan.listas) })
              : t('plan.conHasta', { nombre: t(PLAN_NAME[plan.tipo]), regalos: regalos(plan.regalosQuedan), listas: listas(plan.listas), fecha: fecha(plan.hasta) })}
          </li>
        )}
        <li>{t('plan.bienvenida', { n: Math.max(0, credits.regalos.bienvenida) })}</li>
        {credits.regalos.pagos !== 0 && <li>{t('plan.pagos', { n: credits.regalos.pagos })}</li>}
        {(credits.listas.cumple > 0 || credits.listas.otras > 0) && <li>{t('plan.listas', { cumple: credits.listas.cumple, otras: credits.listas.otras })}</li>}
        {Object.entries(credits.regalos.porOcasion ?? {}).map(([o, n]) => (
          <li key={`r-${o}`}>{t('plan.regalosOcasion', { ocasion: occasionLabel(o, lang), n })}</li>
        ))}
        {Object.entries(credits.listas.porOcasion ?? {}).map(([o, n]) => (
          <li key={`l-${o}`}>{t('plan.listasOcasion', { ocasion: occasionLabel(o, lang), n })}</li>
        ))}
      </ul>
      <form
        class="formulario plan-codigo"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim() !== '' && !busy) void redeem();
        }}
      >
        <label class="campo">
          <span>{t('plan.codigo')}</span>
          <input type="text" autocomplete="off" autocapitalize="characters" value={code} onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <Button type="submit" kind="contorno" disabled={busy || code.trim() === ''}>
          {t('plan.codigo.canjear')}
        </Button>
        {result !== null && ('ok' in result ? <Notice kind="ok">{t('plan.codigo.listo')}</Notice> : <Notice kind="error">{t(result.error)}</Notice>)}
      </form>
      <a href="/precios">{t('plan.verPrecios')}</a>
    </section>
  );
}
