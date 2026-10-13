// Cliente de la API Esplora (mempool.space y compatibles). Todo lo que llega de
// afuera se valida antes de usarse: un servidor de cadena caído o malicioso no puede
// meter datos con forma inesperada.

export interface Utxo {
  readonly txid: string;
  readonly vout: number;
  readonly value: bigint;
  readonly confirmed: boolean;
}

export interface AddressStats {
  /** Recibido y gastado en bloques confirmados. */
  readonly confirmedFunded: bigint;
  readonly confirmedSpent: bigint;
  /** Recibido y gastado en la mempool. */
  readonly mempoolFunded: bigint;
  readonly mempoolSpent: bigint;
  readonly txCount: number;
}

/** Un pago a la dirección que todavía está en la mempool. */
export interface MempoolPayment {
  readonly txid: string;
  /** sat/vB de la transacción. */
  readonly feeRate: number;
  /** Lo que esa transacción manda a la dirección. */
  readonly value: bigint;
}

/** sat/vB. */
export interface FeeRates {
  readonly fastest: number;
  readonly halfHour: number;
  readonly hour: number;
  readonly economy: number;
  readonly minimum: number;
}

export interface ChainClient {
  addressStats(address: string): Promise<AddressStats>;
  addressUtxos(address: string): Promise<Utxo[]>;
  /** Pagos sin confirmar a la dirección (para avisar si uno quedó trabado por comisión baja). */
  mempoolPayments(address: string): Promise<MempoolPayment[]>;
  txHex(txid: string): Promise<string>;
  /** Difunde y devuelve el txid. */
  broadcast(hex: string): Promise<string>;
  fees(): Promise<FeeRates>;
}

export class ChainError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ChainError';
    this.status = status;
  }
}

const TXID = /^[0-9a-f]{64}$/;
const HEX = /^(?:[0-9a-f]{2})+$/;

function sats(value: unknown): bigint {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new ChainError('Monto inválido del servidor de cadena.');
  return BigInt(value);
}

function rate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 10_000) {
    throw new ChainError('Tasa de comisión inválida del servidor de cadena.');
  }
  return value;
}

export function esploraClient(baseUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10_000): ChainClient {
  async function request(path: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new ChainError(`No se pudo contactar al servidor de cadena: ${(error as Error).message}`);
    }
    if (!res.ok) throw new ChainError(`Servidor de cadena respondió ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
    return res;
  }
  const json = async (path: string): Promise<unknown> => (await request(path)).json();
  const text = async (path: string, init?: RequestInit): Promise<string> => (await (await request(path, init)).text()).trim();

  return {
    async addressStats(address) {
      const d = (await json(`/address/${encodeURIComponent(address)}`)) as {
        chain_stats?: Record<string, unknown>;
        mempool_stats?: Record<string, unknown>;
      };
      const c = d.chain_stats ?? {};
      const m = d.mempool_stats ?? {};
      return {
        confirmedFunded: sats(c.funded_txo_sum),
        confirmedSpent: sats(c.spent_txo_sum),
        mempoolFunded: sats(m.funded_txo_sum),
        mempoolSpent: sats(m.spent_txo_sum),
        txCount: Number(sats(c.tx_count)) + Number(sats(m.tx_count)),
      };
    },
    async addressUtxos(address) {
      const list = await json(`/address/${encodeURIComponent(address)}/utxo`);
      if (!Array.isArray(list)) throw new ChainError('Lista de UTXO inválida.');
      return list.map((u: { txid?: unknown; vout?: unknown; value?: unknown; status?: { confirmed?: unknown } }) => {
        if (typeof u.txid !== 'string' || !TXID.test(u.txid) || typeof u.vout !== 'number' || !Number.isInteger(u.vout) || u.vout < 0) {
          throw new ChainError('UTXO inválido.');
        }
        return { txid: u.txid, vout: u.vout, value: sats(u.value), confirmed: u.status?.confirmed === true };
      });
    },
    async mempoolPayments(address) {
      const list = await json(`/address/${encodeURIComponent(address)}/txs/mempool`);
      if (!Array.isArray(list)) throw new ChainError('Lista de transacciones inválida.');
      return list.map((t: { txid?: unknown; fee?: unknown; weight?: unknown; vout?: unknown }) => {
        if (typeof t.txid !== 'string' || !TXID.test(t.txid) || !Array.isArray(t.vout)) throw new ChainError('Transacción inválida.');
        const weight = Number(sats(t.weight));
        if (weight === 0) throw new ChainError('Transacción inválida.');
        const value = (t.vout as Array<{ scriptpubkey_address?: unknown; value?: unknown }>)
          .filter((o) => o.scriptpubkey_address === address)
          .reduce((a, o) => a + sats(o.value), 0n);
        return { txid: t.txid, feeRate: Number(sats(t.fee)) / (weight / 4), value };
      });
    },
    async txHex(txid) {
      if (!TXID.test(txid)) throw new ChainError('txid inválido.');
      const hex = (await text(`/tx/${txid}/hex`)).toLowerCase();
      if (!HEX.test(hex)) throw new ChainError('Transacción inválida del servidor de cadena.');
      return hex;
    },
    async broadcast(hex) {
      const txid = await text('/tx', { method: 'POST', body: hex, headers: { 'content-type': 'text/plain' } });
      if (!TXID.test(txid)) throw new ChainError(`Respuesta inesperada al difundir: ${txid.slice(0, 200)}`);
      return txid;
    },
    async fees() {
      const f = (await json('/v1/fees/recommended')) as Record<string, unknown>;
      return {
        fastest: rate(f.fastestFee),
        halfHour: rate(f.halfHourFee),
        hour: rate(f.hourFee),
        economy: rate(f.economyFee),
        minimum: rate(f.minimumFee),
      };
    },
  };
}

export interface PriceClient {
  /** Precio de 1 BTC en USD. */
  btcUsd(): Promise<number>;
}

export function priceClient(url: string, fetchImpl: typeof fetch = fetch, cacheMs = 60_000): PriceClient {
  let cached: { at: number; usd: number } | null = null;
  return {
    async btcUsd() {
      if (cached !== null && Date.now() - cached.at < cacheMs) return cached.usd;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new ChainError(`Precio no disponible (${res.status}).`, res.status);
      const usd = ((await res.json()) as { USD?: unknown }).USD;
      if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) throw new ChainError('Precio inválido.');
      cached = { at: Date.now(), usd };
      return usd;
    },
  };
}
