import { useEffect, useState } from 'preact/hooks';
import { api, type GiftView } from '../api.ts';

const POLL_MS = 5_000;

/**
 * Estado del regalo según el servidor, que lo calcula desde la cadena. Se consulta cada
 * pocos segundos y al volver a la pestaña. El navegador nunca decide que algo se pagó.
 */
export function useGiftStatus(id: string): { view: GiftView | null; failed: boolean } {
  const [view, setView] = useState<GiftView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const v = await api.gift(id);
        if (alive) {
          setView(v);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id]);
  return { view, failed };
}

export function receivedSats(view: GiftView): bigint {
  return BigInt(view.sats.confirmados) + BigInt(view.sats.sinConfirmar);
}
