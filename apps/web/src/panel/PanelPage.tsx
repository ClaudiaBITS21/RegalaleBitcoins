import { deriveGift, encodeGiftFragment, getNetwork, masterRootFromMnemonic, type Network } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import { accountApi, type AccountView, signIn } from '../account.ts';
import { ApiFailure, api } from '../api.ts';
import { ALLOW_MAINNET } from '../config.ts';
import { MyLists } from '../lists/MyLists.tsx';
import { occasionLabel } from '../content/occasions.ts';
import { formatSats } from '../format.ts';
import type { Key } from '../i18n/index.ts';
import { PasskeyError } from '../passkey.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from '../ui.tsx';

// Panel de quien regala: sus regalos con el estado que calcula el servidor desde la
// cadena. Para volver a ver un link y sus palabras, o el código de recuperación, se abre la
// bóveda con la passkey: todo se calcula acá, en el navegador.

const STATE_KEYS: Readonly<Record<string, Key>> = {
  esperando: 'panel.estado.esperando',
  en_la_red: 'panel.estado.en_la_red',
  activo: 'panel.estado.activo',
  reclamo_programado: 'panel.estado.reclamo_programado',
  reclamado: 'panel.estado.reclamado',
  recuperado: 'panel.estado.recuperado',
  retirado: 'panel.estado.retirado',
};

/** Lee y borra el token de acceso del link del mail (#acceso=…): queda solo en memoria. */
function readAccessToken(): string | null {
  const m = /^#acceso=([A-Za-z0-9_-]{43})$/.exec(window.location.hash);
  if (m === null) return null;
  history.replaceState(null, '', window.location.pathname);
  return m[1] as string;
}

export function PanelPage() {
  const { t, lang } = useI18n();
  const [view, setView] = useState<AccountView | null>(null);
  const [state, setState] = useState<'cargando' | 'afuera' | 'adentro' | 'sin_red'>('cargando');
  const [network, setNetwork] = useState<Network | null>(null);
  const [master, setMaster] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [email, setEmail] = useState('');
  const [mailSent, setMailSent] = useState(false);

  const load = async () => {
    try {
      setView(await accountApi.me());
      setState('adentro');
    } catch (e) {
      setState(e instanceof ApiFailure && e.status === 401 ? 'afuera' : 'sin_red');
    }
  };

  useEffect(() => {
    const token = readAccessToken();
    void (async () => {
      try {
        const { red } = await api.health();
        setNetwork(getNetwork(red, { allowMainnet: ALLOW_MAINNET }));
      } catch {
        // Sin red no se pueden armar links; el resto del panel funciona igual.
      }
      if (token !== null) {
        try {
          await accountApi.redeemLink(token);
        } catch {
          setError('panel.linkVencido');
        }
      }
      await load();
    })();
  }, []);

  /** Abre la bóveda con la passkey (y de paso renueva la sesión). */
  const unlock = async (): Promise<string | null> => {
    if (master !== null) return master;
    setBusy(true);
    setError(null);
    try {
      const allow = view?.credenciales.map((c) => c.id);
      const res = await signIn(allow);
      if (res.master === null) {
        setError('panel.sinBoveda');
        return null;
      }
      setMaster(res.master);
      return res.master;
    } catch (e) {
      setError(e instanceof PasskeyError && e.kind === 'cancelada' ? 'guardar.cancelada' : 'guardar.passkeyInvalida');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const signInHere = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await signIn();
      if (res.master !== null) setMaster(res.master);
      await load();
    } catch (e) {
      setError(e instanceof PasskeyError && e.kind === 'cancelada' ? 'guardar.cancelada' : 'guardar.passkeyInvalida');
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (state === 'cargando') body = <p class="texto-suave cargando">{t('reclamo.cargando')}</p>;
  else if (state === 'sin_red') {
    body = (
      <div class="paso">
        <StepTitle>{t('reclamo.sinRed')}</StepTitle>
        <Button onClick={() => void load()}>{t('reintentar')}</Button>
      </div>
    );
  } else if (state === 'afuera') {
    body = (
      <div class="paso">
        <StepTitle>{t('panel.entrarTitulo')}</StepTitle>
        <p class="texto-suave">{t('panel.entrarTexto')}</p>
        <Button disabled={busy} onClick={() => void signInHere()}>
          {busy ? t('guardar.esperando') : t('guardar.entrar')}
        </Button>
        <form
          class="caja formulario"
          onSubmit={(e) => {
            e.preventDefault();
            void accountApi.sendLink(email.trim()).then(
              () => setMailSent(true),
              () => setError('panel.mailError'),
            );
          }}
        >
          <strong>{t('panel.linkTitulo')}</strong>
          <label class="campo">
            <span>{t('guardar.mail')}</span>
            <input type="email" autocomplete="email" value={email} onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <Button kind="contorno" type="submit" disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}>
            {t('panel.linkBoton')}
          </Button>
          {mailSent && <Notice kind="ok">{t('panel.linkEnviado')}</Notice>}
        </form>
        {error !== null && <Notice kind="error">{t(error)}</Notice>}
      </div>
    );
  } else if (view !== null) {
    body = (
      <div class="paso panel">
        <StepTitle>{t('panel.titulo')}</StepTitle>
        <p class="texto-suave">{t('panel.cuenta', { email: view.email })}</p>
        {error !== null && <Notice kind="error">{t(error)}</Notice>}
        {view.regalos.length === 0 ? (
          <div class="caja">
            <p>{t('panel.vacio')}</p>
            <a class="boton boton-primario" href="/regalar">
              {t('home.regalar')}
            </a>
          </div>
        ) : (
          <ul class="lista-regalos">
            {view.regalos.map((g) => {
              const isOpen = open === g.id && master !== null && network !== null && g.indice !== null;
              const derived = isOpen ? deriveGift(masterRoot(master as string), g.indice as number, g.idioma, network as Network) : null;
              const sats = g.sats !== null && g.sats !== '0' ? BigInt(g.sats) : g.satsEsperados !== null ? BigInt(g.satsEsperados) : null;
              return (
                <li class="regalo-item" key={g.id}>
                  <div class="regalo-cabecera">
                    <strong>{t('panel.para', { para: g.para })}</strong>
                    <span class={`estado estado-${g.estado ?? 'desconocido'}`}>{g.estado === null ? '—' : t(STATE_KEYS[g.estado] ?? 'panel.estado.esperando')}</span>
                  </div>
                  <span class="texto-suave">
                    {occasionLabel(g.ocasion, lang, g.ocasionLibre)} · {new Date(g.creado).toLocaleDateString(lang)}
                    {sats !== null ? ` · ${formatSats(sats, lang)}` : ''}
                  </span>
                  {g.indice !== null && (g.estado === 'esperando' || g.estado === 'en_la_red' || g.estado === 'activo') && (
                    <Button
                      kind="contorno"
                      disabled={busy}
                      onClick={async () => {
                        if (open === g.id) return setOpen(null);
                        if ((await unlock()) !== null) setOpen(g.id);
                      }}
                    >
                      {t(open === g.id ? 'panel.ocultar' : 'panel.verLink')}
                    </Button>
                  )}
                  {derived !== null && (
                    <div class="regalo-secretos">
                      <p class="mono enlace-regalo" translate={false}>
                        {`${window.location.origin}/r/${g.id}#${encodeGiftFragment(derived.entropy)}`}
                      </p>
                      <ol class="palabras-regalo" translate={false}>
                        {derived.passphraseWords.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ol>
                      <small class="texto-suave">{t('regalar.mandar.palabrasTexto')}</small>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <MyLists network={network} />
        <div class="caja">
          <strong>{t('regalar.codigo.titulo')}</strong>
          <p class="texto-suave">{t('regalar.codigo.texto1')}</p>
          {showCode && master !== null ? (
            <>
              <ol class="codigo" translate={false}>
                {master.split(' ').map((w, i) => (
                  <li key={i}>
                    <span class="codigo-n">{i + 1}</span> {w}
                  </li>
                ))}
              </ol>
              <ul class="lista-avisos">
                <li>{t('regalar.codigo.texto2')}</li>
                <li>{t('regalar.codigo.texto3')}</li>
                <li>
                  <strong>{t('regalar.codigo.texto4')}</strong>
                </li>
              </ul>
              <Button kind="contorno" onClick={() => setShowCode(false)}>
                {t('panel.ocultar')}
              </Button>
            </>
          ) : (
            <Button
              kind="contorno"
              disabled={busy}
              onClick={async () => {
                if ((await unlock()) !== null) setShowCode(true);
              }}
            >
              {t('panel.verCodigo')}
            </Button>
          )}
        </div>
        <button
          type="button"
          class="boton-texto enlace-centrado"
          onClick={async () => {
            await accountApi.logout().catch(() => null);
            setMaster(null);
            setView(null);
            setState('afuera');
          }}
        >
          {t('panel.salir')}
        </button>
      </div>
    );
  }

  return <Layout testnet={network === null ? !ALLOW_MAINNET : network.name !== 'mainnet'}>{body}</Layout>;
}

const roots = new Map<string, ReturnType<typeof masterRootFromMnemonic>>();
/** La raíz BIP32 cuesta calcularla: se guarda en memoria mientras dura la página. */
function masterRoot(mnemonic: string) {
  let r = roots.get(mnemonic);
  if (r === undefined) {
    r = masterRootFromMnemonic(mnemonic);
    roots.set(mnemonic, r);
  }
  return r;
}
