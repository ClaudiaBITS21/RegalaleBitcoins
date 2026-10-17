import { useState } from 'preact/hooks';
import { accessErrorKey, accountApi, createAccess, signIn } from '../account.ts';
import { ApiFailure } from '../api.ts';
import type { Key } from '../i18n/index.ts';
import { passkeysAvailable } from '../passkey.ts';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';

// Paso 4: "Guardá tu regalo". Con el mail y una passkey (cara, huella o PIN) se crea la
// cuenta y la clave maestra queda cifrada en una bóveda que solo abre esa passkey. Si el
// dispositivo no puede, se usa el código de recuperación de 12 palabras.

type Mode = 'crear' | 'entrar';

export function SaveStep({ onReady, onNeedCode }: { onReady: (master: string, next: number) => void; onNeedCode: (hasCodeAlready: boolean) => void }) {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<Mode>('crear');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  // Pasar de "entrar" a "cuenta nueva" pide confirmar: la cuenta nueva no recupera los regalos de la anterior.
  const [confirmNew, setConfirmNew] = useState(false);
  const supported = passkeysAvailable();

  const finish = async (master: string | null) => {
    if (master === null) {
      // Passkey sin PRF: la cuenta existe, pero el regalo se resguarda con el código.
      setError('guardar.sinPrf');
      onNeedCode(mode === 'entrar');
      return;
    }
    let next = 0;
    try {
      next = (await accountApi.me()).proximoIndice;
    } catch {
      // Sin panel no pasa nada: el servidor igual avisa si el índice ya se usó.
    }
    onReady(master, next);
  };

  const run = async (action: () => Promise<{ master: string | null }>) => {
    setBusy(true);
    setError(null);
    try {
      await finish((await action()).master);
    } catch (e) {
      // Mail con cuenta: directo a entrar (la passkey nueva no se llegó a crear).
      if (e instanceof ApiFailure && e.code === 'cuenta_existente') setMode('entrar');
      setError(accessErrorKey(e));
    } finally {
      setBusy(false);
    }
  };

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <div class="paso">
      <StepTitle>{t(mode === 'crear' ? 'guardar.titulo' : 'guardar.tituloEntrar')}</StepTitle>
      <p class="texto-suave">{t(mode === 'crear' ? 'guardar.texto' : 'guardar.textoEntrar')}</p>
      {mode === 'crear' ? (
        <form
          class="formulario"
          onSubmit={(e) => {
            e.preventDefault();
            if (emailOk && !busy) void run(() => createAccess(email.trim(), lang));
          }}
        >
          <label class="campo">
            <span>{t('guardar.mail')}</span>
            <input type="email" autocomplete="email" inputMode="email" value={email} onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <Button type="submit" disabled={!emailOk || busy || !supported}>
            {busy ? t('guardar.esperando') : t('guardar.crear')}
          </Button>
        </form>
      ) : (
        <Button disabled={busy || !supported} onClick={() => void run(() => signIn())}>
          {busy ? t('guardar.esperando') : t('guardar.entrar')}
        </Button>
      )}
      <ul class="lista-avisos">
        <li>{t('guardar.punto1')}</li>
        <li>{t('guardar.punto2')}</li>
      </ul>
      {!supported && <Notice kind="error">{t('guardar.noSoportada')}</Notice>}
      {error !== null && <Notice kind={error === 'guardar.sinPrf' || error === 'guardar.yaExiste' ? 'info' : 'error'}>{t(error)}</Notice>}
      {mode === 'entrar' ? (
        <>
          <Button kind="contorno" onClick={() => onNeedCode(true)}>
            {t('guardar.entrarPalabras')}
          </Button>
          {confirmNew ? (
            <div class="caja">
              <Notice>{t('guardar.nuevaAviso')}</Notice>
              <Button
                kind="contorno"
                onClick={() => {
                  setConfirmNew(false);
                  setError(null);
                  setMode('crear');
                }}
              >
                {t('guardar.nuevaConfirmar')}
              </Button>
              <button type="button" class="boton-texto enlace-centrado" onClick={() => setConfirmNew(false)}>
                {t('guardar.nuevaVolver')}
              </button>
            </div>
          ) : (
            <button type="button" class="boton-texto enlace-centrado" onClick={() => setConfirmNew(true)}>
              {t('guardar.soyNuevo')}
            </button>
          )}
        </>
      ) : (
        <>
          <button type="button" class="boton-texto enlace-centrado" onClick={() => setMode('entrar')}>
            {t('guardar.yaTengo')}
          </button>
          <button type="button" class="boton-texto enlace-centrado" onClick={() => onNeedCode(false)}>
            {t('guardar.prefieroCodigo')}
          </button>
        </>
      )}
    </div>
  );
}
