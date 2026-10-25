import { deriveGift, encodeGiftFragment, getNetwork, masterRootFromMnemonic, type Network } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import { numberedWords, WordsList } from '../give/WordsList.tsx';
import { accessErrorCode, accessErrorKey, accountApi, type AccountView, canRepairVault, RepairError, repairVault, signIn } from '../account.ts';
import { ApiFailure, api, type GiftView } from '../api.ts';
import { ALLOW_MAINNET } from '../config.ts';
import { MyLists } from '../lists/MyLists.tsx';
import { MyPlan } from './MyPlan.tsx';
import { reminderText } from './recordatorio.ts';
import { type Channel, readSent } from '../give/envios.ts';
import { occasionLabel } from '../content/occasions.ts';
import { GiftCardArt } from '../content/GiftCardArt.tsx';
import { PrintCard } from '../give/PrintCard.tsx';
import { useCardFeature } from '../give/planFeatures.ts';
import { VincularCelu } from './VincularCelu.tsx';
import { filterGifts, GIFT_ORDERS, type GiftOrder, sortGifts } from './orden.ts';
import { formatChange, formatSats, formatValue } from '../format.ts';
import { giftValue } from './valor.ts';
import type { Key } from '../i18n/index.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from '../ui.tsx';
import { RecoverWithWallet, RecoverySettings } from '../recupero/Recuperar.tsx';

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

// Vista de «Mis regalos» (Rodolfo, 21/10): tarjetas en dos columnas por defecto, o lista. Se
// recuerda en este navegador.
const VIEW_KEY = 'regalale.panel.vista';
function readView(): 'tarjetas' | 'lista' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'lista' ? 'lista' : 'tarjetas';
  } catch {
    return 'tarjetas';
  }
}
function saveView(v: 'tarjetas' | 'lista') {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    // Sin almacenamiento, la vista vuelve a la de siempre la próxima vez.
  }
}

/** Lee y borra el token de acceso del link del mail (#acceso=…): queda solo en memoria. */
function readAccessToken(): string | null {
  const m = /^#acceso=([A-Za-z0-9_-]{43})$/.exec(window.location.hash);
  if (m === null) return null;
  history.replaceState(null, '', window.location.pathname);
  return m[1] as string;
}

export function PanelPage() {
  const { t, lang, trato } = useI18n();
  const [view, setView] = useState<AccountView | null>(null);
  const [state, setState] = useState<'cargando' | 'afuera' | 'adentro' | 'sin_red'>('cargando');
  const [network, setNetwork] = useState<Network | null>(null);
  const [master, setMaster] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [reminder, setReminder] = useState<string | null>(null);
  // Recupero avanzado: el regalo que se está recuperando con la billetera propia (PSBT).
  const [recovering, setRecovering] = useState<string | null>(null);
  const [advancedAvailable, setAdvancedAvailable] = useState(false);
  const [copied, setCopied] = useState(false);
  // Link y palabras se copian por separado: nunca van en el mismo mensaje.
  const [copiedSecret, setCopiedSecret] = useState<'link' | 'palabras' | null>(null);
  const copySecret = async (text: string, which: 'link' | 'palabras') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSecret(which);
    } catch {
      // Quedan a la vista para copiarlos a mano.
    }
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [email, setEmail] = useState('');
  const [mailSent, setMailSent] = useState(false);
  // Abrir con las 12 palabras cuando la passkey (por QR) no abre la bóveda.
  const [words, setWords] = useState('');
  const [repairProblem, setRepairProblem] = useState<Key | null>(null);
  const [repaired, setRepaired] = useState(false);
  const repair = async () => {
    if (view === null || network === null) return;
    setBusy(true);
    setRepairProblem(null);
    try {
      setMaster(await repairVault(words, view.regalos, network));
      setWords('');
      setError(null);
      setRepaired(true);
    } catch (e) {
      setRepairProblem(e instanceof RepairError ? (`panel.reparar.${e.problem}` as Key) : 'panel.mailError');
    } finally {
      setBusy(false);
    }
  };
  const [layout, setLayout] = useState(readView);
  const [order, setOrder] = useState<GiftOrder>('fecha');
  const [query, setQuery] = useState('');
  // La tarjeta imprimible de un regalo: se arma con el link (bóveda) y los datos públicos del regalo.
  const [card, setCard] = useState<GiftView | null>(null);
  const [cardFailed, setCardFailed] = useState<string | null>(null);
  const conPlan = useCardFeature();

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
        const { red, recuperoAvanzado } = await api.health();
        setNetwork(getNetwork(red, { allowMainnet: ALLOW_MAINNET }));
        setAdvancedAvailable(recuperoAvanzado === true);
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
      setError(accessErrorKey(e));
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
      setError(accessErrorKey(e));
      // Entró pero la bóveda no abrió (passkey por QR): la sesión está abierta, se muestra el panel.
      if (canRepairVault()) await load();
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
        {error !== null && <Notice kind="error">{t(error)}
            {accessErrorCode(error)}
          </Notice>}
      </div>
    );
  } else if (view !== null) {
    body = (
      <div class="paso panel">
        <StepTitle>{t('panel.titulo')}</StepTitle>
        <p class="texto-suave">{t('panel.cuenta', { email: view.email })}</p>
        {error !== null && <Notice kind="error">{t(error)}
            {accessErrorCode(error)}
          </Notice>}
        {error === 'guardar.bovedaOtroDispositivo' && canRepairVault() && network !== null && (
          <>
            <VincularCelu
              gifts={view.regalos}
              network={network}
              onMaster={(m) => {
                setMaster(m);
                setError(null);
                setRepaired(true);
              }}
            />
            <details class="reparar-otra-forma">
              <summary>{t('panel.reparar.otraForma')}</summary>
          <form
            class="caja formulario reparar-boveda"
            onSubmit={(e) => {
              e.preventDefault();
              void repair();
            }}
          >
            <strong>{t('panel.reparar.titulo')}</strong>
            <p class="texto-suave">{t('panel.reparar.texto')}</p>
            <label class="campo">
              <span>{t('panel.reparar.campo')}</span>
              <textarea rows={3} autocomplete="off" autocapitalize="none" spellcheck={false} translate={false} value={words} onInput={(e) => setWords((e.currentTarget as HTMLTextAreaElement).value)} />
            </label>
            {repairProblem !== null && <Notice kind="error">{t(repairProblem)}</Notice>}
            <Button type="submit" disabled={busy || words.trim() === ''}>
              {t('panel.reparar.boton')}
            </Button>
          </form>
            </details>
          </>
        )}
        {repaired && <Notice kind="ok">{t('panel.reparar.listo')}</Notice>}
        {view.regalos.length === 0 ? (
          <div class="caja">
            <p>{t('panel.vacio')}</p>
            <a class="boton boton-primario" href="/regalar">
              {t('home.regalar')}
            </a>
          </div>
        ) : (
          <>
            <div class="regalos-barra">
              <label class="campo regalos-buscar">
                <span class="solo-lector">{t('panel.buscar')}</span>
                <input type="search" placeholder={t('panel.buscar')} value={query} onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
              </label>
              <label class="regalos-orden">
                <span>{t('panel.ordenar')}</span>
                <select value={order} onChange={(e) => setOrder((e.currentTarget as HTMLSelectElement).value as GiftOrder)}>
                  {GIFT_ORDERS.map((o) => (
                    <option key={o} value={o}>
                      {t(`panel.orden.${o}` as Key)}
                    </option>
                  ))}
                </select>
              </label>
              <div class="regalos-vista" role="group" aria-label={t('panel.vista')}>
                {(['tarjetas', 'lista'] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={layout === v} onClick={() => (setLayout(v), saveView(v))}>
                    {t(`panel.vista.${v}` as Key)}
                  </button>
                ))}
              </div>
            </div>
            {(() => {
              const shown = sortGifts(filterGifts(view.regalos, query), order, (g) => occasionLabel(g.ocasion, lang, g.ocasionLibre), lang);
              if (shown.length === 0) return <p class="texto-suave">{t('panel.sinResultados')}</p>;
              return (
          <ul class={`lista-regalos regalos-${layout}`}>
            {shown.map((g) => {
              const canDerive = master !== null && network !== null && g.indice !== null;
              const derived = canDerive && (open === g.id || reminder === g.id || card?.id === g.id) ? deriveGift(masterRoot(master), g.indice as number, g.idioma, network) : null;
              const link = derived === null ? null : `${window.location.origin}/r/${g.id}#${encodeGiftFragment(derived.entropy)}`;
              const pending = g.estado === 'esperando' || g.estado === 'en_la_red' || g.estado === 'activo';
              const sats = g.sats !== null && g.sats !== '0' ? BigInt(g.sats) : g.satsEsperados !== null ? BigInt(g.satsEsperados) : null;
              const expanded = open === g.id || reminder === g.id || card?.id === g.id || cardFailed === g.id || recovering === g.id;
              return (
                <li class={`regalo-item${expanded ? ' expandido' : ''}`} key={g.id}>
                  <GiftCardArt class="regalo-miniatura" occasion={g.ocasion} estilo={g.estilo} src={g.estilo === 'propia' ? `/api/gifts/${g.id}/imagen` : null} />
                  <div class="regalo-datos">
                    <div class="regalo-cabecera">
                      <strong>{t('panel.para', { para: g.para })}</strong>
                      <span class={`estado estado-${g.estado ?? 'desconocido'}`}>{g.estado === null ? '—' : t(STATE_KEYS[g.estado] ?? 'panel.estado.esperando')}</span>
                    </div>
                    <span class="regalo-motivo">{occasionLabel(g.ocasion, lang, g.ocasionLibre)}</span>
                    <span class="texto-suave">
                      {new Date(g.creado).toLocaleDateString(lang)}
                      {sats !== null ? ` · ${formatSats(sats, lang)}` : ''}
                    </span>
                    {(() => {
                      const v = giftValue(sats, g.original ?? null, view.cotizacion ?? { usdPorBtc: null, arsPorBtc: null });
                      if (v === null) return null;
                      return (
                        <span class="regalo-valor">
                          {t('panel.hoy', { valor: formatValue(v.hoy, v.moneda, lang) })}
                          {v.variacion !== null && <span class={v.variacion >= 0 ? 'variacion sube' : 'variacion baja'}> ({formatChange(v.variacion, lang)})</span>}
                        </span>
                      );
                    })()}
                    {g.abierto !== null && <span class="texto-suave">{t('panel.abierto', { dia: new Date(g.abierto).toLocaleDateString(lang) })}</span>}
                  </div>
                  <div class="regalo-acciones">
                  {g.indice !== null && (
                    <Button
                      kind="contorno"
                      disabled={busy}
                      onClick={async () => {
                        setCardFailed(null);
                        if (card?.id === g.id) return setCard(null);
                        if ((await unlock()) === null) return;
                        try {
                          setCard(await api.gift(g.id));
                        } catch {
                          setCardFailed(g.id);
                        }
                      }}
                    >
                      {t(card?.id === g.id ? 'panel.ocultarTarjeta' : 'panel.verTarjeta')}
                    </Button>
                  )}
                  {g.indice !== null && pending && (
                    <Button
                      kind="contorno"
                      disabled={busy}
                      onClick={async () => {
                        if (open === g.id) return setOpen(null);
                        setCopiedSecret(null);
                        if ((await unlock()) !== null) setOpen(g.id);
                      }}
                    >
                      {t(open === g.id ? 'panel.ocultar' : 'panel.verLink')}
                    </Button>
                  )}
                  {g.rutaRecupero != null && g.indice !== null && g.estado === 'activo' && network !== null && (
                    <Button
                      kind="contorno"
                      disabled={busy}
                      onClick={async () => {
                        if (recovering === g.id) return setRecovering(null);
                        if ((await unlock()) !== null) setRecovering(g.id);
                      }}
                    >
                      {t(recovering === g.id ? 'panel.ocultar' : 'avanzado.recuperar.boton')}
                    </Button>
                  )}
                  {pending && (
                    <Button
                      kind="contorno"
                      disabled={busy}
                      onClick={async () => {
                        if (reminder === g.id) return setReminder(null);
                        // Con bóveda, el recordatorio lleva el link; si no se puede abrir, va sin él.
                        if (g.indice !== null && network !== null && (view.credenciales.length > 0 || master !== null)) {
                          if ((await unlock()) === null) setError(null);
                        }
                        setCopied(false);
                        setReminder(g.id);
                      }}
                    >
                      {t(reminder === g.id ? 'panel.recordatorio.ocultar' : 'panel.recordatorio')}
                    </Button>
                  )}
                  </div>
                  {derived !== null && link !== null && open === g.id && (
                    <div class="regalo-secretos">
                      <p class="mono enlace-regalo" translate={false}>
                        {link}
                      </p>
                      <WordsList words={derived.passphraseWords} />
                      <div class="regalo-copiar">
                        <Button kind="contorno" onClick={() => void copySecret(link, 'link')}>
                          {t(copiedSecret === 'link' ? 'panel.linkCopiado' : 'panel.copiarLink')}
                        </Button>
                        <Button kind="contorno" onClick={() => void copySecret(numberedWords(derived.passphraseWords), 'palabras')}>
                          {t(copiedSecret === 'palabras' ? 'panel.palabrasCopiadas' : 'panel.copiarPalabras')}
                        </Button>
                      </div>
                      <small class="texto-suave">
                        <strong>{t('regalar.mandar.orden')}</strong>
                      </small>
                      <small class="texto-suave">{t('regalar.mandar.palabrasTexto')}</small>
                    </div>
                  )}
                  {recovering === g.id && master !== null && network !== null && (
                    <RecoverWithWallet gift={g} root={masterRoot(master)} network={network} onDone={() => void load()} />
                  )}
                  {cardFailed === g.id && <small class="error-campo">{t('panel.tarjetaError')}</small>}
                  {card?.id === g.id && link !== null && <PrintCard link={link} view={card} conPlan={conPlan} />}
                  {reminder === g.id && (
                    <div class="regalo-secretos">
                      <p class="recordatorio-texto">{reminderText(g, trato, link)}</p>
                      <small class="texto-suave">{t('panel.recordatorio.texto')}</small>
                      <SentBy giftId={g.id} />
                      <Button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(reminderText(g, trato, link));
                            setCopied(true);
                          } catch {
                            // El texto queda a la vista para copiarlo a mano.
                          }
                        }}
                      >
                        {t(copied ? 'panel.recordatorio.copiado' : 'panel.recordatorio.copiar')}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
              );
            })()}
          </>
        )}
        <MyPlan />
        <MyLists network={network} master={master} onUnlock={unlock} />
        {network !== null && (advancedAvailable || view.regalos.some((g) => g.rutaRecupero != null)) && <RecoverySettings network={network} unlock={unlock} />}
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

const SENT_KEYS: Readonly<Record<Channel, Key>> = {
  whatsapp: 'panel.envio.whatsapp',
  mail: 'panel.envio.mail',
  copiar: 'panel.envio.copiar',
  mano: 'panel.envio.mano',
};

/** Cómo salieron el link y las palabras cuando se hizo el regalo, si este navegador lo recuerda. */
function SentBy({ giftId }: { giftId: string }) {
  const { t } = useI18n();
  const link = readSent(giftId, 'link');
  const words = readSent(giftId, 'palabras');
  if (link === null && words === null) return null;
  const parts = [
    ...(link === null ? [] : [t('panel.envio.link', { canal: t(SENT_KEYS[link]) })]),
    ...(words === null ? [] : [t('panel.envio.palabras', { canal: t(SENT_KEYS[words]) })]),
  ];
  return (
    <small class="texto-suave envio-original">
      <strong>{t('panel.envio.titulo')}</strong> {parts.join(' + ')}
    </small>
  );
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
