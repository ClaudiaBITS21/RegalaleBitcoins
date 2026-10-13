import { LANGS, type Lang, minimumGiftAmount } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.ts';
import { formatSats, formatUsd, formatUsdExact, parseAmount, satsToUsd, usdCentsToSats } from '../format.ts';
import { type Key, LANG_NAMES } from '../i18n/index.ts';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';
import type { Draft } from './GivePage.tsx';

export const OCCASIONS = ['cumple', 'navidad', 'nacimiento', 'bautismo', 'casamiento', 'graduacion', 'amigo', 'porque', 'otra'] as const;
export const LIMITS = { to: 30, from: 30, message: 280, messageWarn: 240 } as const;
/** Techo de la beta, en dólares. El servidor lo vuelve a controlar. */
export const CEILING_USD = 100;
const PRESETS_USD = [25, 50, 100] as const;

/** Caracteres como los ve la persona: un emoji cuenta como uno. */
export const charCount = (s: string): number => [...s.trim()].length;

export function OccasionStep({ value, onPick }: { value: string; onPick: (occasion: string) => void }) {
  const { t } = useI18n();
  return (
    <div class="paso">
      <StepTitle>{t('regalar.ocasion.titulo')}</StepTitle>
      <div class="grilla-ocasiones">
        {OCCASIONS.map((o) => (
          <button type="button" key={o} class={`ocasion${value === o ? ' elegida' : ''}`} aria-pressed={value === o} onClick={() => onPick(o)}>
            {t(o === 'otra' ? 'regalar.ocasion.otra' : (`ocasion.${o}` as Key))}
          </button>
        ))}
      </div>
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
          {[1, 2, 3, 4].map((n) => (
            <button
              type="button"
              key={n}
              class={`imagen-opcion tinte-${n}${draft.image === n ? ' elegida' : ''}`}
              aria-pressed={draft.image === n}
              aria-label={t('regalar.para.imagenN', { n })}
              onClick={() => onChange({ image: n })}
            />
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
  readonly minSats: bigint;
  readonly maxSats: bigint;
}

type Choice = { kind: 'preset'; usd: number } | { kind: 'otro'; unit: 'USD' | 'SAT'; text: string };

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
      const [usdPerBtc, fees] = await Promise.all([api.price(), api.fees()]);
      setMarket({ usdPerBtc, minSats: minimumGiftAmount(fees.halfHour), maxSats: usdCentsToSats(BigInt(CEILING_USD * 100), usdPerBtc) });
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
    const parsed = parseAmount(choice.text, lang, choice.unit === 'USD' ? 2 : 0);
    if (parsed.ok && parsed.value > 0n) {
      picked =
        choice.unit === 'USD'
          ? { currency: 'USD', amount: Number(parsed.value) / 100, sats: usdCentsToSats(parsed.value, market.usdPerBtc) }
          : { currency: 'SAT', amount: Number(parsed.value), sats: parsed.value };
    } else if (!parsed.ok && parsed.error !== 'vacio') {
      problem =
        parsed.error === 'formato'
          ? t('regalar.cuanto.formato', { ejemplo: choice.unit === 'USD' ? formatUsdExact(1234.5, lang) : formatSats(12_500n, lang).replace(' sats', '') })
          : t(choice.unit === 'USD' ? 'regalar.cuanto.decimales' : 'regalar.cuanto.sinDecimales');
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
            {(['USD', 'SAT'] as const).map((u) => (
              <button type="button" key={u} class={`unidad${otro.unit === u ? ' elegida' : ''}`} aria-pressed={otro.unit === u} onClick={() => setChoice({ ...otro, unit: u })}>
                {t(u === 'USD' ? 'regalar.cuanto.enDolares' : 'regalar.cuanto.enSats')}
              </button>
            ))}
          </div>
          <label class="campo">
            <span>{t('regalar.cuanto.monto')}</span>
            <input
              type="text"
              inputMode={otro.unit === 'USD' ? 'decimal' : 'numeric'}
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
            {t('regalar.cuanto.vasARegalar', {
              monto: picked.currency === 'USD' ? formatUsdExact(picked.amount, lang) : formatSats(picked.sats, lang),
            })}
          </strong>
          <span class="texto-suave">
            {t('regalar.cuanto.equivale', { otro: picked.currency === 'USD' ? formatSats(picked.sats, lang) : usdOf(picked.sats) })}
          </span>
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
