import type { Network } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import { type AccountGift, linkApi, repairVaultFromPhone } from '../account.ts';
import { ApiFailure } from '../api.ts';
import { Qr } from '../give/Qr.tsx';
import { Button, Notice, useI18n } from '../ui.tsx';
import { startLink } from '../vinculo.ts';

// La compu entró por QR y la passkey no abre la bóveda: muestra un QR para que el celu donde se
// creó el acceso le pase la clave maestra cifrada (vinculo.ts). Sin escribir las 12 palabras.

const POLL_MS = 2500;

export function VincularCelu({ gifts, network, onMaster }: { gifts: readonly AccountGift[]; network: Network; onMaster: (master: string) => void }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'esperando' | 'vencido' | 'error'>('esperando');
  const [round, setRound] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    setUrl(null);
    setState('esperando');
    void (async () => {
      try {
        const { id } = await linkApi.create();
        const link = await startLink(id);
        if (!alive) return;
        setUrl(`${window.location.origin}/vincular#${link.fragment}`);
        const tick = async () => {
          if (!alive) return;
          try {
            const { paquete } = await linkApi.poll(id);
            if (paquete === null) {
              timer = window.setTimeout(() => void tick(), POLL_MS);
              return;
            }
            onMaster(await repairVaultFromPhone(await link.open(paquete), gifts, network));
          } catch (e) {
            if (alive) setState(e instanceof ApiFailure && e.code === 'vinculo_invalido' ? 'vencido' : 'error');
          }
        };
        timer = window.setTimeout(() => void tick(), POLL_MS);
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [round]);

  return (
    <div class="caja vincular-celu">
      <strong>{t('panel.vincular.titulo')}</strong>
      <p class="texto-suave">{t('panel.vincular.texto')}</p>
      {state === 'esperando' && url !== null && (
        <>
          <div class="vincular-qr" data-link={url}>
            <Qr text={url} label={t('panel.vincular.qr')} />
          </div>
          <p class="texto-suave cargando">{t('panel.vincular.esperando')}</p>
        </>
      )}
      {state !== 'esperando' && (
        <>
          <Notice kind="error">{t(state === 'vencido' ? 'panel.vincular.vencido' : 'panel.vincular.error')}</Notice>
          <Button kind="contorno" onClick={() => setRound(round + 1)}>
            {t('panel.vincular.otro')}
          </Button>
        </>
      )}
    </div>
  );
}
