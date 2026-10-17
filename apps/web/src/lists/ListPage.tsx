import { useEffect, useState } from 'preact/hooks';
import { ApiFailure } from '../api.ts';
import { ALLOW_MAINNET } from '../config.ts';
import { GiftCardArt } from '../content/GiftCardArt.tsx';
import { deckPick, fillName, loadExamples } from '../content/mensajes.ts';
import { occasionLabel } from '../content/occasions.ts';
import { formatArsExact, formatSats, groupAddress, parseAmount, paymentUri, satsToBtcString } from '../format.ts';
import { AmountStep } from '../give/DraftSteps.tsx';
import type { Draft } from '../give/GivePage.tsx';
import { PayBox } from '../give/PayBox.tsx';
import type { Key } from '../i18n/index.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from '../ui.tsx';
import { contributionUrl, listApi, type PublicList } from './listApi.ts';
import { useNetwork } from './useNetwork.ts';

// La lista vista por un invitado (/l/<id>): la tarjeta de la lista, cuánto regalar, nombre y
// mensaje opcionales, y la dirección propia para pagar. Nunca ve los aportes de los demás.

type Amount = Pick<Draft, 'currency' | 'amount' | 'sats'>;
type Step = 'lista' | 'cuanto' | 'firma' | 'pagar' | 'pesos' | 'transferir';
type Announced = { codigo: string; alias: string; titular: string; monto: number; token: string };
const POLL_MS = 5_000;
/** Sugeridos en listas con billetera propia (sin tope); "Otro" deja poner cualquier monto. */
const LIST_PRESETS_USD = [50, 100, 150] as const;

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
  const [ars, setArs] = useState('');
  const [announced, setAnnounced] = useState<Announced | null>(null);

  useEffect(() => {
    listApi
      .get(id)
      .then(setList)
      .catch(() => setMissing(true));
  }, [id]);

  // El mensaje viene cargado con el próximo ejemplo del mazo de la lista (editable).
  const [example, setExample] = useState<string | null>(null);
  useEffect(() => {
    if (list === null || !list.abierta) return;
    void Promise.all([loadExamples(lang), listApi.turn(id)])
      .then(([ex, { turno }]) => {
        const set = ex[list.varios ? 'listas_varios' : 'listas_uno'] as { mensajes?: readonly string[] } | undefined;
        const pick = deckPick(set?.mensajes ?? [], id, turno);
        if (pick === undefined) return;
        const filled = fillName(pick, list.para ?? list.titulo, list.titulo);
        setExample(filled);
        setMessage((m) => (m === '' ? filled : m));
      })
      .catch(() => undefined);
  }, [list?.id, lang]);

  // Mientras espera el pago, consulta el estado de su propio aporte.
  useEffect(() => {
    if (pay === null || state === 'recibido') return;
    const timer = window.setInterval(() => {
      listApi
        .mine(pay.token)
        .then((m) => {
          if (m.tipo === 'bitcoin') setState(m.estado);
        })
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

  const arsParsed = parseAmount(ars, lang, 2);
  const arsAmount = arsParsed.ok && arsParsed.value > 0n ? Number(arsParsed.value) / 100 : null;

  const announce = async () => {
    if (arsAmount === null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await listApi.announce(id, {
        ...(name.trim() !== '' ? { nombre: name.trim() } : {}),
        ...(message.trim() !== '' ? { mensaje: message.trim() } : {}),
        monto: arsAmount,
      });
      setAnnounced(r);
      setStep('transferir');
    } catch (e) {
      const code = e instanceof ApiFailure ? e.code : '';
      setError(code === 'monto_invalido' ? 'regalar.errorMonto' : code === 'demasiados_pedidos' ? 'regalar.demasiados' : code === 'lista_cerrada' ? 'lista.cerrada' : 'regalar.error');
    } finally {
      setBusy(false);
    }
  };

  const privateLink = (token: string) => {
    const mine = contributionUrl(token);
    return (
      <div class="caja">
        <p>{t('lista.mio.guardar')}</p>
        <p class="mono enlace-regalo" translate={false}>
          {mine}
        </p>
        <Button kind="contorno" onClick={() => void copy('mio', mine)}>
          {copied === 'mio' ? t('regalar.pagar.copiado') : t('lista.copiar')}
        </Button>
      </div>
    );
  };

  const signFields = (
    <>
      <label class="campo">
        <span>{t('lista.firma.nombre')}</span>
        <input type="text" maxLength={40} autocomplete="name" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <label class="campo">
        <span>{t('lista.firma.mensaje')}</span>
        <textarea rows={3} maxLength={280} value={message} onInput={(e) => setMessage((e.currentTarget as HTMLTextAreaElement).value)} />
        {example !== null && message === example && <small class="texto-suave">{t('regalar.mensaje.empujoncito')}</small>}
      </label>
      <small class="texto-suave">{t('lista.firma.privado')}</small>
    </>
  );

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
        {!list.abierta ? (
          <Notice>{t('lista.cerrada')}</Notice>
        ) : list.aceptaPesos ? (
          <div class="lista-metodos">
            <Button onClick={() => setStep('cuanto')}>{t('lista.metodo.bitcoin')}</Button>
            <Button kind="contorno" onClick={() => setStep('pesos')}>
              {t('lista.metodo.pesos')}
            </Button>
            <small class="texto-suave">{t('lista.metodo.pesosTexto')}</small>
          </div>
        ) : (
          <Button onClick={() => setStep('cuanto')}>{t('lista.invitado.cta')}</Button>
        )}
      </div>
    );
  } else if (step === 'cuanto') {
    body = (
      <AmountStep
        draft={{} as Draft}
        error={error}
        ceilingUsd={list.topeUsd === null ? null : Math.min(ceilingUsd, list.topeUsd)}
        {...(list.topeUsd === null ? { presets: LIST_PRESETS_USD } : {})}
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
        {signFields}
        {error !== null && <Notice kind="error">{t(error)}</Notice>}
        <Button type="submit" disabled={busy}>
          {busy ? t('regalar.creando') : t('lista.firma.cta', { monto: formatSats(amount?.sats ?? 0n, lang) })}
        </Button>
      </form>
    );
  } else if (step === 'pesos') {
    body = (
      <form
        class="paso"
        onSubmit={(e) => {
          e.preventDefault();
          void announce();
        }}
      >
        <StepTitle>{t('lista.pesos.titulo')}</StepTitle>
        <p class="texto-suave">{t('lista.pesos.invitadoTexto')}</p>
        <label class="campo">
          <span>{t('lista.pesos.monto')}</span>
          <input type="text" inputMode="decimal" autocomplete="off" value={ars} onInput={(e) => setArs((e.currentTarget as HTMLInputElement).value)} />
          {ars.trim() !== '' && arsAmount === null && <small class="error-campo">{t('regalar.errorMonto')}</small>}
        </label>
        {signFields}
        {error !== null && <Notice kind="error">{t(error)}</Notice>}
        <Button type="submit" disabled={busy || arsAmount === null}>
          {busy ? t('regalar.creando') : arsAmount === null ? t('lista.pesos.cta0') : t('lista.pesos.cta', { monto: formatArsExact(arsAmount, lang) })}
        </Button>
      </form>
    );
  } else if (step === 'transferir' && announced !== null) {
    const rows: readonly { k: string; label: Key; value: string; shown?: string }[] = [
      { k: 'alias', label: 'lista.pesos.alias', value: announced.alias },
      { k: 'titular', label: 'lista.pesos.titular', value: announced.titular },
      { k: 'monto', label: 'lista.pesos.monto', value: announced.monto.toFixed(2), shown: formatArsExact(announced.monto, lang) },
      { k: 'codigo', label: 'lista.pesos.codigo', value: announced.codigo },
    ];
    body = (
      <div class="paso">
        <StepTitle>{t('lista.pesos.transferiTitulo')}</StepTitle>
        <p class="texto-suave">{t('lista.pesos.transferiTexto')}</p>
        <dl class="caja datos-transferencia">
          {rows.map((r) => (
            <div key={r.k} class="dato-transferencia">
              <dt>{t(r.label)}</dt>
              <dd class={r.k === 'titular' ? '' : 'mono'} translate={false}>
                {r.shown ?? r.value}
              </dd>
              <button type="button" class="boton boton-contorno boton-chico" onClick={() => void copy(r.k, r.value)}>
                {copied === r.k ? t('regalar.pagar.copiado') : t('regalar.mandar.copiar')}
              </button>
            </div>
          ))}
        </dl>
        <Notice>{t('lista.pesos.codigoAviso', { codigo: announced.codigo })}</Notice>
        {privateLink(announced.token)}
      </div>
    );
  } else if (pay !== null) {
    body = (
      <div class="paso">
        {state === 'esperando' ? (
          <>
            <StepTitle>{t('regalar.pagar.titulo', { monto: formatSats(pay.sats, lang) })}</StepTitle>
            <p class="texto-suave">{t('lista.pagar.texto')}</p>
            <PayBox address={pay.direccion} sats={pay.sats} network={network.name} />
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
        {privateLink(pay.token)}
      </div>
    );
  }
  return (
    <Layout
      testnet={network === null ? !ALLOW_MAINNET : network.name !== 'mainnet'}
      onBack={step === 'cuanto' || step === 'pesos' ? () => setStep('lista') : step === 'firma' ? () => setStep('cuanto') : undefined}
    >
      {body}
    </Layout>
  );
}
