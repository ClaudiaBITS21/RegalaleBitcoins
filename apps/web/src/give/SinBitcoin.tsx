import type { NetworkName } from '@regalale/core';
import { useState } from 'preact/hooks';
import { formatBtc } from '../format.ts';
import { Button, Notice, useI18n } from '../ui.tsx';

// «¿No tenés bitcoin?»: para quien llega a pagar sin saber cómo. Dos caminos, sin nombrar
// exchanges (docs/contenido.md): con stablecoins, convertir en su plataforma y mandar; con plata
// en el banco, comprar en una plataforma de su país y retirar a la dirección del regalo. La web
// nunca recibe ni convierte dinero (docs/operacion.md, regla 5).

type Via = 'stable' | 'banco';

export function SinBitcoin({ address, sats, network }: { address: string; sats: bigint; network: NetworkName }) {
  const { t, lang } = useI18n();
  const [via, setVia] = useState<Via | null>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Sin portapapeles: la dirección queda a la vista para copiarla a mano.
    }
  };
  const option = (v: Via, key: 'regalar.sinBtc.stable' | 'regalar.sinBtc.banco') => (
    <button type="button" class={`unidad${via === v ? ' elegida' : ''}`} aria-pressed={via === v} onClick={() => setVia(v)}>
      {t(key)}
    </button>
  );
  return (
    <details class="desplegable sin-bitcoin">
      <summary>{t('regalar.sinBtc.titulo')}</summary>
      <p>{t('regalar.sinBtc.pregunta')}</p>
      <div class="sin-bitcoin-opciones" role="group" aria-label={t('regalar.sinBtc.pregunta')}>
        {option('stable', 'regalar.sinBtc.stable')}
        {option('banco', 'regalar.sinBtc.banco')}
      </div>
      {via === 'stable' && <p>{t('regalar.sinBtc.stableTexto')}</p>}
      {via === 'banco' && (
        <>
          <p>
            <strong>{t('regalar.sinBtc.bancoAviso')}</strong>
          </p>
          <ol class="sin-bitcoin-pasos">
            <li>{t('regalar.sinBtc.banco1')}</li>
            <li>{t('regalar.sinBtc.banco2')}</li>
            <li>{t('regalar.sinBtc.banco3')}</li>
          </ol>
        </>
      )}
      {via !== null && (
        <>
          {/* La dirección tal cual, sin espacios: es lo que se pega en el retiro de la plataforma. */}
          <p class="mono direccion-completa" translate={false}>
            {address}
          </p>
          <Button kind="contorno" onClick={() => void copy()}>
            {copied ? t('regalar.pagar.copiado') : t('regalar.pagar.copiarDireccion')}
          </Button>
          <p class="texto-suave">{t('regalar.sinBtc.red', { btc: formatBtc(sats, lang) })}</p>
          {network !== 'mainnet' && <Notice>{t('regalar.sinBtc.prueba', { red: network })}</Notice>}
        </>
      )}
    </details>
  );
}
