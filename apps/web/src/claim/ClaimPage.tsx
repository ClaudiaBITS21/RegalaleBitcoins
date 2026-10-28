import { decodeGiftFragment, type Destination, getNetwork, type GiftWallet, isCoreError, multisigGiftWallet, type Network, openGiftWallet } from '@regalale/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiFailure, api, type GiftView } from '../api.ts';
import { ALLOW_MAINNET } from '../config.ts';
import { explorerTxUrl, formatSats, formatUsd, formatWhole, satsToUsd } from '../format.ts';
import { giftValueText } from '../valorRegalo.ts';
import { GiftCardArt } from '../content/GiftCardArt.tsx';
import { occasionLabel } from '../content/occasions.ts';
import type { Key, UiLang } from '../i18n/index.ts';
import shotStart from '../capturas/bluewallet-1-inicio-2026-10-28.webp';
import shotAdd from '../capturas/bluewallet-2-anadir-2026-10-28.webp';
import shotWallet from '../capturas/bluewallet-3-cartera-2026-10-28.webp';
import shotInside from '../capturas/bluewallet-4-dentro-2026-10-28.webp';
import shotReceive from '../capturas/bluewallet-5-recibir-2026-10-28.webp';
import appStoreEn from '../insignias/app-store-en.svg';
import appStoreEs from '../insignias/app-store-es.svg';
import appStorePt from '../insignias/app-store-pt.svg';
import googlePlayEn from '../insignias/google-play-en.svg';
import googlePlayEs from '../insignias/google-play-es.svg';
import googlePlayPt from '../insignias/google-play-pt.svg';
import { installWay } from '../pwa.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from '../ui.tsx';
import { AddressStep } from './AddressStep.tsx';
import { ConfirmStep } from './ConfirmStep.tsx';
import { WordsStep } from './WordsStep.tsx';

type Step = 'regalo' | 'palabras' | 'billetera' | 'guia' | 'direccion' | 'confirmar' | 'listo';
type LoadError = 'link' | 'no_existe' | 'sin_red' | 'mainnet';

/** BlueWallet en las tiendas oficiales (handoff 25/10/2026). */
const APP_STORE = 'https://apps.apple.com/app/bluewallet-bitcoin-wallet/id1376878040';
const GOOGLE_PLAY = 'https://play.google.com/store/apps/details?id=io.bluewallet.bluewallet';

/**
 * Insignias oficiales de las tiendas según el idioma, sin modificar (SVG autoalojados). Ninguna de
 * las dos tiene versión en italiano: va la de inglés.
 */
const BADGES: Readonly<Record<UiLang, { appStore: string; googlePlay: string }>> = {
  es: { appStore: appStoreEs, googlePlay: googlePlayEs },
  pt: { appStore: appStorePt, googlePlay: googlePlayPt },
  en: { appStore: appStoreEn, googlePlay: googlePlayEn },
  it: { appStore: appStoreEn, googlePlay: googlePlayEn },
};

/**
 * Capturas de BlueWallet en español (Android, 28/10/2026), recortadas, con el QR y la dirección
 * borrosos. Si BlueWallet cambia su interfaz, se vuelven a sacar.
 */
const SHOTS = [shotStart, shotAdd, shotWallet, shotInside, shotReceive] as const;

/** Un paso de la guía con su captura en miniatura al costado; tocarla la agranda. */
function GuideStep({ text, shot, alt }: { text: string; shot: string; alt: string }) {
  const [big, setBig] = useState(false);
  return (
    <li>
      <div class={`guia-paso${big ? ' guia-paso-abierto' : ''}`}>
        <button type="button" class="captura" aria-expanded={big} onClick={() => setBig(!big)}>
          <img src={shot} alt={alt} loading="lazy" />
        </button>
        {text}
      </div>
    </li>
  );
}

/** Las dos tiendas, la del sistema del celu primero. */
function StoreLinks() {
  const { t, lang } = useI18n();
  const [way] = useState(() => installWay(navigator.userAgent, navigator.maxTouchPoints ?? 0));
  const badge = (key: string, url: string, src: string, alt: string) => (
    <a key={key} class="tienda tienda-insignia" href={url} target="_blank" rel="noopener noreferrer">
      <img src={src} alt={alt} height={48} />
    </a>
  );
  const appStore = badge('app-store', APP_STORE, BADGES[lang].appStore, t('guia.appStore'));
  const googlePlay = badge('google-play', GOOGLE_PLAY, BADGES[lang].googlePlay, t('guia.googlePlay'));
  return <span class="tiendas">{way === 'android' ? [googlePlay, appStore] : [appStore, googlePlay]}</span>;
}

/**
 * Lee la semilla del fragmento del link (#...) una sola vez y la saca de la barra de
 * direcciones: queda solo en memoria, no en capturas de pantalla ni en el historial visible.
 */
function readFragmentOnce(): Uint8Array | null {
  const hash = window.location.hash;
  if (hash.length <= 1) return null;
  history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    return decodeGiftFragment(hash);
  } catch {
    return null;
  }
}

export function ClaimPage({ id }: { id: string }) {
  const { t } = useI18n();
  const [entropy] = useState(readFragmentOnce);
  const [gift, setGift] = useState<GiftView | null>(null);
  const [network, setNetwork] = useState<Network | null>(null);
  const [error, setError] = useState<LoadError | null>(entropy === null ? 'link' : null);
  const [steps, setSteps] = useState<Step[]>(['regalo']);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [done, setDone] = useState<{ txid: string; modo: 'ahora' | 'esperar' } | null>(null);
  const [wrote, setWrote] = useState(false);
  const wallet = useRef<GiftWallet | null>(null);
  const step = steps[steps.length - 1] ?? 'regalo';

  const load = async () => {
    setError(null);
    try {
      const g = await api.gift(id);
      try {
        setNetwork(getNetwork(g.red, { allowMainnet: ALLOW_MAINNET }));
      } catch {
        setError('mainnet');
        return;
      }
      setGift(g);
    } catch (e) {
      setError(e instanceof ApiFailure && e.status === 404 ? 'no_existe' : 'sin_red');
    }
  };

  useEffect(() => {
    if (entropy !== null) void load();
    return () => wallet.current?.wipe();
  }, []);

  const go = (s: Step) => setSteps((prev) => [...prev, s]);
  const back = steps.length > 1 && step !== 'listo' ? () => setSteps((prev) => prev.slice(0, -1)) : undefined;

  const checkWords = async (words: string[]): Promise<string | null> => {
    if (entropy === null || gift === null || network === null) return t('reclamo.linkRoto.titulo');
    try {
      const plain = openGiftWallet(entropy, words, gift.idioma, network);
      // Regalo con recupero avanzado: la misma clave, en la multifirma 1-de-2 que guarda el servidor.
      let w = plain;
      if (gift.testigo != null) {
        try {
          w = multisigGiftWallet(plain, Uint8Array.from(gift.testigo.match(/../g) ?? [], (h) => Number.parseInt(h, 16)));
        } catch {
          plain.wipe();
          return t('palabras.incorrectas');
        }
      }
      if (w.address !== gift.direccion) {
        w.wipe();
        return t('palabras.incorrectas');
      }
      wallet.current?.wipe();
      wallet.current = w;
      go('billetera');
      return null;
    } catch (e) {
      return isCoreError(e, 'INVALID_WORD') ? t('palabras.fueraDeLista') : t('palabras.incorrectas');
    }
  };

  let body;
  if (error !== null) {
    const texts: Record<LoadError, [Key, Key | null]> = {
      link: ['reclamo.linkRoto.titulo', 'reclamo.linkRoto.texto'],
      no_existe: ['reclamo.noExiste.titulo', 'reclamo.noExiste.texto'],
      sin_red: ['reclamo.sinRed', null],
      mainnet: ['reclamo.mainnet', null],
    };
    const [title, text] = texts[error];
    body = (
      <div class="paso">
        <StepTitle>{t(title)}</StepTitle>
        {text !== null && <p class="texto-suave">{t(text)}</p>}
        {error === 'sin_red' && <Button onClick={() => void load()}>{t('reintentar')}</Button>}
      </div>
    );
  } else if (gift === null || network === null) {
    body = <p class="texto-suave cargando">{t('reclamo.cargando')}</p>;
  } else if (step === 'regalo') {
    body = <GiftCard gift={gift} onReceive={() => go('palabras')} onReload={() => void load()} />;
  } else if (step === 'palabras') {
    body = <WordsStep lang={gift.idioma} onSubmit={checkWords} />;
  } else if (step === 'billetera') {
    body = (
      <div class="paso">
        <StepTitle>{t('billetera.titulo')}</StepTitle>
        <Button kind="contorno" onClick={() => go('direccion')}>
          {t('billetera.si')}
        </Button>
        <Button kind="acento" onClick={() => go('guia')}>
          {t('billetera.no')}
        </Button>
      </div>
    );
  } else if (step === 'guia') {
    body = (
      <div class="paso">
        <StepTitle>{t('guia.titulo')}</StepTitle>
        <p class="texto-suave">{t('guia.intro')}</p>
        {network.name !== 'mainnet' && <Notice>{t('guia.signet')}</Notice>}
        <ol class="guia">
          <li>
            {t('guia.paso1')}
            <StoreLinks />
            {/* Quien ya tiene billetera no necesita la guía: va directo a poner su dirección. */}
            <button type="button" class="boton-texto guia-otras" onClick={() => go('direccion')}>
              {t('guia.otras')}
            </button>
          </li>
          <GuideStep text={t('guia.paso2')} shot={SHOTS[0]} alt={t('guia.captura1')} />
          <GuideStep text={t('guia.paso3')} shot={SHOTS[1]} alt={t('guia.captura2')} />
          {/* Las 12 palabras, sin captura a propósito: es la pantalla que nadie tiene que fotografiar. */}
          <li>
            <strong>{t('guia.paso4')}</strong>
            <Notice>{t('guia.distintas')}</Notice>
          </li>
          <GuideStep text={t('guia.paso5')} shot={SHOTS[2]} alt={t('guia.captura3')} />
          <GuideStep text={t('guia.paso6')} shot={SHOTS[3]} alt={t('guia.captura4')} />
          <GuideStep text={t('guia.paso7')} shot={SHOTS[4]} alt={t('guia.captura5')} />
          <li>{t('guia.paso8')}</li>
        </ol>
        <label class="casilla casilla-destacada">
          <input type="checkbox" checked={wrote} onChange={(e) => setWrote((e.currentTarget as HTMLInputElement).checked)} />
          {t('guia.anote')}
        </label>
        <Button disabled={!wrote} onClick={() => go('direccion')}>
          {t('guia.listo')}
        </Button>
      </div>
    );
  } else if (step === 'direccion') {
    body = (
      <AddressStep
        network={network}
        giftAddress={gift.direccion}
        onDone={(d) => {
          setDestination(d);
          go('confirmar');
        }}
      />
    );
  } else if (step === 'confirmar' && wallet.current !== null && destination !== null) {
    body = (
      <ConfirmStep
        gift={gift}
        network={network}
        wallet={wallet.current}
        destination={destination}
        onDone={(r) => {
          wallet.current?.wipe();
          wallet.current = null;
          setDone(r);
          setSteps(['listo']);
        }}
      />
    );
  } else if (step === 'listo' && done !== null) {
    const url = explorerTxUrl(gift.red, done.txid);
    body = (
      <div class="paso">
        <StepTitle>{t('listo.titulo')}</StepTitle>
        <p>{t(done.modo === 'ahora' ? 'listo.ahora' : 'listo.esperar')}</p>
        {url !== null && done.modo === 'ahora' && (
          <a href={url} rel="noopener noreferrer" target="_blank">
            {t('listo.tx')}
          </a>
        )}
        <div class="caja">
          <strong>{t('listo.yAhora')}</strong>
          <p>{t('listo.texto1')}</p>
          <p>{t('listo.texto2')}</p>
        </div>
        <a class="boton boton-acento" href="/">
          {t('listo.cta')}
        </a>
      </div>
    );
  } else {
    body = <p class="texto-suave">{t('reclamo.cargando')}</p>;
  }

  return (
    <Layout testnet={network === null ? !ALLOW_MAINNET : network.name !== 'mainnet'} onBack={back}>
      {body}
    </Layout>
  );
}

function GiftCard({ gift, onReceive, onReload }: { gift: GiftView; onReceive: () => void; onReload: () => void }) {
  const { t, lang } = useI18n();
  const sats = BigInt(gift.sats.confirmados) + BigInt(gift.sats.sinConfirmar);
  // Cuánto vale en plata, solo si quien regala eligió mostrarlo (25/10); si no, solo los sats.
  const showValue = gift.mostrarValor !== false;
  const before = showValue ? giftValueText(gift, lang) : null;
  const valueLine = showValue && sats > 0n ? todayText(gift, sats, before, lang, t) : null;
  const claimUrl = gift.reclamo !== null ? explorerTxUrl(gift.red, gift.reclamo.txid) : null;
  const stateText: Partial<Record<GiftView['estado'], Key>> = {
    esperando: 'reclamo.estado.esperando',
    en_la_red: 'reclamo.estado.en_la_red',
    reclamado: 'reclamo.estado.reclamado',
    recuperado: 'reclamo.estado.recuperado',
    retirado: 'reclamo.estado.retirado',
    reclamo_programado: 'reclamo.estado.reclamo_programado',
  };
  const notice = stateText[gift.estado];

  return (
    <div class="paso">
      <article class="tarjeta">
        <GiftCardArt occasion={gift.ocasion} estilo={gift.estilo} src={`/api/gifts/${gift.id}/imagen`} name={gift.para} class="tarjeta-imagen" />
        <div class="tarjeta-texto">
          <p class="kicker tarjeta-ocasion">{occasionLabel(gift.ocasion, lang, gift.ocasionLibre)}</p>
          <StepTitle>{gift.de ? t('reclamo.de', { de: gift.de }) : t('reclamo.anonimo')}</StepTitle>
          {gift.mensaje !== '' && <p class="texto-suave">{gift.mensaje}</p>}
          {before !== null && <p class="tarjeta-valor">{t('reclamo.valor', { valor: before })}</p>}
        </div>
      </article>
      {/* Sin sats ni cuentas (Claudia, 25/10): lo que le llegó es lo que le llegó. En plata, solo si quien regala quiso. */}
      {valueLine !== null && (
        <div class="caja monto">
          <span class="texto-suave">{valueLine}</span>
        </div>
      )}
      {notice !== undefined && <Notice kind={gift.estado === 'reclamado' ? 'ok' : 'info'}>{t(notice)}</Notice>}
      {claimUrl !== null && gift.estado === 'reclamado' && (
        <a href={claimUrl} rel="noopener noreferrer" target="_blank">
          {t('listo.tx')}
        </a>
      )}
      {gift.estado === 'activo' && <Button onClick={onReceive}>{t('reclamo.cta')}</Button>}
      {(gift.estado === 'esperando' || gift.estado === 'en_la_red' || gift.estado === 'reclamo_programado') && (
        <Button kind="contorno" onClick={onReload}>
          {t('reclamo.actualizar')}
        </Button>
      )}
    </div>
  );
}

/**
 * «Valía… Hoy vale…» en la misma moneda del regalo (handoff 25/10/2026): nunca compara monedas
 * distintas. En sats no hay «valía»: el número no cambia, solo su valor en dólares (28/10).
 */
function todayText(gift: GiftView, sats: bigint, before: string | null, lang: UiLang, t: ReturnType<typeof useI18n>['t']): string | null {
  const value = gift.valorHoy;
  // API anterior, sin valorHoy: en dólares, como antes.
  if (value === undefined) {
    if (gift.usdPorBtcHoy === null) return null;
    const now = formatUsd(satsToUsd(sats, gift.usdPorBtcHoy), lang);
    return before !== null ? t('reclamo.valia', { antes: before, hoy: now }) : t('reclamo.vale', { hoy: now });
  }
  if (gift.original?.moneda === 'SAT') {
    const amount = formatSats(sats, lang);
    return value === null ? t('reclamo.satsSolo', { sats: amount }) : t('reclamo.sats', { sats: amount, usd: formatUsd(value.monto, lang) });
  }
  if (value === null) return null;
  const now = value.moneda === 'ARS' ? formatWhole(value.monto, 'ARS', lang) : formatUsd(value.monto, lang);
  return before !== null && gift.original?.moneda === value.moneda ? t('reclamo.valia', { antes: before, hoy: now }) : t('reclamo.vale', { hoy: now });
}
