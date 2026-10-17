import { isValidMasterMnemonic, normalizeMnemonic } from '@regalale/core';
import { useState } from 'preact/hooks';
import type { Key } from '../i18n/index.ts';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';

// El código de recuperación es la clave maestra del que regala (12 palabras en inglés).
// Hasta que exista la bóveda con passkey, se pide anotarlo antes de pagar: si se cierra
// la página después de pagar, con el código se recupera el regalo.

const VERIFY_COUNT = 3;

export function ShowCode({ mnemonic, onNext, onHaveCode }: { mnemonic: string; onNext: () => void; onHaveCode: () => void }) {
  const { t } = useI18n();
  const [wrote, setWrote] = useState(false);
  return (
    <div class="paso">
      <StepTitle>{t('regalar.codigo.titulo')}</StepTitle>
      <p class="texto-suave">{t('regalar.codigo.porque')}</p>
      <ol class="codigo" translate={false}>
        {mnemonic.split(' ').map((w, i) => (
          <li key={i}>
            <span class="codigo-n">{i + 1}</span> {w}
          </li>
        ))}
      </ol>
      <ul class="lista-avisos">
        <li>{t('regalar.codigo.texto1')}</li>
        <li>{t('regalar.codigo.texto2')}</li>
        <li>{t('regalar.codigo.texto3')}</li>
        <li>
          <strong>{t('regalar.codigo.texto4')}</strong>
        </li>
      </ul>
      <label class="casilla casilla-destacada">
        <input type="checkbox" checked={wrote} onChange={(e) => setWrote((e.currentTarget as HTMLInputElement).checked)} />
        {t('regalar.codigo.anote')}
      </label>
      <Button disabled={!wrote} onClick={onNext}>
        {t('seguir')}
      </Button>
      <button type="button" class="boton-texto enlace-centrado" onClick={onHaveCode}>
        {t('regalar.codigo.tengo')}
      </button>
    </div>
  );
}

/** Posiciones al azar (con crypto.getRandomValues) para verificar que lo anotó. */
function randomPositions(total: number, count: number): number[] {
  const picked = new Set<number>();
  const buf = new Uint32Array(1);
  while (picked.size < count) {
    crypto.getRandomValues(buf);
    picked.add((buf[0] as number) % total);
  }
  return [...picked].sort((a, b) => a - b);
}

export function VerifyCode({ mnemonic, onOk, error }: { mnemonic: string; onOk: () => void; error: Key | null }) {
  const { t } = useI18n();
  const words = mnemonic.split(' ');
  const [positions] = useState(() => randomPositions(words.length, VERIFY_COUNT));
  const [values, setValues] = useState<string[]>(() => positions.map(() => ''));
  const [wrong, setWrong] = useState(false);
  return (
    <form
      class="paso"
      autocomplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        const ok = positions.every((p, i) => normalizeMnemonic(values[i] ?? '') === words[p]);
        setWrong(!ok);
        if (ok) onOk();
      }}
    >
      <StepTitle>{t('regalar.verificar.titulo')}</StepTitle>
      <p class="texto-suave">{t('regalar.verificar.texto')}</p>
      {positions.map((p, i) => (
        <label class="campo" key={p}>
          <span>{t('regalar.verificar.palabra', { n: p + 1 })}</span>
          <input
            type="text"
            value={values[i]}
            autocomplete="off"
            autocapitalize="none"
            autocorrect="off"
            spellcheck={false}
            onInput={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value;
              setValues((prev) => prev.map((x, j) => (j === i ? v : x)));
              setWrong(false);
            }}
          />
        </label>
      ))}
      {wrong && <Notice kind="error">{t('regalar.verificar.error')}</Notice>}
      {error !== null && <Notice kind="error">{t(error)}</Notice>}
      <Button type="submit" disabled={values.some((v) => v.trim() === '')}>
        {t('seguir')}
      </Button>
    </form>
  );
}

export function EnterCode({ onOk, error }: { onOk: (mnemonic: string) => void; error: Key | null }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      class="paso"
      autocomplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isValidMasterMnemonic(value)) {
          setInvalid(true);
          return;
        }
        onOk(normalizeMnemonic(value));
      }}
    >
      <StepTitle>{t('regalar.tengo.titulo')}</StepTitle>
      <p class="texto-suave">{t('regalar.tengo.texto')}</p>
      <label class="campo">
        <span>{t('regalar.tengo.etiqueta')}</span>
        <textarea
          rows={3}
          value={value}
          autocapitalize="none"
          autocorrect="off"
          spellcheck={false}
          translate={false}
          onInput={(e) => {
            setValue((e.currentTarget as HTMLTextAreaElement).value);
            setInvalid(false);
          }}
        />
      </label>
      {invalid && <Notice kind="error">{t('regalar.tengo.invalido')}</Notice>}
      {error !== null && <Notice kind="error">{t(error)}</Notice>}
      <Button type="submit" disabled={value.trim() === ''}>
        {t('seguir')}
      </Button>
    </form>
  );
}
