import { deriveGift, encodeGiftFragment, generateMasterMnemonic, getNetwork, type Lang, masterRootFromMnemonic, type Network } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import { ApiFailure, api } from '../api.ts';
import { ALLOW_MAINNET } from '../config.ts';
import { FREE_OCCASION_MAX, isOccasion, type OccasionKey } from '../content/occasions.ts';
import type { OccasionChoice } from '../content/OccasionPicker.tsx';
import { DICTS, type Key, translate } from '../i18n/index.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from '../ui.tsx';
import { EnterCode, ShowCode, VerifyCode } from './CodeSteps.tsx';
import { AmountStep, CardStep, OccasionStep } from './DraftSteps.tsx';
import { PayStep } from './PayStep.tsx';
import { SendStep } from './SendStep.tsx';

// Regalar en 5 pasos: ocasión, para quién, cuánto, pagá y mandalo. Todo lo secreto
// (clave maestra, semilla del regalo, palabras) vive solo en la memoria de esta página.

type Step = 'ocasion' | 'para' | 'cuanto' | 'codigo' | 'verificar' | 'tengoCodigo' | 'pagar' | 'mandar';

const PROGRESS: Readonly<Record<Step, number>> = {
  ocasion: 1,
  para: 2,
  cuanto: 3,
  codigo: 4,
  verificar: 4,
  tengoCodigo: 4,
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
  image: number;
  lang: Lang;
  currency: 'USD' | 'ARS' | 'SAT';
  /** En la moneda elegida: dólares, pesos o sats. */
  amount: number;
  sats: bigint;
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
}

type Root = ReturnType<typeof masterRootFromMnemonic>;

interface Session {
  readonly mnemonic: string;
  readonly root: Root;
  /** Próximo índice a probar: los anteriores ya se usaron en esta visita. */
  next: number;
}

const MAX_INDEX_TRIES = 500;

/**
 * Registra el regalo con el primer índice libre a partir de `start`. Si la dirección ya
 * existe (un regalo anterior con el mismo código), prueba el siguiente.
 */
async function register(session: Session, draft: Draft, network: Network): Promise<MadeGift> {
  for (let index = session.next; index < session.next + MAX_INDEX_TRIES; index++) {
    const gift = deriveGift(session.root, index, draft.lang, network);
    try {
      const id = await api.createGift({
        direccion: gift.address,
        idioma: draft.lang,
        ocasion: draft.occasion,
        ...(draft.occasion === 'otra' && draft.occasionFree !== '' ? { ocasionLibre: draft.occasionFree } : {}),
        para: draft.to,
        de: draft.from,
        mensaje: draft.message,
        imagen: draft.image,
        moneda: draft.currency,
        monto: draft.amount,
        sats: draft.sats.toString(),
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
      };
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'regalo_existente') continue;
      throw error;
    }
  }
  throw new ApiFailure(0, 'sin_indice');
}

function presetOccasion(): OccasionChoice | null {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('ocasion');
  if (key === null || !isOccasion(key)) return null;
  const free = params.get('libre')?.trim().slice(0, FREE_OCCASION_MAX);
  if (key === 'otra') return free ? { key, free } : null;
  return { key };
}

/** Mensaje sugerido para la ocasión, si hay uno; si no, vacío para que escriba el suyo. */
function suggestedMessage(key: string, t: (k: Key) => string): string {
  const k = `regalar.sugerido.${key}`;
  return k in DICTS.es ? t(k as Key) : '';
}

export function GivePage() {
  const { t, lang } = useI18n();
  const [network, setNetwork] = useState<Network | null>(null);
  const [netError, setNetError] = useState<'mainnet' | 'sin_red' | null>(null);
  // Si viene de la home con la ocasión elegida (/regalar?ocasion=…&libre=…), arranca en "Para quién".
  const [preset] = useState(presetOccasion);
  const [steps, setSteps] = useState<Step[]>(preset === null ? ['ocasion'] : ['ocasion', 'para']);
  const [draft, setDraft] = useState<Draft>(() => ({
    occasion: preset?.key ?? '',
    occasionFree: preset?.free ?? '',
    to: '',
    from: '',
    message: preset === null ? '' : suggestedMessage(preset.key, (k) => translate(lang, k)),
    image: 1,
    lang: lang as Lang,
    currency: 'USD',
    amount: 0,
    sats: 0n,
  }));
  const [session, setSession] = useState<Session | null>(null);
  const [newMnemonic, setNewMnemonic] = useState<string | null>(null);
  const [gift, setGift] = useState<MadeGift | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const step = steps[steps.length - 1] ?? 'ocasion';

  const loadNetwork = async () => {
    setNetError(null);
    try {
      const { red } = await api.health();
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

  const go = (s: Step) => {
    setError(null);
    setSteps((prev) => [...prev, s]);
  };
  const locked = step === 'pagar' || step === 'mandar';
  const back = steps.length > 1 && !locked && !busy ? () => setSteps((prev) => prev.slice(0, -1)) : undefined;

  const create = async (s: Session, d: Draft) => {
    if (network === null) return;
    setBusy(true);
    setError(null);
    // Deja pintar "Preparando…": derivar el regalo tarda unos cientos de milisegundos.
    await new Promise((r) => setTimeout(r, 30));
    try {
      setGift(await register(s, d, network));
      setNewMnemonic(null);
      setSteps(['pagar']);
    } catch (e) {
      const code = e instanceof ApiFailure ? e.code : '';
      setError(code === 'monto_invalido' ? 'regalar.errorMonto' : code === 'demasiados_pedidos' ? 'regalar.demasiados' : 'regalar.error');
    } finally {
      setBusy(false);
    }
  };

  const startSession = (mnemonic: string) => {
    const s: Session = { mnemonic, root: masterRootFromMnemonic(mnemonic), next: 0 };
    setSession(s);
    void create(s, draft);
  };

  const another = () => {
    setGift(null);
    setDraft((d) => ({ ...d, occasion: '', occasionFree: '', to: '', message: '', image: 1, amount: 0, sats: 0n }));
    setSteps(['ocasion']);
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
            message: d.message === '' || d.occasion !== choice.key ? suggestedMessage(choice.key, t) : d.message,
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
        onNext={(a) => {
          const next = { ...draft, ...a };
          setDraft(next);
          if (session === null) {
            setNewMnemonic((m) => m ?? generateMasterMnemonic());
            go('codigo');
          } else {
            void create(session, next);
          }
        }}
      />
    );
  } else if (step === 'codigo' && newMnemonic !== null) {
    body = <ShowCode mnemonic={newMnemonic} onNext={() => go('verificar')} onHaveCode={() => go('tengoCodigo')} />;
  } else if (step === 'verificar' && newMnemonic !== null) {
    body = <VerifyCode mnemonic={newMnemonic} onOk={() => startSession(newMnemonic)} error={error} />;
  } else if (step === 'tengoCodigo') {
    body = <EnterCode onOk={startSession} error={error} />;
  } else if (step === 'pagar' && gift !== null) {
    body = <PayStep gift={gift} network={network} onPaid={() => go('mandar')} />;
  } else if (step === 'mandar' && gift !== null) {
    body = <SendStep gift={gift} onAnother={another} />;
  } else {
    body = <p class="texto-suave">{t('reclamo.cargando')}</p>;
  }

  return (
    <Layout testnet={!ALLOW_MAINNET} onBack={back}>
      {network !== null && netError === null && (
        <div class="progreso" role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={PROGRESS[step]} aria-label={t('regalar.paso', { n: PROGRESS[step] })}>
          <span class="progreso-texto">{t('regalar.paso', { n: PROGRESS[step] })}</span>
          <span class={`progreso-barra progreso-${PROGRESS[step]}`} />
        </div>
      )}
      {error !== null && step !== 'cuanto' && step !== 'verificar' && step !== 'tengoCodigo' && <Notice kind="error">{t(error)}</Notice>}
      {body}
    </Layout>
  );
}
