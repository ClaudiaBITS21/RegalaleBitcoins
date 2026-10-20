import type { NetworkName } from '@regalale/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiFailure, api, type Purchase } from './api.ts';
import { formatSats, formatUsdExact } from './format.ts';
import { PayBox } from './give/PayBox.tsx';
import type { Key } from './i18n/index.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from './ui.tsx';

// Comprar créditos o un plan (handoff 2026-10-19, «cobro y créditos»): el servidor cotiza en sats
// por 30 minutos y da una dirección nueva, de la llave de cobro de la plataforma. Es un costo por
// servicio que se paga aparte: nunca sale de un regalo. Esta pantalla mira el pago sola.

/** Nombre del producto en la página de precios. */
export const PRODUCT_NAME: Readonly<Record<string, Key>> = {
  pack10: 'precios.pack10.n',
  pack10_lista: 'precios.listaOtras.n',
  lista_cumple: 'precios.listaCumple.n',
  anual: 'precios.anual.n',
  fundador: 'precios.fundador.n',
};

const POLL_MS = 10_000;

export function BuyPage({ testnet }: { testnet: boolean }) {
  const { t, lang } = useI18n();
  const product = new URLSearchParams(window.location.search).get('producto') ?? '';
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [network, setNetwork] = useState<NetworkName | null>(null);
  const [error, setError] = useState<'sesion' | Key | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (PRODUCT_NAME[product] === undefined) {
      setError('comprar.error');
      return;
    }
    void (async () => {
      try {
        const [health, p] = await Promise.all([api.health(), api.buy(product)]);
        setNetwork(health.red);
        setPurchase(p);
      } catch (e) {
        const code = e instanceof ApiFailure ? e.code : '';
        setError(
          e instanceof ApiFailure && e.status === 401
            ? 'sesion'
            : code === 'cobro_no_configurado'
              ? 'comprar.noSeVende'
              : code === 'fundadores_agotados'
                ? 'comprar.agotado'
                : 'comprar.error',
        );
      }
    })();
  }, []);

  // Mira el pago hasta que se confirme.
  useEffect(() => {
    if (purchase === null || purchase.estado === 'confirmado' || purchase.estado === 'devuelto') return;
    const timer = window.setInterval(() => {
      api
        .purchase(purchase.id)
        .then(setPurchase)
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [purchase?.id, purchase?.estado]);

  let body;
  if (error === 'sesion') {
    body = (
      <div class="paso">
        <StepTitle>{t('comprar.titulo')}</StepTitle>
        <p>{t('comprar.sesion')}</p>
        <Button onClick={() => window.location.assign('/panel')}>{t('comprar.entrar')}</Button>
      </div>
    );
  } else if (error !== null) {
    body = (
      <div class="paso">
        <StepTitle>{t('comprar.titulo')}</StepTitle>
        <Notice kind="error">{t(error)}</Notice>
        <a href="/precios">{t('plan.verPrecios')}</a>
      </div>
    );
  } else if (purchase === null || network === null) {
    body = <p class="texto-suave cargando">…</p>;
  } else if (purchase.estado === 'confirmado') {
    body = (
      <div class="paso">
        <StepTitle>{t('comprar.listo')}</StepTitle>
        <p>{t('comprar.producto', { producto: t(PRODUCT_NAME[purchase.producto] ?? 'precios.pack10.n') })}</p>
        <Button onClick={() => window.location.assign('/panel')}>{t('comprar.verPlan')}</Button>
      </div>
    );
  } else {
    const sats = BigInt(purchase.sats);
    const received = BigInt(purchase.satsRecibidos);
    body = (
      <div class="paso">
        <StepTitle>{t('regalar.pagar.titulo', { monto: formatSats(sats, lang) })}</StepTitle>
        <p>
          {t('comprar.producto', { producto: t(PRODUCT_NAME[purchase.producto] ?? 'precios.pack10.n') })}
          {purchase.precioUsd > 0 && ` (${t('precios.usdHoy', { usd: formatUsdExact(purchase.precioUsd, lang) })})`}
        </p>
        <PayBox address={purchase.direccion} sats={sats} network={network} />
        {purchase.estado === 'pendiente' && (
          <p class="esperando" role="status">
            {t('comprar.esperando')}
          </p>
        )}
        {purchase.estado === 'visto' && <Notice>{t('comprar.visto')}</Notice>}
        {purchase.estado === 'incompleto' && <Notice>{t('comprar.incompleto', { llego: formatSats(received, lang), esperado: formatSats(sats, lang) })}</Notice>}
        <p class="texto-suave">{t('comprar.fijo')}</p>
      </div>
    );
  }
  return <Layout testnet={testnet}>{body}</Layout>;
}
