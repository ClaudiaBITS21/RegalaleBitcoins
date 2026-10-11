import { foldWord, type Lang, normalizeWord, PASSPHRASE_WORDS, suggestWords } from '@regalale/core';
import { useRef, useState } from 'preact/hooks';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';

/**
 * Las 4 palabras de la passphrase. Autocompleta con la lista BIP39 del idioma del
 * regalo y acepta palabras con o sin tilde. `onSubmit` devuelve un error o null.
 */
export function WordsStep({ lang, onSubmit }: { lang: Lang; onSubmit: (words: string[]) => Promise<string | null> }) {
  const { t } = useI18n();
  const [values, setValues] = useState<string[]>(Array.from({ length: PASSPHRASE_WORDS }, () => ''));
  const [touched, setTouched] = useState<boolean[]>(Array.from({ length: PASSPHRASE_WORDS }, () => false));
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const normalized = values.map((v) => normalizeWord(v, lang));
  const complete = normalized.every((w) => w !== null);
  const current = values[active] ?? '';
  const suggestions = suggestWords(current, lang, 4).filter((s) => s !== foldWord(current));

  const update = (i: number, value: string) => {
    // Si pegan las 4 palabras juntas en un campo, se reparten.
    const parts = value.trim().split(/\s+/u);
    if (parts.length === PASSPHRASE_WORDS) {
      setValues(parts);
      setTouched(parts.map(() => true));
      setError(null);
      return;
    }
    setValues((prev) => prev.map((v, j) => (j === i ? value : v)));
    setError(null);
  };

  const pick = (i: number, word: string) => {
    update(i, word);
    setTouched((prev) => prev.map((v, j) => (j === i ? true : v)));
    inputs.current[i + 1]?.focus();
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!complete || busy) return;
    setBusy(true);
    // Deja pintar el estado "ocupado": derivar la semilla tarda unos cientos de milisegundos.
    await new Promise((r) => setTimeout(r, 30));
    setError(await onSubmit(normalized as string[]));
    setBusy(false);
  };

  return (
    <form class="paso" onSubmit={submit} autocomplete="off">
      <StepTitle>{t('palabras.titulo')}</StepTitle>
      <p class="texto-suave">{t('palabras.texto')}</p>
      <div class="grilla-palabras">
        {values.map((value, i) => {
          const invalid = touched[i] === true && value.trim() !== '' && normalized[i] === null;
          return (
            <label class="campo" key={i}>
              <span>{t('palabras.etiqueta', { n: i + 1 })}</span>
              <input
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                type="text"
                value={value}
                autocomplete="off"
                autocapitalize="none"
                autocorrect="off"
                spellcheck={false}
                aria-invalid={invalid}
                onFocus={() => setActive(i)}
                onInput={(e) => update(i, (e.currentTarget as HTMLInputElement).value)}
                onBlur={() => setTouched((prev) => prev.map((v, j) => (j === i ? true : v)))}
              />
              {invalid && <small class="error-campo">{t('palabras.fueraDeLista')}</small>}
            </label>
          );
        })}
      </div>
      {suggestions.length > 0 && (
        <div class="sugerencias" role="listbox" aria-label={t('palabras.etiqueta', { n: active + 1 })}>
          {suggestions.map((s) => (
            <button type="button" class="sugerencia" key={s} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(active, s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      {error !== null && <Notice kind="error">{error}</Notice>}
      <Button type="submit" disabled={!complete || busy}>
        {t('seguir')}
      </Button>
    </form>
  );
}
