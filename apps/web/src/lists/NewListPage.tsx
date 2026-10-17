import { deriveListAddress, isCoreError, parseAccountKey } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import { accountApi, createAccess, signIn } from '../account.ts';
import { ApiFailure } from '../api.ts';
import { ALLOW_MAINNET } from '../config.ts';
import { OccasionPicker, type OccasionChoice } from '../content/OccasionPicker.tsx';
import { groupAddress } from '../format.ts';
import type { Key } from '../i18n/index.ts';
import { PasskeyError } from '../passkey.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from '../ui.tsx';
import { ALIAS, listApi, listUrl } from './listApi.ts';
import { useNetwork } from './useNetwork.ts';

// Armar una lista (/listas/nueva). Hace falta una cuenta (mail + passkey) para ver después
// quién regaló qué. La plata va directo a la billetera de quien arma la lista: pedimos la
// llave pública de su cuenta y le mostramos la primera dirección para que la compare con su
// billetera antes de publicar.

type Step = 'acceso' | 'datos' | 'llave' | 'lista';
const LIMITS = { title: 60, message: 280 } as const;

const XPUB_ERRORS: Readonly<Record<string, Key>> = {
  privada: 'lista.xpub.privada',
  generica: 'lista.xpub.generica',
  red: 'lista.xpub.red',
  profundidad: 'lista.xpub.profundidad',
  formato: 'lista.xpub.formato',
};

export function NewListPage() {
  const { t, lang } = useI18n();
  const { network, error: netError } = useNetwork();
  const [step, setStep] = useState<Step | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [title, setTitle] = useState('');
  const [occasion, setOccasion] = useState<OccasionChoice | null>(null);
  const [message, setMessage] = useState('');
  const [date, setDate] = useState('');
  const [pesos, setPesos] = useState(false);
  const [alias, setAlias] = useState('');
  const [holder, setHolder] = useState('');
  const [convert, setConvert] = useState(false);
  const [xpub, setXpub] = useState('');
  const [same, setSame] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    accountApi
      .me()
      .then(() => setStep('datos'))
      .catch(() => setStep('acceso'));
  }, []);

  // La primera dirección se calcula acá, en el navegador, a partir de la llave pegada.
  let first: string | null = null;
  let xpubError: Key | null = null;
  if (network !== null && xpub.trim() !== '') {
    try {
      first = deriveListAddress(parseAccountKey(xpub, network), 0).address;
    } catch (e) {
      const problem = isCoreError(e, 'INVALID_XPUB') ? ((e.details as { problem?: string } | undefined)?.problem ?? 'formato') : 'formato';
      xpubError = XPUB_ERRORS[problem] ?? 'lista.xpub.formato';
    }
  }

  const access = async (mode: 'crear' | 'entrar') => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'crear') await createAccess(email.trim(), lang);
      else await signIn();
      setStep('datos');
    } catch (e) {
      if (e instanceof PasskeyError) setError(e.kind === 'cancelada' ? 'guardar.cancelada' : e.kind === 'no_soportada' ? 'guardar.noSoportada' : 'guardar.passkeyInvalida');
      else if (e instanceof ApiFailure && e.code === 'cuenta_existente') setError('guardar.yaExiste');
      else setError('guardar.passkeyInvalida');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (first === null || occasion === null) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await listApi.create({
        titulo: title.trim(),
        ocasion: occasion.key,
        ...(occasion.key === 'otra' && occasion.free ? { ocasionLibre: occasion.free } : {}),
        mensaje: message.trim(),
        ...(date !== '' ? { fecha: date } : {}),
        idioma: lang,
        xpub: xpub.trim(),
        primeraDireccion: first,
        ...(pesos ? { alias: alias.trim().toLowerCase(), aliasTitular: holder.trim(), convertir: convert } : {}),
      });
      setCreated(id);
      setStep('lista');
    } catch (e) {
      setError(e instanceof ApiFailure && e.status === 401 ? 'lista.sesion' : 'lista.error');
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (netError) body = <Notice kind="error">{t('reclamo.sinRed')}</Notice>;
  else if (step === null || network === null) body = <p class="texto-suave cargando">{t('reclamo.cargando')}</p>;
  else if (step === 'acceso') {
    body = (
      <div class="paso">
        <StepTitle>{t('lista.nueva.titulo')}</StepTitle>
        <p>{t('lista.acceso.texto')}</p>
        <label class="campo">
          <span>{t('guardar.mail')}</span>
          <input type="email" autocomplete="email" value={email} onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <Button disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())} onClick={() => void access('crear')}>
          {t('guardar.crear')}
        </Button>
        <button type="button" class="boton-texto enlace-centrado" disabled={busy} onClick={() => void access('entrar')}>
          {t('guardar.yaTengo')}
        </button>
        {error !== null && <Notice kind="error">{t(error)}</Notice>}
      </div>
    );
  } else if (step === 'datos') {
    const aliasOk = ALIAS.test(alias.trim().toLowerCase());
    const pesosOk = !pesos || (aliasOk && holder.trim() !== '' && convert);
    const ok = title.trim() !== '' && [...title.trim()].length <= LIMITS.title && occasion !== null && [...message].length <= LIMITS.message && pesosOk;
    body = (
      <form
        class="paso"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) setStep('llave');
        }}
      >
        <StepTitle>{t('lista.nueva.titulo')}</StepTitle>
        <p class="texto-suave">{t('lista.nueva.texto')}</p>
        <label class="campo">
          <span>{t('lista.campo.titulo')}</span>
          <input type="text" value={title} maxLength={LIMITS.title} placeholder={t('lista.campo.tituloEj')} onInput={(e) => setTitle((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <fieldset class="campo">
          <legend>{t('lista.campo.ocasion')}</legend>
          <OccasionPicker value={occasion} onPick={setOccasion} />
        </fieldset>
        <label class="campo">
          <span>{t('lista.campo.mensaje')}</span>
          <textarea rows={3} value={message} maxLength={LIMITS.message} onInput={(e) => setMessage((e.currentTarget as HTMLTextAreaElement).value)} />
        </label>
        <label class="campo">
          <span>{t('lista.campo.fecha')}</span>
          <input type="date" value={date} onInput={(e) => setDate((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="casilla">
          <input type="checkbox" checked={pesos} onChange={(e) => setPesos((e.currentTarget as HTMLInputElement).checked)} />
          <span>{t('lista.pesos.activar')}</span>
        </label>
        {pesos && (
          <div class="caja lista-pesos">
            <p class="texto-suave">{t('lista.pesos.explica')}</p>
            <label class="campo">
              <span>{t('lista.pesos.alias')}</span>
              <input type="text" value={alias} maxLength={20} autocapitalize="none" spellcheck={false} placeholder="ana.leo.mp" onInput={(e) => setAlias((e.currentTarget as HTMLInputElement).value)} />
              {alias.trim() !== '' && !aliasOk && <small class="error-campo">{t('lista.pesos.aliasInvalido')}</small>}
            </label>
            <label class="campo">
              <span>{t('lista.pesos.titular')}</span>
              <input type="text" value={holder} maxLength={60} autocomplete="name" onInput={(e) => setHolder((e.currentTarget as HTMLInputElement).value)} />
            </label>
            <label class="casilla casilla-destacada">
              <input type="checkbox" checked={convert} onChange={(e) => setConvert((e.currentTarget as HTMLInputElement).checked)} />
              <span>{t('lista.pesos.compromiso')}</span>
            </label>
          </div>
        )}
        <Button type="submit" disabled={!ok}>
          {t('seguir')}
        </Button>
      </form>
    );
  } else if (step === 'llave') {
    body = (
      <div class="paso">
        <StepTitle>{t('lista.llave.titulo')}</StepTitle>
        <p>{t('lista.llave.texto')}</p>
        <ul class="lista-ayuda">
          <li>{t('lista.llave.ayudaBlue')}</li>
          <li>{t('lista.llave.ayudaSparrow')}</li>
        </ul>
        <Notice>{t('lista.llave.dedicada')}</Notice>
        <label class="campo">
          <span>{t(network.name === 'mainnet' ? 'lista.llave.campo' : 'lista.llave.campoPrueba')}</span>
          <textarea class="mono" rows={3} value={xpub} spellcheck={false} autocomplete="off" onInput={(e) => {
            setXpub((e.currentTarget as HTMLTextAreaElement).value);
            setSame(false);
          }} />
        </label>
        {xpubError !== null && <Notice kind="error">{t(xpubError)}</Notice>}
        {first !== null && (
          <div class="caja lista-primera">
            <p>{t('lista.llave.primera')}</p>
            <p class="mono direccion-completa" translate={false}>
              {groupAddress(first)}
            </p>
            <label class="casilla casilla-destacada">
              <input type="checkbox" checked={same} onChange={(e) => setSame((e.currentTarget as HTMLInputElement).checked)} />
              <span>{t('lista.llave.misma')}</span>
            </label>
          </div>
        )}
        {error !== null && <Notice kind="error">{t(error)}</Notice>}
        <Button disabled={busy || first === null || !same} onClick={() => void publish()}>
          {busy ? t('lista.publicando') : t('lista.publicar')}
        </Button>
        <button type="button" class="boton-texto enlace-centrado" onClick={() => setStep('datos')}>
          ← {t('atras')}
        </button>
      </div>
    );
  } else if (created !== null) {
    const url = listUrl(created);
    const share = t('lista.compartir.mensaje', { titulo: title.trim(), link: url });
    body = (
      <div class="paso">
        <StepTitle>{t('lista.lista.titulo')}</StepTitle>
        <p>{t('lista.lista.texto')}</p>
        <p class="mono enlace-regalo" translate={false}>
          {url}
        </p>
        <div class="botones-copiar">
          <a class="boton boton-primario" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          <Button
            kind="contorno"
            onClick={() =>
              void navigator.clipboard.writeText(url).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              })
            }
          >
            {copied ? t('regalar.pagar.copiado') : t('lista.copiar')}
          </Button>
        </div>
        <a class="boton boton-contorno" href="/panel">
          {t('lista.verPanel')}
        </a>
      </div>
    );
  }
  return <Layout testnet={network === null ? !ALLOW_MAINNET : network.name !== 'mainnet'}>{body}</Layout>;
}
