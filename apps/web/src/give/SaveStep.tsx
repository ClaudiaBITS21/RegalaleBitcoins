import { useState } from 'preact/hooks';
import { accessErrorKey, accountApi, createAccess, signIn } from '../account.ts';
import { ApiFailure } from '../api.ts';
import type { Key } from '../i18n/index.ts';
import { passkeysAvailable } from '../passkey.ts';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';

// Paso 4: "Guardá tu regalo". Con el mail y una passkey (cara, huella o PIN) se crea la
// cuenta y la clave maestra queda cifrada en una bóveda que solo abre esa passkey. Si el
// dispositivo no puede, se usa el código de recuperación de 12 palabras, y entonces el mail es
// obligatorio (Rodolfo, 20/10, opción B): la cuenta se crea con solo el mail, para que los regalos
// queden en una cuenta y descuenten sus créditos. Si el mail ya tiene cuenta, se entra con el link.

type Mode = 'crear' | 'entrar' | 'mail';

export function SaveStep({ onReady, onNeedCode }: { onReady: (master: string, next: number) => void; onNeedCode: (hasCodeAlready: boolean) => void }) {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<Mode>('crear');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  // Pasar de "entrar" a "cuenta nueva" pide confirmar: la cuenta nueva no recupera los regalos de la anterior.
  const [confirmNew, setConfirmNew] = useState(false);
  // Con el código: si ya entró, nuevo (false) o el que ya tiene (true); y a qué mail mandamos el link.
  const [codeHas, setCodeHas] = useState(false);
  const [linkTo, setLinkTo] = useState<string | null>(null);
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

  /** Seguir con el código de 12 palabras: hace falta una cuenta (con sesión abierta o con el mail). */
  const withCode = async (hasCode: boolean) => {
    setCodeHas(hasCode);
    setError(null);
    setBusy(true);
    try {
      if (await accountApi.signedIn().catch(() => false)) return onNeedCode(hasCode);
      if (!emailOk) return setMode('mail');
      try {
        await accountApi.registerMail(email.trim(), lang);
        onNeedCode(hasCode);
      } catch (e) {
        if (!(e instanceof ApiFailure && e.code === 'cuenta_existente')) throw e;
        // El mail ya tiene cuenta: se entra con el link del mail (o con la passkey, si la tiene).
        await accountApi.sendLink(email.trim());
        setLinkTo(email.trim());
        setMode('mail');
      }
    } catch {
      setError('guardar.errorServidor');
    } finally {
      setBusy(false);
    }
  };

  const linkOpened = async () => {
    setError(null);
    if (await accountApi.signedIn().catch(() => false)) onNeedCode(codeHas);
    else setError('guardar.todaviaNo');
  };

  if (mode === 'mail') {
    return (
      <div class="paso">
        <StepTitle>{t('guardar.tituloMail')}</StepTitle>
        {linkTo === null ? (
          <>
            <p class="texto-suave">{t('guardar.textoMail')}</p>
            <form
              class="formulario"
              onSubmit={(e) => {
                e.preventDefault();
                if (emailOk && !busy) void withCode(codeHas);
              }}
            >
              <label class="campo">
                <span>{t('guardar.mail')}</span>
                <input type="email" autocomplete="email" inputMode="email" value={email} onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} />
              </label>
              <Button type="submit" disabled={!emailOk || busy}>
                {t('guardar.seguir')}
              </Button>
            </form>
          </>
        ) : (
          <>
            <p>{t('guardar.linkEnviado', { email: linkTo })}</p>
            <Button onClick={() => void linkOpened()}>{t('guardar.yaEntre')}</Button>
            {supported && (
              <Button kind="contorno" disabled={busy} onClick={() => void run(() => signIn())}>
                {t('guardar.entrar')}
              </Button>
            )}
          </>
        )}
        {error !== null && <Notice kind={error === 'guardar.todaviaNo' ? 'info' : 'error'}>{t(error)}</Notice>}
        <button
          type="button"
          class="boton-texto enlace-centrado"
          onClick={() => {
            setLinkTo(null);
            setError(null);
            setMode('crear');
          }}
        >
          {t('guardar.volver')}
        </button>
      </div>
    );
  }

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
          <Button kind="contorno" disabled={busy} onClick={() => void withCode(true)}>
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
          <button type="button" class="boton-texto enlace-centrado" disabled={busy} onClick={() => void withCode(false)}>
            {t('guardar.prefieroCodigo')}
          </button>
        </>
      )}
    </div>
  );
}
