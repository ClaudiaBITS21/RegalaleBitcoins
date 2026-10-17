import { useEffect, useState } from 'preact/hooks';
import { ApiFailure } from '../api.ts';
import { ALLOW_MAINNET } from '../config.ts';
import { GiftCardArt } from '../content/GiftCardArt.tsx';
import { occasionLabel } from '../content/occasions.ts';
import { formatSats, groupAddress, paymentUri, satsToBtcString } from '../format.ts';
import { AmountStep } from '../give/DraftSteps.tsx';
import type { Draft } from '../give/GivePage.tsx';
import { Qr } from '../give/Qr.tsx';
import type { Key } from '../i18n/index.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from '../ui.tsx';
import { contributionUrl, listApi, type PublicList } from './listApi.ts';
import { useNetwork } from './useNetwork.ts';

// La lista vista por un invitado (/l/<id>): la tarjeta de la lista, cuánto regalar, nombre y
// mensaje opcionales, y la dirección propia para pagar. Nunca ve los aportes de los demás.

type Amount = Pick<Draft, 'currency' | 'amount' | 'sats'>;
type Step = 'lista' | 'cuanto' | 'firma' | 'pagar';
const POLL_MS = 5_000;

export function ListPage({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const { network, ceilingUsd } = useNetwork();
  const [list, setList] = useState<PublicList | null>(null);
  const [missing, setMissing] = useState(false);
  const [step, setStep] = useState<Step>('lista');
  const [amount, setAmount] = useState<Amount | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [pay, setPay] = useState<{ direccion: string; sats: bigint; token: string } | null>(null);
  const [state, setState] = useState<'esperando' | 'en_la_red' | 'recibido'>('esperando');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    listApi
      .get(id)
      .then(setList)
      .catch(() => setMissing(true));
  }, [id]);

  // Mientras espera el pago, consulta el estado de su propio aporte.
  useEffect(() => {
    if (pay === null || state === 'recibido') return;
    const timer = window.setInterval(() => {
      listApi
        .mine(pay.token)
        .then((m) => setState(m.estado))
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [pay, state]);

  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Sin portapapeles: el texto queda visible para copiarlo a mano.
    }
  };

  const confirm = async () => {
    if (amount === null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await listApi.contribute(id, {
        ...(name.trim() !== '' ? { nombre: name.trim() } : {}),
        ...(message.trim() !== '' ? { mensaje: message.trim() } : {}),
        moneda: amount.currency,
        monto: amount.amount,
        sats: amount.sats.toString(),
      });
      setPay({ direccion: r.direccion, sats: BigInt(r.sats), token: r.token });
      setStep('pagar');
    } catch (e) {
      const code = e instanceof ApiFailure ? e.code : '';
      setError(code === 'monto_invalido' ? 'regalar.errorMonto' : code === 'demasiados_pedidos' ? 'regalar.demasiados' : code === 'lista_cerrada' ? 'lista.cerrada' : 'regalar.error');
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (missing) body = <Notice kind="error">{t('lista.noExiste')}</Notice>;
  else if (list === null || network === null) body = <p class="texto-suave cargando">{t('reclamo.cargando')}</p>;
  else if (step === 'lista') {
    body = (
      <div class="paso">
        <article class="tarjeta">
          <GiftCardArt occasion={list.ocasion} variant={2} class="tarjeta-imagen" />
          <div class="tarjeta-texto">
            <p class="kicker tarjeta-ocasion">{occasionLabel(list.ocasion, lang, list.ocasionLibre)}</p>
            <StepTitle>{list.titulo}</StepTitle>
            {list.mensaje !== '' && <p class="texto-suave">{list.mensaje}</p>}
            {list.fecha !== null && <p class="texto-suave">{new Date(`${list.fecha}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
          </div>
        </article>
        <p class="texto-suave">{t('lista.invitado.texto')}</p>
        {list.abierta ? <Button onClick={() => setStep('cuanto')}>{t('lista.invitado.cta')}</Button> : <Notice>{t('lista.cerrada')}</Notice>}
      </div>
    );
  } else if (step === 'cuanto') {
    body = (
      <AmountStep
        draft={{} as Draft}
        error={error}
        ceilingUsd={Math.min(ceilingUsd, list.topeUsd)}
        onNext={(a) => {
          setAmount(a);
          setError(null);
          setStep('firma');
        }}
      />
    );
  } else if (step === 'firma') {
    body = (
      <form
        class="paso"
        onSubmit={(e) => {
          e.preventDefault();
          void confirm();
        }}
      >
        <StepTitle>{t('lista.firma.titulo')}</StepTitle>
        <label class="campo">
          <span>{t('lista.firma.nombre')}</span>
          <input type="text" maxLength={40} autocomplete="name" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="campo">
          <span>{t('lista.firma.mensaje')}</span>
          <textarea rows={3} maxLength={280} value={message} onInput={(e) => setMessage((e.currentTarget as HTMLTextAreaElement).value)} />
        </label>
        <small class="texto-suave">{t('lista.firma.privado')}</small>
        {error !== null && <Notice kind="error">{t(error)}</Notice>}
        <Button type="submit" disabled={busy}>
          {busy ? t('regalar.creando') : t('lista.firma.cta', { monto: formatSats(amount?.sats ?? 0n, lang) })}
        </Button>
      </form>
    );
  } else if (pay !== null) {
    const mine = contributionUrl(pay.token);
    body = (
      <div class="paso">
        {state === 'esperando' ? (
          <>
            <StepTitle>{t('regalar.pagar.titulo', { monto: formatSats(pay.sats, lang) })}</StepTitle>
            <p class="texto-suave">{t('lista.pagar.texto')}</p>
            <div class="pago">
              <Qr text={paymentUri(pay.direccion, pay.sats)} label={t('regalar.pagar.qr')} />
              <p class="monto-btc">
                <strong>{satsToBtcString(pay.sats)} BTC</strong>
                {network.name !== 'mainnet' && <span class="texto-suave"> ({network.name})</span>}
              </p>
              <p class="mono direccion-completa" translate={false}>
                {groupAddress(pay.direccion)}
              </p>
              <div class="botones-copiar">
                <Button kind="contorno" onClick={() => void copy('direccion', pay.direccion)}>
                  {copied === 'direccion' ? t('regalar.pagar.copiado') : t('regalar.pagar.copiarDireccion')}
                </Button>
                <Button kind="contorno" onClick={() => void copy('monto', satsToBtcString(pay.sats))}>
                  {copied === 'monto' ? t('regalar.pagar.copiado') : t('regalar.pagar.copiarMonto')}
                </Button>
              </div>
            </div>
            <p class="esperando" role="status">
              {t('regalar.pagar.esperando')}
            </p>
          </>
        ) : (
          <>
            <StepTitle>{t('lista.gracias.titulo')}</StepTitle>
            <Notice kind="ok">{t(state === 'recibido' ? 'lista.gracias.confirmado' : 'lista.gracias.enCamino')}</Notice>
          </>
        )}
        <div class="caja">
          <p>{t('lista.mio.guardar')}</p>
          <p class="mono enlace-regalo" translate={false}>
            {mine}
          </p>
          <Button kind="contorno" onClick={() => void copy('mio', mine)}>
            {copied === 'mio' ? t('regalar.pagar.copiado') : t('lista.copiar')}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <Layout
      testnet={network === null ? !ALLOW_MAINNET : network.name !== 'mainnet'}
      onBack={step === 'cuanto' ? () => setStep('lista') : step === 'firma' ? () => setStep('cuanto') : undefined}
    >
      {body}
    </Layout>
  );
}
