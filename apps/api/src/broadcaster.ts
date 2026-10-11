import { addressFromScript, inspectTransaction, type Network } from '@regalale/core';
import { ChainError, type ChainClient } from './chain.ts';
import type { Sql } from './db.ts';
import { allPending, findGift, markPending, recordClaim } from './gifts.ts';

// Difunde los barridos firmados con "esperar a que baje la comisión" cuando la red
// los acepta. El servidor no puede cambiarlos: solo decide cuándo mandarlos.

export interface BroadcasterDeps {
  readonly sql: Sql;
  readonly chain: ChainClient;
  readonly network: Network;
}

export async function processPending({ sql, chain, network }: BroadcasterDeps): Promise<{ difundidas: number; canceladas: number }> {
  const pending = await allPending(sql);
  if (pending.length === 0) return { difundidas: 0, canceladas: 0 };
  const fees = await chain.fees();
  let difundidas = 0;
  let canceladas = 0;
  for (const p of pending) {
    const gift = await findGift(sql, p.giftId);
    if (gift === null || gift.claimTxid !== null) {
      await markPending(sql, p.id, 'cancelada');
      canceladas++;
      continue;
    }
    // Si los fondos ya no están (el que regala los recuperó, o se movieron por fuera), se cancela.
    const utxos = (await chain.addressUtxos(gift.address)).filter((u) => u.confirmed);
    const tx = inspectTransaction(p.hex);
    const still = new Set(utxos.map((u) => `${u.txid}:${u.vout}`));
    if (!tx.inputs.every((i) => still.has(`${i.txid}:${i.vout}`))) {
      await markPending(sql, p.id, 'cancelada');
      canceladas++;
      continue;
    }
    if (p.satVb < fees.minimum) continue;
    try {
      const txid = await chain.broadcast(p.hex);
      const script = tx.outputs[0]?.script ?? new Uint8Array(0);
      await recordClaim(sql, gift.id, { txid, kind: 'reclamo', destination: addressFromScript(script, network) ?? '' });
      await markPending(sql, p.id, 'difundida');
      difundidas++;
    } catch (error) {
      // Rechazos de la red (comisión todavía baja, etc.): se reintenta en la próxima vuelta.
      if (!(error instanceof ChainError)) throw error;
    }
  }
  return { difundidas, canceladas };
}

export function startBroadcaster(deps: BroadcasterDeps, everyMs = 5 * 60_000): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    processPending(deps)
      .catch((error: unknown) => console.error('difusiones programadas:', error))
      .finally(() => {
        running = false;
      });
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
