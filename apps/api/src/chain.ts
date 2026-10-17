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

/**
 * Dialecto de la API Esplora: mempool.space tiene /v1/fees/recommended; Blockstream solo
 * /fee-estimates (objetivo en bloques → sat/vB). El resto de las rutas es igual.
 */
export type EsploraFlavor = 'mempool' | 'blockstream';

/** Comisiones a partir de /fee-estimates de Blockstream: 1, 3, 6, 144 y 1008 bloques. */
export function feesFromEstimates(estimates: Record<string, unknown>): FeeRates {
  const at = (target: number): number => {
    const keys = Object.keys(estimates).map(Number).filter((k) => Number.isInteger(k) && k > 0).sort((a, b) => a - b);
    // El objetivo pedido o el más cercano por debajo (más rápido, nunca menos de lo pedido).
    const key = keys.filter((k) => k <= target).pop() ?? keys[0];
    if (key === undefined) throw new ChainError('Estimaciones de comisión vacías.');
    return Math.max(1, rate(estimates[String(key)]));
  };
  return { fastest: at(1), halfHour: at(3), hour: at(6), economy: at(144), minimum: at(1008) };
}

export function esploraClient(baseUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10_000, flavor: EsploraFlavor = 'mempool'): ChainClient {
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
      if (flavor === 'blockstream') return feesFromEstimates((await json('/fee-estimates')) as Record<string, unknown>);
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

/** Falla del proveedor (red, límite o error propio), no del pedido: vale probar con otro. */
function providerFailure(error: unknown): boolean {
  return error instanceof ChainError && (error.status === undefined || error.status === 429 || error.status >= 500);
}

/**
 * Dos fuentes de cadena: usa la principal y, si falla o nos limita, la de respaldo. Un rechazo
 * del pedido (4xx, por ejemplo una transacción inválida) no se reintenta en la otra.
 */
export function fallbackChain(primary: ChainClient, secondary: ChainClient, onFallback: (method: string, error: unknown) => void = () => {}): ChainClient {
  const wrap =
    <A extends unknown[], R>(method: string, call: (c: ChainClient, ...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await call(primary, ...args);
      } catch (error) {
        if (!providerFailure(error)) throw error;
        onFallback(method, error);
        return call(secondary, ...args);
      }
    };
  return {
    addressStats: wrap('addressStats', (c, a: string) => c.addressStats(a)),
    addressUtxos: wrap('addressUtxos', (c, a: string) => c.addressUtxos(a)),
    mempoolPayments: wrap('mempoolPayments', (c, a: string) => c.mempoolPayments(a)),
    txHex: wrap('txHex', (c, t: string) => c.txHex(t)),
    broadcast: wrap('broadcast', (c, h: string) => c.broadcast(h)),
    fees: wrap('fees', (c) => c.fees()),
  };
}

/** Guarda las comisiones unos segundos: cambian por bloque, no por pedido. */
export function cachedFees(chain: ChainClient, cacheMs = 30_000, now: () => number = Date.now): ChainClient {
  let cached: { at: number; fees: FeeRates } | null = null;
  return {
    addressStats: (a) => chain.addressStats(a),
    addressUtxos: (a) => chain.addressUtxos(a),
    mempoolPayments: (a) => chain.mempoolPayments(a),
    txHex: (t) => chain.txHex(t),
    broadcast: (h) => chain.broadcast(h),
    async fees() {
      if (cached !== null && now() - cached.at < cacheMs) return cached.fees;
      const fees = await chain.fees();
      cached = { at: now(), fees };
      return fees;
    },
  };
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

export type ArsSource = 'criptoya' | 'bitso';

export interface ArsQuote {
  /** Precio de 1 BTC en pesos argentinos, directo de exchanges locales (sin pasar por un dólar). */
  readonly price: number;
  readonly source: ArsSource;
}

export interface ArsPriceClient {
  btcArs(): Promise<ArsQuote>;
}

function positive(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Cuánto se separan dos precios, relativo al menor. */
const gap = (a: number, b: number): number => Math.abs(a - b) / Math.min(a, b);

/**
 * BTC/ARS: mediana del precio final de compra ("totalAsk", con comisiones) de los
 * exchanges locales que reúne CriptoYa, con al menos 3 cotizaciones de los últimos 15
 * minutos. Bitso (su par btc_ars) sirve de control y de respaldo: si las dos fuentes
 * difieren en más de 10 %, no se cotiza.
 */
export function arsPriceClient(
  urls: { criptoya: string; bitso: string },
  fetchImpl: typeof fetch = fetch,
  cacheMs = 60_000,
  now: () => number = Date.now,
): ArsPriceClient {
  let cached: { at: number; quote: ArsQuote } | null = null;
  const getJson = async (url: string): Promise<unknown> => {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new ChainError(`Cotización en pesos no disponible (${res.status}).`, res.status);
    return res.json();
  };
  const fromCriptoya = async (): Promise<number | null> => {
    const data = (await getJson(urls.criptoya).catch(() => null)) as Record<string, { totalAsk?: unknown; time?: unknown }> | null;
    if (data === null || typeof data !== 'object') return null;
    const fresh = Object.values(data)
      .filter((q) => typeof q === 'object' && q !== null && typeof q.time === 'number' && now() / 1000 - q.time < 15 * 60)
      .map((q) => positive(q.totalAsk))
      .filter((v): v is number => v !== null);
    return fresh.length >= 3 ? median(fresh) : null;
  };
  const fromBitso = async (): Promise<number | null> => {
    const data = (await getJson(urls.bitso).catch(() => null)) as { success?: unknown; payload?: { ask?: unknown; book?: unknown } } | null;
    if (data?.success !== true || data.payload?.book !== 'btc_ars') return null;
    return positive(data.payload.ask);
  };
  return {
    async btcArs() {
      if (cached !== null && now() - cached.at < cacheMs) return cached.quote;
      const [a, b] = await Promise.all([fromCriptoya(), fromBitso()]);
      if (a === null && b === null) throw new ChainError('Cotización en pesos no disponible.');
      if (a !== null && b !== null && gap(a, b) > 0.1) throw new ChainError('Las cotizaciones en pesos no coinciden.');
      const quote: ArsQuote = a !== null ? { price: a, source: 'criptoya' } : { price: b as number, source: 'bitso' };
      cached = { at: now(), quote };
      return quote;
    },
  };
}
