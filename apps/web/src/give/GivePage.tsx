import { deriveGift, deriveMultisigGift, encodeGiftFragment, generateMasterMnemonic, getNetwork, type Lang, masterRootFromMnemonic, type Network, type RecoveryKey } from '@regalale/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiFailure, api, type Credits } from '../api.ts';
import { formatDayTime, formatUsd } from '../format.ts';
import { ALLOW_MAINNET } from '../config.ts';
import { FREE_OCCASION_MAX, isOccasion, type OccasionKey } from '../content/occasions.ts';
import type { CardStyle } from '../content/GiftCardArt.tsx';
import type { OccasionChoice } from '../content/OccasionPicker.tsx';
import type { ProcessedImage } from './ownImage.ts';
import { borrarBorrador, guardarBorrador, recuperarBorrador } from './borrador.ts';
import { DICTS, type Key, translate } from '../i18n/index.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from '../ui.tsx';
import { EnterCode, ShowCode, VerifyCode } from './CodeSteps.tsx';
import { SaveStep } from './SaveStep.tsx';
import { AmountStep, CardStep, isUntouched, OccasionStep } from './DraftSteps.tsx';
import { PayStep } from './PayStep.tsx';
import { SendStep } from './SendStep.tsx';
import { sharePreview } from './vistaCompartir.ts';
import { AdvancedIntro, AdvancedLink, ConnectWallet } from '../recupero/Avanzado.tsx';
import { loadRecoveryKey, recoveryFileText, recoveryPathText, saveRecoveryKey } from '../recupero/recupero.ts';

// Regalar en 5 pasos: ocasión, para quién, cuánto, pagá y mandalo. Todo lo secreto
// (clave maestra, semilla del regalo, palabras) vive solo en la memoria de esta página.

type Step = 'ocasion' | 'para' | 'cuanto' | 'guardar' | 'avanzado' | 'conectar' | 'codigo' | 'verificar' | 'tengoCodigo' | 'sinCreditos' | 'pagar' | 'mandar';

const PROGRESS: Readonly<Record<Step, number>> = {
  ocasion: 1,
  para: 2,
  cuanto: 3,
  guardar: 4,
  avanzado: 4,
  conectar: 4,
  codigo: 4,
  verificar: 4,
  tengoCodigo: 4,
  sinCreditos: 4,
  pagar: 4,
  mandar: 5,
};

export interface Draft {
  occasion: string;
  /** Texto de la ocasión libre (occasion = 'otra'). */
  occasionFree: string;
  to: string;
  from: string;
  message: string;
  /** Ejemplo cargado en el mensaje (con {nombre} sin reemplazar); null si no hay. */
  example: string | null;
  /** Lo que había escrito antes de "Otra idea", para deshacer. */
  undo: string | null;
  /** Estilo de la tarjeta; con 'propia', la imagen ya procesada en el navegador. */
  style: CardStyle;
  ownImage: ProcessedImage | null;
  lang: Lang;
  currency: 'USD' | 'ARS' | 'SAT';
  /** En la moneda elegida: dólares, pesos o sats. */
  amount: number;
  sats: bigint;
  /** Si quien recibe ve cuánto vale en plata (Claudia, 25/10). Apagado de entrada. */
  showValue: boolean;
}

/** Un regalo ya registrado y esperando (o con) su pago. */
export interface MadeGift {
  readonly id: string;
  readonly index: number;
  readonly address: string;
  readonly link: string;
  readonly words: readonly string[];
  readonly lang: Lang;
  readonly to: string;
  readonly sats: bigint;
  /** Ocasión (y la libre), para el mensaje que se manda con el link. */
  readonly occasion: string;
  readonly occasionFree: string;
  /** Recupero avanzado: el archivo de recupero (texto) y la huella de la billetera. */
  readonly recovery: { readonly file: string; readonly fingerprint: string } | null;
}

type Root = ReturnType<typeof masterRootFromMnemonic>;

interface Session {
  readonly mnemonic: string;
  readonly root: Root;
  /** Próximo índice a probar: los anteriores ya se usaron en esta visita. */
  next: number;
  /** Recupero avanzado: la clave pública de la billetera del que regala (null = modo común). */
  readonly recovery: RecoveryKey | null;
}

const MAX_INDEX_TRIES = 500;

/**
 * Registra el regalo con el primer índice libre a partir de `start`. Si la dirección ya
 * existe (un regalo anterior con el mismo código), prueba el siguiente.
 */
async function register(session: Session, draft: Draft, network: Network): Promise<MadeGift> {
  // La imagen para la vista previa del link (WhatsApp, redes); sin ella, el link usa la general.
  const vista = await sharePreview({
    lang: draft.lang,
    occasion: draft.occasion,
    occasionFree: draft.occasionFree,
    style: draft.style,
    ownImage: draft.style === 'propia' ? (draft.ownImage?.dataUrl ?? null) : null,
    to: draft.to,
  });
  for (let index = session.next; index < session.next + MAX_INDEX_TRIES; index++) {
    const multisig = session.recovery === null ? null : deriveMultisigGift(session.root, index, draft.lang, network, session.recovery);
    const gift = multisig ?? deriveGift(session.root, index, draft.lang, network);
    const testigo = multisig === null ? null : Array.from(multisig.witnessScript, (b) => b.toString(16).padStart(2, '0')).join('');
    try {
      const id = await api.createGift({
        direccion: gift.address,
        idioma: draft.lang,
        ocasion: draft.occasion,
        ...(draft.occasion === 'otra' && draft.occasionFree !== '' ? { ocasionLibre: draft.occasionFree } : {}),
        para: draft.to,
        de: draft.from,
        mensaje: draft.message,
        imagen: 1, // una sola imagen por estilo; el campo queda por compatibilidad
        estilo: draft.style,
        ...(draft.style === 'propia' && draft.ownImage !== null ? { imagenPropia: draft.ownImage.base64 } : {}),
        ...(vista === null ? {} : { vista }),
        moneda: draft.currency,
        monto: draft.amount,
        sats: draft.sats.toString(),
        mostrarValor: draft.showValue === true,
        indice: index,
        ...(multisig === null || session.recovery === null || testigo === null ? {} : { testigo, rutaRecupero: recoveryPathText(session.recovery, index) }),
      });
      session.next = index + 1;
      return {
        id,
        index,
        address: gift.address,
        link: `${window.location.origin}/r/${id}#${encodeGiftFragment(gift.entropy)}`,
        words: gift.passphraseWords,
        lang: draft.lang,
        to: draft.to,
        sats: draft.sats,
        occasion: draft.occasion,
        occasionFree: draft.occasionFree,
        recovery:
          multisig === null || session.recovery === null || testigo === null
            ? null
            : {
                fingerprint: session.recovery.fingerprintHex,
                file: recoveryFileText({ id, address: gift.address, key: session.recovery, index, gift: multisig.account, witnessScript: testigo, site: window.location.origin }),
              },
      };
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'regalo_existente') continue;
      throw error;
    }
  }
  throw new ApiFailure(0, 'sin_indice');
}

/** Lo que cada paso deja en el historial: su número y la tanda (cambia al empezar de nuevo). */
interface EnHistorial {
  readonly regalarPaso: number;
  readonly tanda: number;
}

function enHistorial(state: unknown): EnHistorial | null {
  const e = state as Partial<EnHistorial> | null;
  return typeof e?.regalarPaso === 'number' && typeof e.tanda === 'number' ? (e as EnHistorial) : null;
}

function presetOccasion(): OccasionChoice | null {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('ocasion');
  if (key === null || !isOccasion(key)) return null;
  const free = params.get('libre')?.trim().slice(0, FREE_OCCASION_MAX);
  if (key === 'otra') return free ? { key, free } : null;
  return { key };
}

export function GivePage() {
  const { t, lang } = useI18n();
  const [network, setNetwork] = useState<Network | null>(null);
  const [ceilingUsd, setCeilingUsd] = useState(100);
  // Recupero avanzado: si el servidor lo ofrece en esta red, y la billetera elegida en este paso 4.
  const [advancedAvailable, setAdvancedAvailable] = useState(false);
  const [pendingKey, setPendingKey] = useState<RecoveryKey | null>(null);
  const [recoveryNotSaved, setRecoveryNotSaved] = useState(false);
  const [netError, setNetError] = useState<'mainnet' | 'sin_red' | null>(null);
  // Si viene de la home con la ocasión elegida (/regalar?ocasion=…&libre=…), arranca en "Para quién".
  const [preset] = useState(presetOccasion);
  // Si volvió con «Atrás» (o recargó), lo que ya había escrito, en el paso donde estaba.
  const [restored] = useState(() => {
    const b = recuperarBorrador<Step>();
    const paso = enHistorial(window.history.state)?.regalarPaso;
    return b === null ? null : { ...b, steps: paso !== undefined && paso < b.steps.length ? b.steps.slice(0, Math.max(paso, 1)) : b.steps };
  });
  const [steps, setSteps] = useState<Step[]>(restored?.steps ?? (preset === null ? ['ocasion'] : ['ocasion', 'para']));
  const [draft, setDraft] = useState<Draft>(() => restored?.draft ?? ({
    occasion: preset?.key ?? '',
    occasionFree: preset?.free ?? '',
    to: '',
    from: '',
    message: '',
    example: null,
    undo: null,
    style: 'ilustracion',
    ownImage: null,
    lang: lang as Lang,
    currency: 'USD',
    amount: 0,
    sats: 0n,
    showValue: false,
  }));
  const [session, setSession] = useState<Session | null>(null);
  const [newMnemonic, setNewMnemonic] = useState<string | null>(null);
  const [gift, setGift] = useState<MadeGift | null>(null);
  // Créditos de la cuenta al crear el regalo (para «Te quedan…»); null sin sesión o si falla.
  const [credits, setCredits] = useState<Credits | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  // Tope diario de la cuenta (28/10/2026): cuánto es, y si el último intento lo pasó, cuánto queda y desde cuándo.
  const [dailyUsd, setDailyUsd] = useState<number | null>(null);
  const [dailyStop, setDailyStop] = useState<{ tope: number; resta: number; desde: Date } | null>(null);
  const step = steps[steps.length - 1] ?? 'ocasion';

  const loadNetwork = async () => {
    setNetError(null);
    try {
      const { red, topeUsd, topeDiarioUsd, recuperoAvanzado } = await api.health();
      if (typeof topeUsd === 'number' && topeUsd > 0) setCeilingUsd(topeUsd);
      if (typeof topeDiarioUsd === 'number' && topeDiarioUsd > 0) setDailyUsd(topeDiarioUsd);
      setAdvancedAvailable(recuperoAvanzado === true);
      try {
        setNetwork(getNetwork(red, { allowMainnet: ALLOW_MAINNET }));
      } catch {
        setNetError('mainnet');
      }
    } catch {
      setNetError('sin_red');
    }
  };
  useEffect(() => {
    void loadNetwork();
  }, []);

  // Con un regalo armado y sin mandar, avisar antes de cerrar la pestaña.
  useEffect(() => {
    if (gift === null) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [gift]);

  // Cada paso entra al historial: el «atrás» del celu (o del navegador) vuelve un paso en vez de
  // salir de Regalar. La tanda distingue los pasos de esta vuelta de los de un regalo anterior.
  const tanda = useRef(0);
  const busyRef = useRef(false);
  const lockedRef = useRef(false);
  // Los pasos que dejó el «atrás», para que «adelante» los retome.
  const undone = useRef<Step[]>([]);
  busyRef.current = busy;
  useEffect(() => {
    const actual = enHistorial(window.history.state);
    if (restored !== null && actual !== null) {
      tanda.current = actual.tanda;
      if (actual.regalarPaso !== steps.length) window.history.replaceState({ regalarPaso: steps.length, tanda: tanda.current }, '');
    } else {
      tanda.current = Date.now();
      window.history.replaceState({ regalarPaso: 1, tanda: tanda.current }, '');
      for (let n = 2; n <= steps.length; n++) window.history.pushState({ regalarPaso: n, tanda: tanda.current }, '');
    }
    const onPop = (e: PopStateEvent) => {
      const paso = enHistorial(e.state);
      // Pagando o mandando, el regalo armado vive solo en esta página: el atrás no cambia nada.
      if (busyRef.current || lockedRef.current) return;
      // Un paso de un regalo anterior: se saltea hasta el principio de esta vuelta.
      if (paso !== null && paso.tanda !== tanda.current) return window.history.back();
      const n = paso?.regalarPaso ?? 1;
      setSteps((prev) => {
        if (n === prev.length) return prev;
        if (n > prev.length) return [...prev, ...undone.current.slice(0, n - prev.length)];
        undone.current = [...prev.slice(n), ...undone.current];
        return prev.slice(0, n);
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // El borrador (sin nada secreto) queda en la pestaña hasta que el regalo se arma.
  useEffect(() => {
    if (gift === null) guardarBorrador(steps, draft);
  }, [steps, draft, gift]);

  const go = (s: Step) => {
    setError(null);
    window.history.pushState({ regalarPaso: steps.length + 1, tanda: tanda.current }, '');
    undone.current = [];
    setSteps((prev) => [...prev, s]);
  };
  /** Empieza una vuelta nueva con un solo paso (los anteriores ya no se pueden retomar). */
  const restart = (s: Step) => {
    tanda.current = Date.now();
    window.history.replaceState({ regalarPaso: 1, tanda: tanda.current }, '');
    undone.current = [];
    setSteps([s]);
  };
  /** Vuelve hasta dejar n pasos: por el historial, así el «adelante» y el «atrás» siguen en orden. */
  const backTo = (n: number) => {
    const actual = enHistorial(window.history.state);
    if (actual?.tanda === tanda.current && actual.regalarPaso === steps.length) window.history.go(n - steps.length);
    else setSteps((prev) => prev.slice(0, n));
  };
  const locked = step === 'pagar' || step === 'mandar';
  lockedRef.current = locked;
  const back = steps.length > 1 && !locked && !busy ? () => backTo(steps.length - 1) : undefined;

  const create = async (s: Session, d: Draft) => {
    if (network === null) return;
    setBusy(true);
    setError(null);
    setDailyStop(null);
    // Deja pintar "Preparando…": derivar el regalo tarda unos cientos de milisegundos.
    await new Promise((r) => setTimeout(r, 30));
    try {
      setCredits(await api.creditsIfSignedIn().catch(() => null));
      setGift(await register(s, d, network));
      setNewMnemonic(null);
      borrarBorrador();
      restart('pagar');
    } catch (e) {
      const code = e instanceof ApiFailure ? e.code : '';
      if (code === 'sin_creditos') {
        // Sin créditos ni plan: antes de mostrar la dirección del regalo, los packs.
        go('sinCreditos');
        return;
      }
      const datos = e instanceof ApiFailure ? e.data : undefined;
      if (code === 'tope_diario' && typeof datos?.topeUsd === 'number' && typeof datos.restaUsd === 'number' && typeof datos.desde === 'string') {
        setDailyStop({ tope: datos.topeUsd, resta: datos.restaUsd, desde: new Date(datos.desde) });
        return;
      }
      setError(code === 'monto_invalido' ? 'regalar.errorMonto' : code === 'demasiados_pedidos' ? 'regalar.demasiados' : 'regalar.error');
    } finally {
      setBusy(false);
    }
  };

  const startSession = async (mnemonic: string, next = 0) => {
    const root = masterRootFromMnemonic(mnemonic);
    // Recupero avanzado: la billetera elegida en este paso 4 (se guarda cifrada en la cuenta), o
    // la que la cuenta ya tenía. Sin ninguna, el modo común.
    let recovery: RecoveryKey | null = null;
    if (network !== null && advancedAvailable) {
      if (pendingKey !== null) {
        recovery = pendingKey;
        await saveRecoveryKey(root, pendingKey).catch(() => setRecoveryNotSaved(true));
      } else {
        recovery = await loadRecoveryKey(root, network);
      }
    }
    const s: Session = { mnemonic, root, next, recovery };
    setSession(s);
    void create(s, draft);
  };

  const another = () => {
    setGift(null);
    setDraft((d) => ({ ...d, occasion: '', occasionFree: '', to: '', message: '', example: null, undo: null, style: 'ilustracion', ownImage: null, amount: 0, sats: 0n, showValue: false }));
    restart('ocasion');
  };

  let body;
  if (netError !== null) {
    body = (
      <div class="paso">
        <StepTitle>{t(netError === 'mainnet' ? 'regalar.mainnet' : 'reclamo.sinRed')}</StepTitle>
        {netError === 'sin_red' && <Button onClick={() => void loadNetwork()}>{t('reintentar')}</Button>}
      </div>
    );
  } else if (network === null) {
    body = <p class="texto-suave cargando">{t('reclamo.cargando')}</p>;
  } else if (busy) {
    body = <p class="texto-suave cargando">{t('regalar.creando')}</p>;
  } else if (step === 'ocasion') {
    body = (
      <OccasionStep
        value={draft.occasion === '' ? null : draft.occasion === 'otra' ? { key: 'otra', free: draft.occasionFree } : { key: draft.occasion as OccasionKey }}
        onPick={(choice) => {
          setDraft((d) => ({
            ...d,
            occasion: choice.key,
            occasionFree: choice.free ?? '',
            // Otra ocasión: el ejemplo se vuelve a elegir (lo escrito a mano se conserva).
            ...(d.occasion !== choice.key && (d.example === null ? d.message === '' : isUntouched(d)) ? { message: '', example: null, undo: null } : {}),
          }));
          go('para');
        }}
      />
    );
  } else if (step === 'para') {
    body = <CardStep draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} onNext={() => go('cuanto')} />;
  } else if (step === 'cuanto') {
    body = (
      <AmountStep
        draft={draft}
        error={error}
        ceilingUsd={ceilingUsd}
        {...(dailyUsd === null ? {} : { ceilingNote: t('regalar.cuanto.topes', { maximo: formatUsd(ceilingUsd, lang), diario: formatUsd(dailyUsd, lang) }) })}
        showValueOption
        onNext={(a) => {
          const next = { ...draft, ...a };
          setDraft(next);
          if (session === null) {
            go('guardar');
          } else {
            void create(session, next);
          }
        }}
      />
    );
  } else if (step === 'guardar') {
    body = (
      <>
        <SaveStep
          onReady={(master, next) => void startSession(master, next)}
          onNeedCode={(hasCodeAlready) => {
            if (hasCodeAlready) go('tengoCodigo');
            else {
              setNewMnemonic((m) => m ?? generateMasterMnemonic());
              go('codigo');
            }
          }}
        />
        {/* Discreto, debajo de todo (Claudia, 25/10): quien no lo necesita ni lo nota. */}
        {advancedAvailable && <AdvancedLink chosen={pendingKey} onOpen={() => go('avanzado')} />}
      </>
    );
  } else if (step === 'avanzado') {
    body = (
      <AdvancedIntro
        onUse={() => go('conectar')}
        onCommon={() => {
          setPendingKey(null);
          backTo(steps.length - 1);
        }}
      />
    );
  } else if (step === 'conectar') {
    body = (
      <ConnectWallet
        network={network}
        onConnected={(key) => {
          setPendingKey(key);
          backTo(steps.length - 2);
        }}
      />
    );
  } else if (step === 'codigo' && newMnemonic !== null) {
    body = <ShowCode mnemonic={newMnemonic} onNext={() => go('verificar')} onHaveCode={() => go('tengoCodigo')} />;
  } else if (step === 'verificar' && newMnemonic !== null) {
    body = <VerifyCode mnemonic={newMnemonic} onOk={() => void startSession(newMnemonic)} error={error} />;
  } else if (step === 'tengoCodigo') {
    body = <EnterCode onOk={(m) => void startSession(m)} error={error} />;
  } else if (step === 'sinCreditos') {
    body = (
      <div class="paso">
        <StepTitle>{t('regalar.sinCreditos.titulo')}</StepTitle>
        <p>{t('regalar.sinCreditos.texto')}</p>
        <a class="boton boton-primario" href="/precios">
          {t('regalar.sinCreditos.boton')}
        </a>
      </div>
    );
  } else if (step === 'pagar' && gift !== null) {
    body = <PayStep gift={gift} network={network} credits={credits} onPaid={() => go('mandar')} />;
  } else if (step === 'mandar' && gift !== null) {
    body = <SendStep gift={gift} ceilingUsd={ceilingUsd} onAnother={another} />;
  } else {
    body = <p class="texto-suave">{t('reclamo.cargando')}</p>;
  }

  return (
    <Layout testnet={network === null ? !ALLOW_MAINNET : network.name !== 'mainnet'} onBack={back}>
      {network !== null && netError === null && (
        <nav class="progreso" aria-label={t('regalar.paso', { n: PROGRESS[step] })}>
          <span class="progreso-texto">{t('regalar.paso', { n: PROGRESS[step] })}</span>
          {/* Cinco rayitas que se van pintando; las de pasos ya hechos llevan de vuelta ahí (Rodolfo, 21/10). */}
          <ol class="progreso-rayas">
            {[1, 2, 3, 4, 5].map((n) => {
              const at = steps.findIndex((s) => PROGRESS[s] === n);
              const cls = `raya${n <= PROGRESS[step] ? ' hecha' : ''}`;
              return (
                <li key={n}>
                  {back !== undefined && n < PROGRESS[step] && at >= 0 ? (
                    <button type="button" class={cls} aria-label={t('regalar.volverAlPaso', { n })} onClick={() => backTo(at + 1)} />
                  ) : (
                    <span class={cls} aria-current={n === PROGRESS[step] ? 'step' : undefined} />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      {error !== null && step !== 'cuanto' && step !== 'verificar' && step !== 'tengoCodigo' && <Notice kind="error">{t(error)}</Notice>}
      {dailyStop !== null && (
        <Notice kind="error">
          {t(dailyStop.resta > 0 ? 'regalar.topeDiario.resta' : 'regalar.topeDiario.nada', {
            tope: formatUsd(dailyStop.tope, lang),
            resta: formatUsd(dailyStop.resta, lang),
            cuando: formatDayTime(dailyStop.desde, lang),
          })}{' '}
          {t('regalar.topeDiario.descartar')}
        </Notice>
      )}
      {recoveryNotSaved && step === 'pagar' && <Notice kind="info">{t('avanzado.error.guardar')}</Notice>}
      {body}
    </Layout>
  );
}
