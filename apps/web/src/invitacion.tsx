import { useEffect, useState } from 'preact/hooks';
import { ApiFailure, api, type CouponView } from './api.ts';
import { couponErrorKey } from './comprar.tsx';
import { occasionLabel } from './content/occasions.ts';
import { clearPendingCoupon, savePendingCoupon } from './cuponPendiente.ts';
import type { Key } from './i18n/index.ts';
import { useSignedIn } from './sesion.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from './ui.tsx';

// Invitación con un cupón (/invitacion/CODIGO, pedido de Claudia, 21/10): cada código de un lote
// trae su link. Muestra qué da el código y lleva a armar el regalo; el código queda guardado en
// este navegador y se suma solo al entrar o crear la cuenta (cuponPendiente.ts).

export function InvitationPage({ testnet, code }: { testnet: boolean; code: string }) {
  const { t, lang } = useI18n();
  const signedIn = useSignedIn();
  const [coupon, setCoupon] = useState<(CouponView & { paraUnMail: boolean }) | null>(null);
  const [problem, setProblem] = useState<Key | null>(null);
  const [redeemed, setRedeemed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `${t('invitacion.titulo')} · Regalale Bitcoin`;
    api
      .invitation(code)
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
        <StepTitle>{t('invitacion.titulo')}</StepTitle>
        <p>{t('invitacion.texto')}</p>
        {coupon !== null && (
          <div class="caja">
            <p class="invitacion-da">{t('invitacion.da', { codigo: coupon.codigo, que: what(coupon) })}</p>
            {coupon.paraUnMail && <p class="texto-suave">{t('invitacion.paraUnMail')}</p>}
            {!signedIn && <p class="texto-suave">{t('invitacion.guardado')}</p>}
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
