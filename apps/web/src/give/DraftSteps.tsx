import { LANGS, type Lang, minimumGiftAmount } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.ts';
import { fiatCentsToSats, formatArsExact, formatSats, formatUsd, formatUsdExact, parseAmount, satsToUsd, usdCentsToSats } from '../format.ts';
import { type Key, LANG_NAMES } from '../i18n/index.ts';
import { CARD_VARIANTS, GiftCardArt } from '../content/GiftCardArt.tsx';
import { type OccasionChoice, OccasionPicker } from '../content/OccasionPicker.tsx';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';
import type { Draft } from './GivePage.tsx';

export const LIMITS = { to: 30, from: 30, message: 280, messageWarn: 240 } as const;
/** Techo de la beta, en dólares. El servidor lo vuelve a controlar. */
export const CEILING_USD = 100;
const PRESETS_USD = [25, 50, 100] as const;

/** Caracteres como los ve la persona: un emoji cuenta como uno. */
export const charCount = (s: string): number => [...s.trim()].length;

export function OccasionStep({ value, onPick }: { value: OccasionChoice | null; onPick: (choice: OccasionChoice) => void }) {
  const { t } = useI18n();
  const [choice, setChoice] = useState<OccasionChoice | null>(value);
  return (
    <div class="paso">
      <StepTitle>{t('regalar.ocasion.titulo')}</StepTitle>
      <OccasionPicker value={choice} onPick={setChoice} />
      <Button disabled={choice === null} onClick={() => choice !== null && onPick(choice)}>
        {t('seguir')}
      </Button>
    </div>
  );
}

export function CardStep({ draft, onChange, onNext }: { draft: Draft; onChange: (p: Partial<Draft>) => void; onNext: () => void }) {
  const { t } = useI18n();
  const left = LIMITS.message - charCount(draft.message);
  const toOk = charCount(draft.to) > 0 && charCount(draft.to) <= LIMITS.to;
  const fromOk = charCount(draft.from) <= LIMITS.from;
  const ok = toOk && fromOk && left >= 0;
  return (
    <form
      class="paso"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onNext();
      }}
    >
      <StepTitle>{t('regalar.para.titulo')}</StepTitle>
      <label class="campo">
        <span>{t('regalar.para.nombre')}</span>
        <input type="text" value={draft.to} autocomplete="off" onInput={(e) => onChange({ to: (e.currentTarget as HTMLInputElement).value })} />
        {charCount(draft.to) > LIMITS.to && <small class="error-campo">{t('regalar.para.largo', { n: LIMITS.to })}</small>}
      </label>
      <label class="campo">
        <span>{t('regalar.para.de')}</span>
        <input type="text" value={draft.from} autocomplete="name" onInput={(e) => onChange({ from: (e.currentTarget as HTMLInputElement).value })} />
        {!fromOk && <small class="error-campo">{t('regalar.para.largo', { n: LIMITS.from })}</small>}
      </label>
      <label class="campo">
        <span>{t('regalar.para.mensaje')}</span>
        <textarea rows={4} value={draft.message} onInput={(e) => onChange({ message: (e.currentTarget as HTMLTextAreaElement).value })} />
        <small class={left < 0 ? 'error-campo' : left <= LIMITS.message - LIMITS.messageWarn ? 'contador contador-aviso' : 'contador'} aria-live="polite">
          {left < 0 ? t('regalar.para.sobran', { n: -left }) : t('regalar.para.quedan', { n: left })}
        </small>
      </label>
      <fieldset class="campo">
        <legend>{t('regalar.para.imagen')}</legend>
        <div class="grilla-imagenes">
          {CARD_VARIANTS.map((n) => (
            <button
              type="button"
              key={n}
              class={`imagen-opcion${draft.image === n ? ' elegida' : ''}`}
              aria-pressed={draft.image === n}
              aria-label={t('regalar.para.imagenN', { n })}
              onClick={() => onChange({ image: n })}
            >
              <GiftCardArt occasion={draft.occasion} variant={n} />
            </button>
          ))}
        </div>
      </fieldset>
      <label class="campo">
        <span>{t('regalar.para.idioma')}</span>
        <select value={draft.lang} onChange={(e) => onChange({ lang: (e.currentTarget as HTMLSelectElement).value as Lang })}>
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {LANG_NAMES[l]}
            </option>
          ))}
        </select>
        <small class="texto-suave">{t('regalar.para.idiomaAyuda')}</small>
      </label>
      <Button type="submit" disabled={!ok}>
        {t('seguir')}
      </Button>
    </form>
  );
}

interface Market {
  readonly usdPerBtc: number;
  /** null si no hay cotización en pesos: entonces no se ofrece regalar en pesos. */
  readonly arsPerBtc: number | null;
  readonly arsSource: 'criptoya' | 'bitso' | null;
  readonly minSats: bigint;
  readonly maxSats: bigint;
}

type Unit = 'USD' | 'ARS' | 'SAT';
type Choice = { kind: 'preset'; usd: number } | { kind: 'otro'; unit: Unit; text: string };

export function AmountStep({
  draft,
  error,
  onNext,
}: {
  draft: Draft;
  error: Key | null;
  onNext: (a: Pick<Draft, 'currency' | 'amount' | 'sats'>) => void;
}) {
  const { t, lang } = useI18n();
  const [market, setMarket] = useState<Market | null>(null);
  const [failed, setFailed] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);

  const load = async () => {
    setFailed(false);
    try {
      const [{ usdPorBtc: usdPerBtc, arsPorBtc: arsPerBtc, fuenteArs: arsSource }, fees] = await Promise.all([api.price(), api.fees()]);
      setMarket({ usdPerBtc, arsPerBtc, arsSource, minSats: minimumGiftAmount(fees.halfHour), maxSats: usdCentsToSats(BigInt(CEILING_USD * 100), usdPerBtc) });
    } catch {
      setFailed(true);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  if (failed) {
    return (
      <div class="paso">
        <StepTitle>{t('regalar.cuanto.titulo')}</StepTitle>
        <Notice kind="error">{t('regalar.cuanto.sinPrecio')}</Notice>
        <Button onClick={() => void load()}>{t('reintentar')}</Button>
      </div>
    );
  }
  if (market === null) return <p class="texto-suave cargando">{t('reclamo.cargando')}</p>;

  // Lo que eligió, ya interpretado: en sats y en la moneda elegida.
  let picked: Pick<Draft, 'currency' | 'amount' | 'sats'> | null = null;
  let problem: string | null = null;
  if (choice?.kind === 'preset') {
    picked = { currency: 'USD', amount: choice.usd, sats: usdCentsToSats(BigInt(choice.usd * 100), market.usdPerBtc) };
  } else if (choice?.kind === 'otro') {
    const fiat = choice.unit !== 'SAT';
    const parsed = parseAmount(choice.text, lang, fiat ? 2 : 0);
    if (parsed.ok && parsed.value > 0n) {
      if (choice.unit === 'USD') picked = { currency: 'USD', amount: Number(parsed.value) / 100, sats: usdCentsToSats(parsed.value, market.usdPerBtc) };
      else if (choice.unit === 'ARS' && market.arsPerBtc !== null) picked = { currency: 'ARS', amount: Number(parsed.value) / 100, sats: fiatCentsToSats(parsed.value, market.arsPerBtc) };
      else if (choice.unit === 'SAT') picked = { currency: 'SAT', amount: Number(parsed.value), sats: parsed.value };
    } else if (!parsed.ok && parsed.error !== 'vacio') {
      const example = choice.unit === 'USD' ? formatUsdExact(1234.5, lang) : choice.unit === 'ARS' ? formatArsExact(1234.5, lang) : formatSats(12_500n, lang).replace(' sats', '');
      problem = parsed.error === 'formato' ? t('regalar.cuanto.formato', { ejemplo: example }) : t(fiat ? 'regalar.cuanto.decimales' : 'regalar.cuanto.sinDecimales');
    }
  }
  if (picked !== null && picked.sats < market.minSats) {
    problem = t('regalar.cuanto.minimo', { minimo: formatSats(market.minSats, lang) });
  } else if (picked !== null && picked.sats > market.maxSats) {
    problem = t('regalar.cuanto.maximo', { maximo: formatUsd(CEILING_USD, lang) });
  }
  const valid = picked !== null && problem === null;
  const usdOf = (sats: bigint) => formatUsdExact(satsToUsd(sats, market.usdPerBtc), lang);
  const otro = choice?.kind === 'otro' ? choice : null;
  const units: Unit[] = market.arsPerBtc === null ? ['USD', 'SAT'] : ['USD', 'ARS', 'SAT'];
  const shown = (p: Pick<Draft, 'currency' | 'amount' | 'sats'>): string =>
    p.currency === 'USD' ? formatUsdExact(p.amount, lang) : p.currency === 'ARS' ? formatArsExact(p.amount, lang) : formatSats(p.sats, lang);
  // Equivalencias: siempre en sats, y en dólares si eligió otra moneda.
  const equivalent = (p: Pick<Draft, 'currency' | 'amount' | 'sats'>): string =>
    p.currency === 'USD' ? formatSats(p.sats, lang) : p.currency === 'ARS' ? `${formatSats(p.sats, lang)} · ${usdOf(p.sats)}` : usdOf(p.sats);

  return (
    <form
      class="paso"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && picked !== null) onNext(picked);
      }}
    >
      <StepTitle>{t('regalar.cuanto.titulo')}</StepTitle>
      <div class="opciones-monto">
        {PRESETS_USD.map((usd) => {
          const tooSmall = usdCentsToSats(BigInt(usd * 100), market.usdPerBtc) < market.minSats;
          const on = choice?.kind === 'preset' && choice.usd === usd;
          return (
            <button type="button" key={usd} class={`opcion-monto${on ? ' elegida' : ''}`} aria-pressed={on} disabled={tooSmall} onClick={() => setChoice({ kind: 'preset', usd })}>
              {formatUsd(usd, lang)}
            </button>
          );
        })}
        <button
          type="button"
          class={`opcion-monto${otro !== null ? ' elegida' : ''}`}
          aria-pressed={otro !== null}
          onClick={() => setChoice({ kind: 'otro', unit: otro?.unit ?? 'USD', text: otro?.text ?? '' })}
        >
          {t('regalar.cuanto.otro')}
        </button>
      </div>
      {otro !== null && (
        <div class="otro-monto">
          <div class="selector-unidad" role="group" aria-label={t('regalar.cuanto.unidad')}>
            {units.map((u) => (
              <button type="button" key={u} class={`unidad${otro.unit === u ? ' elegida' : ''}`} aria-pressed={otro.unit === u} onClick={() => setChoice({ ...otro, unit: u })}>
                {t(u === 'USD' ? 'regalar.cuanto.enDolares' : u === 'ARS' ? 'regalar.cuanto.enPesos' : 'regalar.cuanto.enSats')}
              </button>
            ))}
          </div>
          <label class="campo">
            <span>{t('regalar.cuanto.monto')}</span>
            <input
              type="text"
              inputMode={otro.unit === 'SAT' ? 'numeric' : 'decimal'}
              autocomplete="off"
              value={otro.text}
              onInput={(e) => setChoice({ ...otro, text: (e.currentTarget as HTMLInputElement).value })}
            />
          </label>
          {otro.unit === 'SAT' && <small class="texto-suave">{t('regalar.cuanto.queEsSat')}</small>}
        </div>
      )}
      {picked !== null && problem === null && (
        <div class="caja monto" aria-live="polite">
          <strong>
            {t('regalar.cuanto.vasARegalar', { monto: shown(picked) })}
          </strong>
          <span class="texto-suave">
            {t('regalar.cuanto.equivale', { otro: equivalent(picked) })}
          </span>
          <Calculation picked={picked} market={market} />
        </div>
      )}
      {problem !== null && <Notice kind="error">{problem}</Notice>}
      {error !== null && <Notice kind="error">{t(error)}</Notice>}
      <Button type="submit" disabled={!valid}>
        {t('seguir')}
      </Button>
    </form>
  );
}

/**
 * La letra chica de la conversión: de dónde sale la cotización, cuál es y la cuenta,
 * para que cualquiera la pueda verificar.
 */
function Calculation({ picked, market }: { picked: Pick<Draft, 'currency' | 'amount' | 'sats'>; market: Market }) {
  const { t, lang } = useI18n();
  const oneBtc = formatSats(100_000_000n, lang).replace(' sats', '');
  const usdPrice = formatUsdExact(market.usdPerBtc, lang);
  const lines: string[] = [];
  if (picked.currency === 'ARS' && market.arsPerBtc !== null && market.arsSource !== null) {
    lines.push(
      t('regalar.cuanto.calculo', {
        precio: formatArsExact(market.arsPerBtc, lang),
        fuente: t(`regalar.fuente.${market.arsSource}`),
        monto: formatArsExact(picked.amount, lang),
        unBtc: oneBtc,
        sats: formatSats(picked.sats, lang),
      }),
    );
  }
  if (picked.currency === 'USD') {
    lines.push(t('regalar.cuanto.calculo', { precio: usdPrice, fuente: 'mempool.space', monto: formatUsdExact(picked.amount, lang), unBtc: oneBtc, sats: formatSats(picked.sats, lang) }));
  } else {
    lines.push(
      t('regalar.cuanto.calculoSats', {
        precio: usdPrice,
        fuente: 'mempool.space',
        sats: formatSats(picked.sats, lang),
        unBtc: oneBtc,
        monto: formatUsdExact(satsToUsd(picked.sats, market.usdPerBtc), lang),
      }),
    );
  }
  return (
    <small class="letra-chica">
      {lines.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </small>
  );
}
