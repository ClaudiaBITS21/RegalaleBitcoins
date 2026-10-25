import { isCoreError, type Network, parseRecoveryKey, type RecoveryKey, type RecoveryKeyProblem } from '@regalale/core';
import { useState } from 'preact/hooks';
import type { Key } from '../i18n/index.ts';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';

// Pantallas del recupero avanzado (boceto v2 del 25/10): el enlace discreto, la explicación (con
// «Volver») y conectar la billetera. Las usan el paso 4 de Regalar y «Mis regalos».

/** El enlace chico debajo de la opción común; con la billetera ya elegida, su huella y «Cambiar». */
export function AdvancedLink({ chosen, onOpen }: { chosen: RecoveryKey | null; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <p class="avanzado-enlace">
      {chosen !== null && <span>{t('avanzado.activo', { huella: chosen.fingerprintHex })} · </span>}
      <button type="button" class="boton-texto" onClick={onOpen}>
        {chosen === null ? t('avanzado.link') : t('avanzado.cambiar')}
      </button>
    </p>
  );
}

/** La explicación: la cajita con dos cerraduras. «Mejor sigo con la web» vuelve sin cambiar nada. */
export function AdvancedIntro({ onUse, onCommon }: { onUse: () => void; onCommon: () => void }) {
  const { t } = useI18n();
  return (
    <div class="paso">
      <StepTitle>{t('avanzado.titulo')}</StepTitle>
      <p>{t('avanzado.p1')}</p>
      <p>{t('avanzado.p2')}</p>
      <div class="caja avanzado-preguntas">
        {(['1', '2', '3'] as const).map((n) => (
          <details key={n}>
            <summary>{t(`avanzado.q${n}` as Key)}</summary>
            <p>{t(`avanzado.a${n}` as Key)}</p>
          </details>
        ))}
      </div>
      <Button onClick={onUse}>{t('avanzado.usar')}</Button>
      <Button kind="contorno" onClick={onCommon}>
        {t('avanzado.seguirWeb')}
      </Button>
      <p class="texto-suave texto-chico">{t('avanzado.soloNuevos')}</p>
    </div>
  );
}

const PROBLEMS: Readonly<Record<RecoveryKeyProblem, Key>> = {
  formato: 'avanzado.error.formato',
  privada: 'avanzado.error.privada',
  origen: 'avanzado.error.origen',
  ruta: 'avanzado.error.ruta',
  red: 'avanzado.error.red',
  profundidad: 'avanzado.error.profundidad',
};

/**
 * Conectar la billetera: pega (o sube el archivo de) la clave pública multifirma, y confirma en
 * su billetera que la huella sea la misma. Sin esa confirmación, el modo no se activa.
 */
export function ConnectWallet({ network, onConnected }: { network: Network; onConnected: (key: RecoveryKey) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [key, setKey] = useState<RecoveryKey | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [mismatch, setMismatch] = useState(false);

  const check = (value: string) => {
    setKey(null);
    setMismatch(false);
    setError(null);
    if (value.trim() === '') return;
    try {
      setKey(parseRecoveryKey(value, network));
    } catch (e) {
      const problem = isCoreError(e, 'INVALID_XPUB') ? ((e.details as { problem?: RecoveryKeyProblem } | undefined)?.problem ?? 'formato') : 'formato';
      setError(PROBLEMS[problem]);
      // Una clave privada no queda ni en el campo.
      if (problem === 'privada') setText('');
    }
  };

  const fromFile = async (file: File | undefined) => {
    if (file === undefined || file.size > 20_000) return;
    const value = await file.text();
    setText(value.trim());
    check(value);
  };

  return (
    <div class="paso">
      <StepTitle>{t('avanzado.conectar.titulo')}</StepTitle>
      <div class="avanzado-paso">
        <span class="avanzado-numero">1</span>
        <p>{t('avanzado.conectar.paso1')}</p>
      </div>
      <label class="campo">
        <span>{t('avanzado.conectar.campo')}</span>
        <textarea
          class="avanzado-clave"
          rows={3}
          spellcheck={false}
          autocomplete="off"
          value={text}
          onInput={(e) => {
            const v = (e.currentTarget as HTMLTextAreaElement).value;
            setText(v);
            setKey(null);
            setError(null);
          }}
        />
      </label>
      <div class="avanzado-fila">
        <label class="boton boton-contorno avanzado-archivo">
          {t('avanzado.conectar.archivo')}
          <input type="file" accept=".json,.txt,application/json,text/plain" onChange={(e) => void fromFile((e.currentTarget as HTMLInputElement).files?.[0])} />
        </label>
        <Button kind="contorno" disabled={text.trim() === ''} onClick={() => check(text)}>
          {t('avanzado.conectar.revisar')}
        </Button>
      </div>
      {error !== null && <Notice kind="error">{t(error)}</Notice>}
      {key !== null && (
        <>
          <div class="avanzado-paso">
            <span class="avanzado-numero">2</span>
            <p>{t('avanzado.conectar.paso2')}</p>
          </div>
          <p class="avanzado-huella">{key.fingerprintHex.toUpperCase()}</p>
          <div class="avanzado-fila">
            <Button kind="contorno" onClick={() => setMismatch(true)}>
              {t('avanzado.conectar.no')}
            </Button>
            <Button onClick={() => onConnected(key)}>{t('avanzado.conectar.si')}</Button>
          </div>
          <Notice kind={mismatch ? 'error' : 'info'}>{t(mismatch ? 'avanzado.conectar.noCoincide' : 'avanzado.conectar.cifrada')}</Notice>
        </>
      )}
    </div>
  );
}
