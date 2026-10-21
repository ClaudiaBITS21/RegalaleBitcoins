import { useEffect, useState } from 'preact/hooks';
import { accessErrorKey, linkApi, signIn } from './account.ts';
import { ApiFailure } from './api.ts';
import type { Key } from './i18n/index.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from './ui.tsx';
import { parseLinkFragment, sealForLink } from './vinculo.ts';

// En el celu, al escanear el QR de la compu (/vincular#<id>.<clave pública>): abre la bóveda con
// la passkey y le pasa la clave maestra a la compu, cifrada para ella (vinculo.ts).

// Se lee una vez y se borra de la barra de direcciones.
const target = parseLinkFragment(window.location.hash);

export function LinkPage({ testnet }: { testnet: boolean }) {
  const { t } = useI18n();
  const [state, setState] = useState<'listo' | 'enviado'>('listo');
  const [error, setError] = useState<Key | null>(target === null ? 'vincular.invalido' : null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `${t('vincular.titulo')} · Regalale Bitcoin`;
    if (window.location.hash !== '') history.replaceState(null, '', window.location.pathname);
  }, []);

  const send = async () => {
    if (target === null) return;
    setBusy(true);
    setError(null);
    try {
      const { master } = await signIn();
      if (master === null) return setError('vincular.sinBoveda');
      await linkApi.complete(target.id, await sealForLink(target.id, target.pub, master));
      setState('enviado');
    } catch (e) {
      setError(e instanceof ApiFailure && e.code === 'vinculo_invalido' ? 'vincular.invalido' : accessErrorKey(e) === 'guardar.bovedaOtroDispositivo' ? 'vincular.sinBoveda' : accessErrorKey(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout testnet={testnet}>
      <div class="paso">
        <StepTitle>{t('vincular.titulo')}</StepTitle>
        {state === 'enviado' ? (
          <Notice kind="ok">{t('vincular.listo')}</Notice>
        ) : (
          <>
            <p>{t('vincular.texto')}</p>
            {error !== null && <Notice kind="error">{t(error)}</Notice>}
            {target !== null && (
              <Button disabled={busy} onClick={() => void send()}>
                {t('vincular.boton')}
              </Button>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
