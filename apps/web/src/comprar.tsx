import type { NetworkName } from '@regalale/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { clearPendingCoupon, pendingCoupon } from './cuponPendiente.ts';
import { ApiFailure, api, type CouponView, type Purchase } from './api.ts';
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

/** Mensaje para cada problema de un cupón (handoff 2026-10-21, «cupones»). */
export function couponErrorKey(e: unknown): Key {
  const code = e instanceof ApiFailure ? e.code : '';
  const keys: Record<string, Key> = {
    cupon_invalido: 'cupon.invalido',
    cupon_vencido: 'cupon.vencido',
    cupon_no_empezo: 'cupon.noEmpezo',
    cupon_usado: 'cupon.usado',
    cupon_agotado: 'cupon.agotado',
    cupon_no_aplica: 'cupon.noAplica',
    cupon_es_de_canje: 'cupon.esDeCanje',
    cupon_es_de_compra: 'cupon.esDeCompra',
    cupon_de_otra_cuenta: 'cupon.deOtraCuenta',
  };
  return keys[code] ?? 'comprar.error';
}

export function BuyPage({ testnet }: { testnet: boolean }) {
  const { t, lang } = useI18n();
  const product = new URLSearchParams(window.location.search).get('producto') ?? '';
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [free, setFree] = useState(false);
  const [network, setNetwork] = useState<NetworkName | null>(null);
  const [error, setError] = useState<'sesion' | Key | null>(null);
  // Antes de pagar: el precio y «¿Tenés un código?».
  const [price, setPrice] = useState<bigint | null>(null);
  const [code, setCode] = useState(() => pendingCoupon() ?? '');
  const [coupon, setCoupon] = useState<CouponView | null>(null);
  const [couponError, setCouponError] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);
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
        const [health, credits, products] = await Promise.all([api.health(), api.creditsIfSignedIn(), api.products()]);
        setNetwork(health.red);
        if (credits === null) return setError('sesion');
        const p = products.productos.find((x) => x.codigo === product);
        if (p === undefined) return setError('comprar.error');
        if (!products.seVende) return setError('comprar.noSeVende');
        setPrice(BigInt(p.precioSats));
      } catch {
        setError('comprar.error');
      }
    })();
  }, []);

  const applyCode = async () => {
    setBusy(true);
    setCouponError(null);
    try {
      setCoupon(await api.couponPreview(code.trim(), product));
    } catch (e) {
      setCoupon(null);
      setCouponError(couponErrorKey(e));
    } finally {
      setBusy(false);
    }
  };

  // Con el código de una invitación ya escrito, se aplica solo cuando se sabe el precio.
  useEffect(() => {
    if (price !== null && code.trim() !== '' && coupon === null && couponError === null) void applyCode();
  }, [price]);

  const pay = async () => {
    setBusy(true);
    try {
      const r = await api.buy(product, coupon?.codigo);
      if (coupon !== null && coupon.codigo === pendingCoupon()?.trim().toUpperCase()) clearPendingCoupon();
      if ('gratis' in r) setFree(true);
      else setPurchase(r);
    } catch (e) {
      const code = e instanceof ApiFailure ? e.code : '';
      if (e instanceof ApiFailure && e.status === 401) setError('sesion');
      else if (code.startsWith('cupon_')) {
        setCoupon(null);
        setCouponError(couponErrorKey(e));
      } else setError(code === 'cobro_no_configurado' ? 'comprar.noSeVende' : code === 'fundadores_agotados' ? 'comprar.agotado' : 'comprar.error');
    } finally {
      setBusy(false);
    }
  };

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
  } else if (free) {
    body = (
      <div class="paso">
        <StepTitle>{t('comprar.listo')}</StepTitle>
        <p>{t('comprar.gratis', { producto: t(PRODUCT_NAME[product] ?? 'precios.pack10.n') })}</p>
        <Button onClick={() => window.location.assign('/panel')}>{t('comprar.verPlan')}</Button>
      </div>
    );
  } else if (purchase === null && price !== null) {
    const final = coupon?.precio !== undefined ? BigInt(coupon.precio) : price;
    body = (
      <div class="paso">
        <StepTitle>{t('comprar.titulo')}</StepTitle>
        <p>{t('comprar.producto', { producto: t(PRODUCT_NAME[product] ?? 'precios.pack10.n') })}</p>
        <p class="comprar-precio">
          {final !== price && <s class="texto-suave">{formatSats(price, lang)}</s>} <strong>{final === 0n ? t('precios.gratis') : formatSats(final, lang)}</strong>
        </p>
        <form
          class="formulario comprar-codigo"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim() !== '' && !busy) void applyCode();
          }}
        >
          <label class="campo">
            <span>{t('comprar.codigo.pregunta')}</span>
            <input type="text" autocomplete="off" autocapitalize="characters" value={code} onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <Button type="submit" kind="contorno" disabled={busy || code.trim() === ''}>
            {t('comprar.codigo.aplicar')}
          </Button>
          {coupon !== null && coupon.descuento !== null && <Notice kind="ok">{t('comprar.codigo.aplicado', { codigo: coupon.codigo, descuento: coupon.descuento })}</Notice>}
          {couponError !== null && <Notice kind="error">{t(couponError)}</Notice>}
        </form>
        <Button disabled={busy} onClick={() => void pay()}>
          {final === 0n ? t('comprar.canjear') : t('comprar.pagar')}
        </Button>
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
