import { decodeGiftFragment, type Destination, getNetwork, type GiftWallet, isCoreError, type Network, openGiftWallet } from '@regalale/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiFailure, api, type GiftView } from '../api.ts';
import { ALLOW_MAINNET } from '../config.ts';
import { explorerTxUrl, formatFiat, formatSats, formatUsd, formatUsdExact, satsToUsd } from '../format.ts';
import type { Key } from '../i18n/index.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from '../ui.tsx';
import { AddressStep } from './AddressStep.tsx';
import { ConfirmStep } from './ConfirmStep.tsx';
import { WordsStep } from './WordsStep.tsx';

type Step = 'regalo' | 'palabras' | 'billetera' | 'guia' | 'direccion' | 'confirmar' | 'listo';
type LoadError = 'link' | 'no_existe' | 'sin_red' | 'mainnet';

const OCCASIONS = new Set(['cumple', 'bautismo', 'casamiento', 'nacimiento', 'graduacion', 'navidad', 'amigo', 'porque']);

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
      const w = openGiftWallet(entropy, words, gift.idioma, network);
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
        {network.name !== 'mainnet' && <Notice>{t('guia.signet')}</Notice>}
        <ol class="guia">
          <li>{t('guia.paso1')}</li>
          <li>{t('guia.paso2')}</li>
          <li>
            <strong>{t('guia.paso3')}</strong>
          </li>
          <li>{t('guia.paso4')}</li>
        </ol>
        <label class="casilla casilla-destacada">
          <input type="checkbox" checked={wrote} onChange={(e) => setWrote((e.currentTarget as HTMLInputElement).checked)} />
          {t('guia.anote')}
        </label>
        <Button disabled={!wrote} onClick={() => go('direccion')}>
          {t('guia.listo')}
        </Button>
        <a class="enlace-centrado" href="https://bitcoin.org/es/elija-su-monedero" rel="noopener noreferrer" target="_blank">
          {t('guia.otras')}
        </a>
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
    <Layout testnet={!ALLOW_MAINNET} onBack={back}>
      {body}
    </Layout>
  );
}

function GiftCard({ gift, onReceive, onReload }: { gift: GiftView; onReceive: () => void; onReload: () => void }) {
  const { t, lang } = useI18n();
  const occasion = OCCASIONS.has(gift.ocasion) ? gift.ocasion : 'otra';
  const sats = BigInt(gift.sats.confirmados) + BigInt(gift.sats.sinConfirmar);
  const now = gift.usdPorBtcHoy === null ? null : formatUsd(satsToUsd(sats, gift.usdPorBtcHoy), lang);
  const before = gift.original?.moneda ? formatFiat(gift.original.monto, gift.original.moneda, lang) : null;
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
        <div class={`tarjeta-imagen tinte-${Math.min(Math.max(gift.imagen, 1), 4)}`} aria-hidden="true">
          {t(`ocasion.${occasion}` as Key)}
        </div>
        <div class="tarjeta-texto">
          <StepTitle>{gift.de ? t('reclamo.de', { de: gift.de }) : t('reclamo.anonimo')}</StepTitle>
          {gift.mensaje !== '' && <p class="texto-suave">{gift.mensaje}</p>}
        </div>
      </article>
      {sats > 0n && (
        <div class="caja monto">
          <strong class="monto-sats">{formatSats(sats, lang)}</strong>
          {now !== null && <span class="texto-suave">{before !== null ? t('reclamo.valia', { antes: before, hoy: now }) : t('reclamo.vale', { hoy: now })}</span>}
          {now !== null && gift.usdPorBtcHoy !== null && (
            <small class="letra-chica">
              {t('regalar.cuanto.calculoSats', {
                precio: formatUsdExact(gift.usdPorBtcHoy, lang),
                fuente: 'mempool.space',
                sats: formatSats(sats, lang),
                unBtc: formatSats(100_000_000n, lang).replace(' sats', ''),
                monto: formatUsdExact(satsToUsd(sats, gift.usdPorBtcHoy), lang),
              })}
            </small>
          )}
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
