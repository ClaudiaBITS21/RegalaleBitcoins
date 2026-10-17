import type { Hono } from 'hono';
import { currentAccount } from './accountRoutes.ts';
import type { ChainClient, PriceClient } from './chain.ts';
import type { Sql } from './db.ts';
import { ApiError } from './errors.ts';
import { type GiftState, giftState } from './state.ts';

// Panel de administración: solo números agregados (cuentas, regalos, montos, ocasiones). No
// expone mails, nombres, mensajes ni direcciones. Entra solo una cuenta cuyo mail esté en
// ADMIN_EMAILS, con la misma sesión de passkey que el panel de regalos.

/** Regalos más recientes que se consultan en la cadena para el estado y los montos. */
const CHAIN_SAMPLE = 300;
const CHAIN_CONCURRENCY = 5;
const CACHE_MS = 2 * 60 * 1000;

export interface AdminDeps {
  readonly sql: Sql;
  readonly chain: ChainClient;
  readonly price: PriceClient;
  readonly network: string;
  /** Mails autorizados, en minúsculas. Vacío: nadie entra. */
  readonly adminEmails: readonly string[];
  readonly now?: () => number;
}

interface Row {
  readonly direccion: string;
  readonly reclamo_txid: string | null;
  readonly reclamo_tipo: string | null;
}

/** Corre `fn` sobre la lista con a lo sumo `n` en paralelo. */
async function mapLimit<T, R>(items: readonly T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

const counts = (rows: readonly { k: string | null; n: string | number }[]): Record<string, number> =>
  Object.fromEntries(rows.map((r) => [r.k ?? '—', Number(r.n)]));

export async function adminSummary(deps: AdminDeps): Promise<Record<string, unknown>> {
  const { sql, chain, price, network } = deps;
  const [users] = await sql<{ total: string; d7: string; d30: string; boveda: string; con_regalos: string }[]>`
    select count(*) as total,
      count(*) filter (where creado > now() - interval '7 days') as d7,
      count(*) filter (where creado > now() - interval '30 days') as d30,
      (select count(distinct usuario_id) from credenciales where boveda is not null) as boveda,
      (select count(distinct usuario_id) from regalos where usuario_id is not null and red = ${network}) as con_regalos
    from usuarios`;
  const [gifts] = await sql<{ total: string; d7: string; d30: string; esperados: string | null; con_cuenta: string }[]>`
    select count(*) as total,
      count(*) filter (where creado > now() - interval '7 days') as d7,
      count(*) filter (where creado > now() - interval '30 days') as d30,
      sum(sats_esperados) as esperados,
      count(*) filter (where usuario_id is not null) as con_cuenta
    from regalos where red = ${network}`;
  const [byOccasion, byLang, byCurrency, created, claimed] = await Promise.all([
    sql<{ k: string; n: string }[]>`select ocasion as k, count(*) as n from regalos where red = ${network} group by 1 order by 2 desc, 1 limit 12`,
    sql<{ k: string; n: string }[]>`select idioma as k, count(*) as n from regalos where red = ${network} group by 1 order by 2 desc`,
    sql<{ k: string | null; n: string }[]>`select moneda as k, count(*) as n from regalos where red = ${network} group by 1 order by 2 desc`,
    sql<{ dia: string; n: string }[]>`
      select to_char(date_trunc('day', creado), 'YYYY-MM-DD') as dia, count(*) as n from regalos
      where red = ${network} and creado > now() - interval '30 days' group by 1 order by 1`,
    sql<{ dia: string; n: string }[]>`
      select to_char(date_trunc('day', reclamado), 'YYYY-MM-DD') as dia, count(*) as n from regalos
      where red = ${network} and reclamado > now() - interval '30 days' group by 1 order by 1`,
  ]);

  // Estado y montos desde la cadena, para los regalos más recientes.
  const sample = await sql<Row[]>`
    select direccion, reclamo_txid, reclamo_tipo from regalos where red = ${network} order by creado desc limit ${CHAIN_SAMPLE}`;
  const states: Partial<Record<GiftState | 'sin_dato', number>> = {};
  let funded = 0n;
  let current = 0n;
  await mapLimit(sample, CHAIN_CONCURRENCY, async (g) => {
    try {
      const stats = await chain.addressStats(g.direccion);
      const s = giftState({ claimTxid: g.reclamo_txid, claimKind: g.reclamo_tipo } as Parameters<typeof giftState>[0], stats, false);
      states[s.state] = (states[s.state] ?? 0) + 1;
      funded += stats.confirmedFunded + stats.mempoolFunded;
      current += s.confirmedSats + s.unconfirmedSats;
    } catch {
      states.sin_dato = (states.sin_dato ?? 0) + 1;
    }
  });
  const usdPerBtc = await price.btcUsd().catch(() => null);

  return {
    red: network,
    generado: new Date((deps.now ?? Date.now)()).toISOString(),
    usuarios: {
      total: Number(users?.total ?? 0),
      ultimos7: Number(users?.d7 ?? 0),
      ultimos30: Number(users?.d30 ?? 0),
      conBoveda: Number(users?.boveda ?? 0),
      conRegalos: Number(users?.con_regalos ?? 0),
    },
    regalos: {
      total: Number(gifts?.total ?? 0),
      ultimos7: Number(gifts?.d7 ?? 0),
      ultimos30: Number(gifts?.d30 ?? 0),
      conCuenta: Number(gifts?.con_cuenta ?? 0),
      porEstado: states,
      muestra: sample.length,
      parcial: Number(gifts?.total ?? 0) > sample.length,
    },
    sats: {
      esperados: (gifts?.esperados ?? '0').toString(),
      recibidos: funded.toString(),
      enRegalos: current.toString(),
    },
    usdPorBtc: usdPerBtc,
    porOcasion: counts(byOccasion),
    porIdioma: counts(byLang),
    porMoneda: counts(byCurrency),
    porDia: { creados: counts(created.map((r) => ({ k: r.dia, n: r.n }))), reclamados: counts(claimed.map((r) => ({ k: r.dia, n: r.n }))) },
  };
}

export function registerAdminRoutes(app: Hono, deps: AdminDeps): void {
  let cached: { at: number; body: Record<string, unknown> } | null = null;
  const now = deps.now ?? Date.now;
  app.get('/api/admin/resumen', async (c) => {
    const account = await currentAccount(deps.sql, c);
    if (account === null) throw new ApiError(401, 'sesion_requerida');
    // Para quien no es admin, la ruta no existe.
    if (!deps.adminEmails.includes(account.email.toLowerCase())) throw new ApiError(404, 'no_encontrado');
    if (cached === null || now() - cached.at > CACHE_MS || c.req.query('fresco') === '1') {
      cached = { at: now(), body: await adminSummary(deps) };
    }
    c.header('cache-control', 'no-store');
    return c.json(cached.body);
  });
}
