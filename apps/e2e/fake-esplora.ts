// Servidor de cadena SIMULADO, compatible con la parte de la API Esplora que usa la
// plataforma. Solo para pruebas locales sin red: no reemplaza la prueba en signet.
// Al difundir, verifica de forma independiente las firmas antes de aceptar.

import { createServer, type Server } from 'node:http';
import { getNetwork, inspectTransaction, parseDestination } from '@regalale/core';
import { makeFundingTx, verifyP2WPKHInputs } from '../../packages/core/test/helpers.ts';

export interface FakeChain {
  readonly url: string;
  readonly broadcasts: string[];
  /** Transacciones rechazadas por firma inválida. */
  readonly rejected: string[];
  /** Simula un pago a la dirección; con confirmed = false queda en la mempool. */
  pay(address: string, amount: bigint, confirmed?: boolean): void;
  /** Mina un bloque: confirma todo lo que está en la mempool. */
  confirmAll(): void;
  close(): Promise<void>;
}

interface Output {
  txid: string;
  vout: number;
  script: Uint8Array;
  value: bigint;
  spent: boolean;
  confirmed: boolean;
}

export async function startFakeEsplora(port: number, fund: ReadonlyArray<{ address: string; amount: bigint }>): Promise<FakeChain> {
  const signet = getNetwork('signet');
  const raw = new Map<string, string>();
  const outputs: Output[] = [];
  let salt = 100;
  const pay = (address: string, amount: bigint, confirmed = true) => {
    const script = parseDestination(address, signet).script;
    const f = makeFundingTx([{ script, amount }], salt++);
    raw.set(f.txid, f.rawTx);
    outputs.push({ txid: f.txid, vout: 0, script, value: amount, spent: false, confirmed });
  };
  for (const { address, amount } of fund) pay(address, amount);
  const scriptOf = (address: string) => Buffer.from(parseDestination(address, signet).script).toString('hex');
  const broadcasts: string[] = [];
  const rejected: string[] = [];

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const send = (status: number, body: unknown, type = 'application/json') => {
      res.writeHead(status, { 'content-type': type });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    let m: RegExpExecArray | null;
    if (req.method === 'GET' && (m = /^\/address\/([^/]+)$/.exec(url.pathname))) {
      const script = scriptOf(decodeURIComponent(m[1] as string));
      const mine = outputs.filter((o) => Buffer.from(o.script).toString('hex') === script);
      const sum = (list: Output[]) => Number(list.reduce((a, o) => a + o.value, 0n));
      const chain = mine.filter((o) => o.confirmed);
      const mempool = mine.filter((o) => !o.confirmed);
      return send(200, {
        chain_stats: { funded_txo_sum: sum(chain), spent_txo_sum: sum(chain.filter((o) => o.spent)), tx_count: chain.length },
        mempool_stats: { funded_txo_sum: sum(mempool), spent_txo_sum: sum(mempool.filter((o) => o.spent)), tx_count: mempool.length },
      });
    }
    if (req.method === 'GET' && (m = /^\/address\/([^/]+)\/txs\/mempool$/.exec(url.pathname))) {
      const address = decodeURIComponent(m[1] as string);
      const script = scriptOf(address);
      // Pagos sin confirmar con 2 sat/vB (la comisión "económica" simulada también es 2).
      return send(
        200,
        outputs
          .filter((o) => !o.confirmed && Buffer.from(o.script).toString('hex') === script)
          .map((o) => ({ txid: o.txid, fee: 2 * 141, weight: 4 * 141, vout: [{ scriptpubkey_address: address, value: Number(o.value) }] })),
      );
    }
    if (req.method === 'GET' && (m = /^\/address\/([^/]+)\/utxo$/.exec(url.pathname))) {
      const script = scriptOf(decodeURIComponent(m[1] as string));
      return send(
        200,
        outputs
          .filter((o) => !o.spent && Buffer.from(o.script).toString('hex') === script)
          .map((o) => ({ txid: o.txid, vout: o.vout, value: Number(o.value), status: o.confirmed ? { confirmed: true, block_height: 200_000 } : { confirmed: false } })),
      );
    }
    if (req.method === 'GET' && (m = /^\/tx\/([0-9a-f]{64})\/hex$/.exec(url.pathname))) {
      const hex = raw.get(m[1] as string);
      return hex === undefined ? send(404, 'Transaction not found', 'text/plain') : send(200, hex, 'text/plain');
    }
    if (req.method === 'GET' && url.pathname === '/v1/fees/recommended') {
      return send(200, { fastestFee: 6, halfHourFee: 4, hourFee: 3, economyFee: 2, minimumFee: 1 });
    }
    if (req.method === 'GET' && url.pathname === '/v1/prices') {
      return send(200, { time: Math.floor(Date.now() / 1000), USD: 100_000 });
    }
    // Cotizaciones BTC/ARS simuladas: CriptoYa (3 exchanges) y Bitso, a $ 160.000.000.
    if (req.method === 'GET' && url.pathname === '/ars/criptoya') {
      const time = Math.floor(Date.now() / 1000);
      return send(200, { a: { totalAsk: 159_000_000, time }, b: { totalAsk: 160_000_000, time }, c: { totalAsk: 161_000_000, time } });
    }
    if (req.method === 'GET' && url.pathname === '/ars/bitso') {
      return send(200, { success: true, payload: { book: 'btc_ars', ask: '160500000' } });
    }
    if (req.method === 'POST' && url.pathname === '/tx') {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        try {
          const tx = inspectTransaction(body.trim());
          const prevouts = tx.inputs.map((i) => outputs.find((o) => o.txid === i.txid && o.vout === i.vout && !o.spent));
          if (prevouts.some((p) => p === undefined)) return send(400, 'bad-txns-inputs-missingorspent', 'text/plain');
          const ok = verifyP2WPKHInputs(
            Buffer.from(body.trim(), 'hex'),
            prevouts.map((p) => ({ script: (p as Output).script, amount: (p as Output).value })),
          );
          if (!ok) {
            rejected.push(body.trim());
            return send(400, 'mandatory-script-verify-flag-failed', 'text/plain');
          }
          for (const p of prevouts) (p as Output).spent = true;
          broadcasts.push(body.trim());
          return send(200, tx.txid, 'text/plain');
        } catch {
          return send(400, 'TX decode failed', 'text/plain');
        }
      });
      return;
    }
    send(404, 'not found', 'text/plain');
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${port}`,
    broadcasts,
    rejected,
    pay,
    confirmAll: () => {
      for (const o of outputs) o.confirmed = true;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
