import { LANGS, type Lang, minimumGiftAmount } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.ts';
import { fiatCentsToSats, formatArsExact, formatSats, formatUsd, formatUsdExact, parseAmount, satsToUsd, usdCentsToSats, formatWhole } from '../format.ts';
import { examplesFor, fillName, pickExample, useExamples } from '../content/mensajes.ts';
import { useGreetings, usePlanFeatures } from './planFeatures.ts';
import { type Key, LANG_NAMES } from '../i18n/index.ts';
import { type OccasionChoice, OccasionPicker } from '../content/OccasionPicker.tsx';
import { browserCountry } from '../content/temporada.ts';
import { defaultUnit, presetsFor, type Unit } from './montos.ts';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';
import type { Draft } from './GivePage.tsx';
import { StylePicker } from './StylePicker.tsx';

export const LIMITS = { to: 30, from: 30, message: 280, messageWarn: 240 } as const;
/** Techo de la beta, en dólares. El servidor lo vuelve a controlar. */
/** Montos sugeridos según el techo: 25/50/100 con el de la beta, o un cuarto, la mitad y el techo. */
function presetsUsd(ceilingUsd: number): readonly number[] {
  if (ceilingUsd >= 100) return [25, 50, 100];
  return [...new Set([Math.max(1, Math.round(ceilingUsd / 4)), Math.max(1, Math.round(ceilingUsd / 2)), Math.floor(ceilingUsd)])];
}

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

/** Hueco para el nombre mientras no lo escribió. */
const NO_NAME = '…';

/** El mensaje es el ejemplo tal cual vino (con el nombre de ahora). */
export function isUntouched(d: Pick<Draft, 'message' | 'example' | 'to'>): boolean {
  return d.example !== null && d.message === fillName(d.example, d.to, NO_NAME);
}

export function CardStep({ draft, onChange: change, onNext }: { draft: Draft; onChange: (p: Partial<Draft>) => void; onNext: () => void }) {
  const { t, trato } = useI18n();
  const examples = useExamples(draft.lang, trato);
  // La salutación automática (el mensaje de ejemplo de cada ocasión) viene con los planes.
  const conPlan = usePlanFeatures();
  const conSaludo = useGreetings();
  const list = examples === null || conSaludo !== true ? [] : examplesFor(examples, draft.occasion, 'mensajes');
  // Si cambia el nombre o el idioma y el mensaje sigue siendo el ejemplo, se actualiza con ellos.
  const onChange = (p: Partial<Draft>) => {
    if (isUntouched(draft) && draft.example !== null && p.to !== undefined) p = { ...p, message: fillName(draft.example, p.to, NO_NAME) };
    if (isUntouched(draft) && p.lang !== undefined && p.lang !== draft.lang) p = { ...p, message: '', example: null, undo: null };
    change(p);
  };
  // Llega con un ejemplo real cargado, nunca vacío (salvo que lo haya borrado a propósito).
  useEffect(() => {
    if (draft.example !== null || draft.message !== '' || list.length === 0) return;
    const ex = pickExample(list);
    if (ex !== null) change({ example: ex, message: fillName(ex, draft.to, NO_NAME), undo: null });
  }, [list.length, draft.example, draft.lang]);
  // Lo gratis no trae imagen con IA: si quedó elegida, vuelve a la ilustración.
  useEffect(() => {
    if (conPlan === false && draft.style === 'propia') change({ style: 'ilustracion' });
  }, [conPlan]);
  const another = () => {
    const ex = pickExample(list, draft.example);
    if (ex === null) return;
    change({ example: ex, message: fillName(ex, draft.to, NO_NAME), undo: isUntouched(draft) || draft.message === '' ? null : draft.message });
  };
  const left = LIMITS.message - charCount(draft.message);
  const toOk = charCount(draft.to) > 0 && charCount(draft.to) <= LIMITS.to;
  const fromOk = charCount(draft.from) <= LIMITS.from;
  const imageOk = draft.style !== 'propia' || draft.ownImage !== null;
  const ok = toOk && fromOk && left >= 0 && imageOk;
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
        <textarea rows={5} value={draft.message} onInput={(e) => onChange({ message: (e.currentTarget as HTMLTextAreaElement).value, undo: null })} />
        <span class="mensaje-acciones">
          {list.length > 1 && (
            <button type="button" class="boton-texto" onClick={another}>
              {t('regalar.mensaje.otraIdea')}
            </button>
          )}
          {draft.undo !== null && (
            <button type="button" class="boton-texto" onClick={() => change({ message: draft.undo as string, example: null, undo: null })}>
              {t('regalar.mensaje.deshacer')}
            </button>
          )}
        </span>
        {isUntouched(draft) && <small class="texto-suave">{t('regalar.mensaje.empujoncito')}</small>}
        {conSaludo === false && (
          <small class="texto-suave">
            {t('regalar.mensaje.soloPlanes')} <a href="/precios" target="_blank" rel="noopener">{t('planes.ver')}</a>
          </small>
        )}
        <small class={left < 0 ? 'error-campo' : left <= LIMITS.message - LIMITS.messageWarn ? 'contador contador-aviso' : 'contador'} aria-live="polite">
          {left < 0 ? t('regalar.para.sobran', { n: -left }) : t('regalar.para.quedan', { n: left })}
        </small>
      </label>
      <StylePicker draft={draft} onChange={onChange} conPlan={conPlan} />
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
      {!imageOk && <small class="texto-suave">{t('regalar.ia.falta')}</small>}
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
  /** null = sin tope. */
  readonly maxSats: bigint | null;
}

type Choice = { kind: 'preset'; value: number } | { kind: 'otro'; text: string };
type Picked = Pick<Draft, 'currency' | 'amount' | 'sats'>;

export function AmountStep({
  draft,
  error,
  ceilingUsd,
  presets,
  onNext,
}: {
  draft: Draft;
  error: Key | null;
  /** Techo por regalo que informa la API (/api/salud); null = sin tope (listas con billetera propia). */
  ceilingUsd: number | null;
  /** Montos sugeridos en dólares; si no, salen del techo. */
  presets?: readonly number[];
  onNext: (a: Picked) => void;
}) {
  const { t, lang } = useI18n();
  const [market, setMarket] = useState<Market | null>(null);
  const [failed, setFailed] = useState(false);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);

  const load = async () => {
    setFailed(false);
    try {
      const [{ usdPorBtc: usdPerBtc, arsPorBtc: arsPerBtc, fuenteArs: arsSource }, fees] = await Promise.all([api.price(), api.fees()]);
      setMarket({ usdPerBtc, arsPerBtc, arsSource, minSats: minimumGiftAmount(fees.halfHour), maxSats: ceilingUsd === null ? null : usdCentsToSats(BigInt(Math.round(ceilingUsd * 100)), usdPerBtc) });
      setUnit((u) => u ?? defaultUnit(browserCountry(), arsPerBtc !== null));
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
  if (market === null || unit === null) return <p class="texto-suave cargando">{t('reclamo.cargando')}</p>;

  /** Un monto en la moneda elegida, en centavos (o sats), pasado a lo que se guarda. */
  const pick = (value: bigint): Picked | null => {
    if (unit === 'USD') return { currency: 'USD', amount: Number(value) / 100, sats: usdCentsToSats(value, market.usdPerBtc) };
    if (unit === 'ARS') return market.arsPerBtc === null ? null : { currency: 'ARS', amount: Number(value) / 100, sats: fiatCentsToSats(value, market.arsPerBtc) };
    return { currency: 'SAT', amount: Number(value), sats: value };
  };
  const centsOf = (n: number): bigint => (unit === 'SAT' ? BigInt(n) : BigInt(n) * 100n);

  // Lo que eligió, ya interpretado: en sats y en la moneda elegida.
  let picked: Picked | null = null;
  let problem: string | null = null;
  if (choice?.kind === 'preset') {
    picked = pick(centsOf(choice.value));
  } else if (choice?.kind === 'otro') {
    const fiat = unit !== 'SAT';
    const parsed = parseAmount(choice.text, lang, fiat ? 2 : 0);
    if (parsed.ok && parsed.value > 0n) {
      picked = pick(parsed.value);
    } else if (!parsed.ok && parsed.error !== 'vacio') {
      const example = unit === 'USD' ? formatUsdExact(1234.5, lang) : unit === 'ARS' ? formatArsExact(1234.5, lang) : formatSats(12_500n, lang).replace(' sats', '');
      problem = parsed.error === 'formato' ? t('regalar.cuanto.formato', { ejemplo: example }) : t(fiat ? 'regalar.cuanto.decimales' : 'regalar.cuanto.sinDecimales');
    }
  }
  if (picked !== null && picked.sats < market.minSats) {
    problem = t('regalar.cuanto.minimo', { minimo: formatSats(market.minSats, lang) });
  } else if (picked !== null && market.maxSats !== null && ceilingUsd !== null && picked.sats > market.maxSats) {
    problem = t('regalar.cuanto.maximo', { maximo: formatUsd(ceilingUsd, lang) });
  }
  const valid = picked !== null && problem === null;
  const units: Unit[] = market.arsPerBtc === null ? ['USD', 'SAT'] : ['USD', 'ARS', 'SAT'];
  // Lo que vale en plata: en la moneda elegida, y en dólares si eligió sats. Los pesos, sin decimales.
  const money = (p: Picked): string => {
    if (p.currency === 'USD') return formatUsdExact(p.amount, lang);
    if (p.currency === 'ARS') return formatWhole(p.amount, 'ARS', lang);
    return formatUsdExact(satsToUsd(p.sats, market.usdPerBtc), lang);
  };
  const otro = choice?.kind === 'otro' ? choice : null;
  const usdPresets = presets ?? presetsUsd(ceilingUsd ?? 100);

  return (
    <form
      class="paso"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && picked !== null) onNext(picked);
      }}
    >
      <StepTitle>{t('regalar.cuanto.titulo')}</StepTitle>
      <div class="selector-unidad" role="group" aria-label={t('regalar.cuanto.unidad')}>
        {units.map((u) => (
          <button
            type="button"
            key={u}
            class={`unidad${unit === u ? ' elegida' : ''}`}
            aria-pressed={unit === u}
            onClick={() => {
              setUnit(u);
              if (choice?.kind === 'preset') setChoice(null);
            }}
          >
            {t(u === 'USD' ? 'regalar.cuanto.enDolares' : u === 'ARS' ? 'regalar.cuanto.enPesos' : 'regalar.cuanto.enSats')}
          </button>
        ))}
      </div>
      <div class="opciones-monto">
        {presetsFor(unit, usdPresets).map((n) => {
          const p = pick(centsOf(n));
          const out = p === null || p.sats < market.minSats || (market.maxSats !== null && p.sats > market.maxSats);
          const on = choice?.kind === 'preset' && choice.value === n;
          return (
            <button type="button" key={n} class={`opcion-monto${on ? ' elegida' : ''}`} aria-pressed={on} disabled={out} onClick={() => setChoice({ kind: 'preset', value: n })}>
              <span>{unit === 'SAT' ? formatSats(BigInt(n), lang) : formatWhole(n, unit, lang)}</span>
              {p !== null && (
                <small class="opcion-monto-sats">{unit === 'SAT' ? money(p) : formatSats(p.sats, lang)}</small>
              )}
            </button>
          );
        })}
        <button type="button" class={`opcion-monto${otro !== null ? ' elegida' : ''}`} aria-pressed={otro !== null} onClick={() => setChoice({ kind: 'otro', text: otro?.text ?? '' })}>
          {t('regalar.cuanto.otro')}
        </button>
      </div>
      {otro !== null && (
        <div class="otro-monto">
          <label class="campo">
            <span>{t('regalar.cuanto.monto')}</span>
            <input
              type="text"
              inputMode={unit === 'SAT' ? 'numeric' : 'decimal'}
              autocomplete="off"
              value={otro.text}
              onInput={(e) => setChoice({ kind: 'otro', text: (e.currentTarget as HTMLInputElement).value })}
            />
          </label>
          {unit === 'SAT' && <small class="texto-suave">{t('regalar.cuanto.queEsSat')}</small>}
        </div>
      )}
      {picked !== null && problem === null && (
        <div class="caja monto monto-centrado" aria-live="polite">
          <strong>{t('regalar.cuanto.vasARegalar', { monto: formatSats(picked.sats, lang) })}</strong>
          <span class="texto-suave">{t('regalar.cuanto.equivale', { otro: money(picked) })}</span>
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
        precio: formatWhole(market.arsPerBtc, 'ARS', lang),
        fuente: t(`regalar.fuente.${market.arsSource}`),
        monto: formatWhole(picked.amount, 'ARS', lang),
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
