import { useEffect, useState } from 'preact/hooks';
import { ApiFailure, api, type CouponView } from './api.ts';
import { couponErrorKey } from './comprar.tsx';
import { dataUrl, svgCompacto } from './content/logo.ts';
import { occasionLabel } from './content/occasions.ts';
import { clearPendingCoupon, savePendingCoupon } from './cuponPendiente.ts';
import type { Key } from './i18n/index.ts';
import { useSignedIn } from './sesion.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from './ui.tsx';

// Invitación con un cupón (/invitacion/CODIGO, pedido de Claudia, 21/10): cada código de un lote
// trae su link. Muestra qué da el código y lleva a armar el regalo; el código queda guardado en
// este navegador y se suma solo al entrar o crear la cuenta (cuponPendiente.ts).
//
// El link corto de un cupón (/c/K7M2P, Claudia 25/10) usa la misma página: «Acá tenés un cupón»,
// el cupón dibujado como un ticket y el código ya puesto para cuando compre.

const LOGO_COMPACTO = dataUrl(svgCompacto('claro'));

type Shown = CouponView & { paraUnMail: boolean; desde?: string; hasta?: string | null; corto?: string; conLogo?: boolean };

// Las fechas de un cupón son días de la Argentina (se crean a la medianoche de acá): se muestran
// en esa hora, para que en otro país no se corran un día.
const longDate = (d: Date, lang: string) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' }).format(d);

/** El último día en que vale (hasta es exclusivo), en el formato del idioma. */
const lastDay = (iso: string, lang: string) => longDate(new Date(new Date(iso).getTime() - 1), lang);

/** Desde y hasta cuándo vale: si todavía no empezó, las dos fechas (el de un evento se comparte antes). */
function validity(c: Shown, t: ReturnType<typeof useI18n>['t'], lang: string): string | null {
  const starts = c.desde !== undefined && new Date(c.desde).getTime() > Date.now() ? longDate(new Date(c.desde), lang) : null;
  if (starts !== null) return c.hasta == null ? t('cupon.desde', { fecha: starts }) : t('cupon.del', { desde: starts, hasta: lastDay(c.hasta, lang) });
  return c.hasta == null ? null : t('cupon.hasta', { fecha: lastDay(c.hasta, lang) });
}

export function InvitationPage({ testnet, code, short = false }: { testnet: boolean; code: string; short?: boolean }) {
  const { t, lang } = useI18n();
  const signedIn = useSignedIn();
  const [coupon, setCoupon] = useState<Shown | null>(null);
  const [problem, setProblem] = useState<Key | null>(null);
  const [redeemed, setRedeemed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `${t(short ? 'cupon.titulo' : 'invitacion.titulo')} · Regalale Bitcoin`;
    (short ? api.shortCoupon(code) : api.invitation(code))
      .then((c) => {
        setCoupon(c);
        savePendingCoupon(c.codigo);
      })
      .catch((e) => setProblem(e instanceof ApiFailure && e.code === 'cupon_agotado' ? 'invitacion.usada' : 'invitacion.noVigente'));
  }, []);

  const what = (c: CouponView): string => {
    const parts: string[] = [];
    if (c.descuento !== null) parts.push(c.descuento === 100 ? t('invitacion.gratis') : t('invitacion.descuento', { n: c.descuento }));
    if (c.da !== null) {
      const n = c.da.cantidad;
      const base = c.da.unidad === 'regalo' ? (n === 1 ? t('invitacion.unRegalo') : t('invitacion.nRegalos', { n })) : n === 1 ? t('invitacion.unaLista') : t('invitacion.nListas', { n });
      parts.push(c.da.ocasion === null ? base : t('invitacion.ocasion', { que: base, ocasion: occasionLabel(c.da.ocasion, lang) }));
    }
    return parts.length === 2 ? t('invitacion.y', { a: parts[0] as string, b: parts[1] as string }) : (parts[0] ?? '');
  };

  const redeem = async (c: CouponView) => {
    setBusy(true);
    setProblem(null);
    try {
      await api.redeemCoupon(c.codigo);
      clearPendingCoupon();
      setRedeemed(true);
    } catch (e) {
      setProblem(couponErrorKey(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout testnet={testnet}>
      <div class="paso invitacion">
        <StepTitle>{t(short ? 'cupon.titulo' : 'invitacion.titulo')}</StepTitle>
        {coupon !== null && short && (
          <div class="cupon-ticket" role="group" aria-label={t('cupon.etiqueta')}>
            <div class="cupon-ticket-cuerpo">
              <span class="cupon-ticket-etiqueta">{t('cupon.etiqueta')}</span>
              <p class="cupon-ticket-da">{what(coupon).replace(/^./, (x) => x.toUpperCase())}</p>
              {validity(coupon, t, lang) !== null && <p class="cupon-ticket-hasta">{validity(coupon, t, lang)}</p>}
              <div class="cupon-ticket-marcas">
                <img class="cupon-ticket-logo" src={LOGO_COMPACTO} alt="Regalale Bitcoin" />
                {/* El de quien promueve el cupón (una empresa, un evento), del otro lado de una línea. */}
                {coupon.conLogo === true && coupon.corto !== undefined && <img class="cupon-ticket-socio" src={`/api/c/${coupon.corto}/logo.png`} alt="" />}
              </div>
            </div>
            <div class="cupon-ticket-talon">
              <span class="cupon-ticket-codigo-label">{t('cupon.codigo')}</span>
              <strong class="cupon-ticket-codigo">{coupon.codigo}</strong>
            </div>
          </div>
        )}
        <p>{t('invitacion.texto')}</p>
        {coupon !== null && (
          <div class="caja">
            {!short && <p class="invitacion-da">{t('invitacion.da', { codigo: coupon.codigo, que: what(coupon) })}</p>}
            {coupon.paraUnMail && <p class="texto-suave">{t('invitacion.paraUnMail')}</p>}
            {short && coupon.descuento !== null && <p class="texto-suave">{t('cupon.cargado')}</p>}
            {!signedIn && (!short || coupon.da !== null) && <p class="texto-suave">{t('invitacion.guardado')}</p>}
          </div>
        )}
        {problem !== null && (
          <>
            <Notice kind="error">{t(problem)}</Notice>
            {coupon === null && <p class="texto-suave">{t('invitacion.igual')}</p>}
          </>
        )}
        {redeemed && <Notice kind="ok">{t('invitacion.canjeado')}</Notice>}
        {coupon !== null && signedIn && coupon.da !== null && coupon.descuento === null && !redeemed && (
          <Button kind="contorno" disabled={busy} onClick={() => void redeem(coupon)}>
            {t('invitacion.canjear')}
          </Button>
        )}
        {coupon !== null && coupon.descuento !== null && (
          <a class="boton boton-contorno" href="/precios">
            {t('invitacion.planes')}
          </a>
        )}
        <a class="boton boton-primario" href="/regalar">
          {t('invitacion.armar')}
        </a>
      </div>
    </Layout>
  );
}
