import { useEffect, useState } from 'preact/hooks';
import { api, type Credits } from '../api.ts';
import { useI18n } from '../ui.tsx';

// «Mi plan» (handoff 2026-10-19, «cobro y créditos»): saldo por tipo y plan vigente. El saldo sale
// de los movimientos (solo se agregan). No promete que vengan más regalos gratis.

const PLAN_NAME = { anual: 'precios.anual.n', fundador: 'precios.fundador.n' } as const;

export function MyPlan() {
  const { t, lang } = useI18n();
  const [credits, setCredits] = useState<Credits | null>(null);
  useEffect(() => {
    api
      .credits()
      .then(setCredits)
      .catch(() => setCredits(null));
  }, []);
  if (credits === null) return null;
  const { plan } = credits;
  const regalos = (n: number | null) => (n === null ? t('plan.regalosLibres') : n === 1 ? t('plan.unRegalo') : t('plan.nRegalos', { n }));
  const listas = (n: number) => (n === 1 ? t('plan.unaLista') : t('plan.nListas', { n }));
  const fecha = (iso: string) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  return (
    <section class="caja mi-plan" aria-labelledby="mi-plan">
      <strong id="mi-plan">{t('plan.titulo')}</strong>
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
      </ul>
      <a href="/precios">{t('plan.verPrecios')}</a>
    </section>
  );
}
