import type { Hono } from 'hono';
import { signupStats } from './altas.ts';
import { currentAccount } from './accountRoutes.ts';
import { isAdmin } from './admins.ts';
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
  readonly ocasion: string;
  readonly reclamo_txid: string | null;
  readonly reclamo_tipo: string | null;
}

/** Textos libres (ocasión "otra"): solo los que usaron al menos tantas personas distintas. */
const FREE_TEXT_MIN = 3;
/** Zona horaria de quien opera, para "cuándo se regala". */
const OPERATOR_TZ = 'America/Argentina/Buenos_Aires';

const PAID_STATES: readonly GiftState[] = ['en_la_red', 'activo', 'reclamo_programado', 'reclamado', 'recuperado', 'retirado'];
const OPENED_STATES: readonly GiftState[] = ['reclamado', 'reclamo_programado'];

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
    select direccion, ocasion, reclamo_txid, reclamo_tipo from regalos where red = ${network} order by creado desc limit ${CHAIN_SAMPLE}`;
  const states: Partial<Record<GiftState | 'sin_dato', number>> = {};
  const perOccasion = new Map<string, { muestra: number; pagados: number; abiertos: number; recibidos: bigint }>();
  let funded = 0n;
  let current = 0n;
  await mapLimit(sample, CHAIN_CONCURRENCY, async (g) => {
    const occ = perOccasion.get(g.ocasion) ?? { muestra: 0, pagados: 0, abiertos: 0, recibidos: 0n };
    perOccasion.set(g.ocasion, occ);
    occ.muestra++;
    try {
      const stats = await chain.addressStats(g.direccion);
      const s = giftState({ claimTxid: g.reclamo_txid, claimKind: g.reclamo_tipo } as Parameters<typeof giftState>[0], stats, false);
      states[s.state] = (states[s.state] ?? 0) + 1;
      const got = stats.confirmedFunded + stats.mempoolFunded;
      funded += got;
      current += s.confirmedSats + s.unconfirmedSats;
      if (PAID_STATES.includes(s.state)) occ.pagados++;
      if (OPENED_STATES.includes(s.state)) occ.abiertos++;
      occ.recibidos += got;
    } catch {
      states.sin_dato = (states.sin_dato ?? 0) + 1;
    }
  });

  const [byOccasionAll, freeTexts, amounts, styles, weekday, hour, toOpen, perAccount, card, claims] = await Promise.all([
    sql<{ k: string; n: string; usd: string | null }[]>`
      select ocasion as k, count(*) as n, avg(sats_esperados::numeric / 1e8 * usd_por_btc) as usd
      from regalos where red = ${network} group by 1 order by 2 desc, 1`,
    sql<{ k: string; n: string }[]>`
      select lower(ocasion_libre) as k, count(distinct coalesce(usuario_id::text, id)) as n from regalos
      where red = ${network} and ocasion = 'otra' and ocasion_libre is not null
      group by 1 having count(distinct coalesce(usuario_id::text, id)) >= ${FREE_TEXT_MIN} order by 2 desc limit 20`,
    sql<{ k: string; n: string; promedio: string | null; mediana: string | null }[]>`
      with m as (select sats_esperados::numeric / 1e8 * usd_por_btc as usd from regalos where red = ${network} and sats_esperados is not null and usd_por_btc is not null)
      select b.k, count(m.usd) as n, (select avg(usd) from m) as promedio, (select percentile_cont(0.5) within group (order by usd) from m) as mediana
      from (values ('a', 0, 5), ('b', 5, 10), ('c', 10, 15), ('d', 15, 20.0001), ('e', 20.0001, 1e9)) as b(k, lo, hi)
      left join m on m.usd >= b.lo and m.usd < b.hi group by b.k order by b.k`,
    sql<{ k: string; n: string }[]>`select estilo as k, count(*) as n from regalos where red = ${network} group by 1 order by 2 desc`,
    sql<{ k: string; n: string }[]>`
      select extract(isodow from creado at time zone ${OPERATOR_TZ})::int::text as k, count(*) as n
      from regalos where red = ${network} group by 1 order by 1`,
    sql<{ k: string; n: string }[]>`
      select extract(hour from creado at time zone ${OPERATOR_TZ})::int::text as k, count(*) as n
      from regalos where red = ${network} group by 1 order by 1`,
    sql<{ k: string; n: string; mediana_h: string | null }[]>`
      with t as (select extract(epoch from reclamado - creado) / 3600 as h from regalos where red = ${network} and reclamado is not null and reclamo_tipo = 'reclamo')
      select b.k, count(t.h) as n, (select percentile_cont(0.5) within group (order by h) from t) as mediana_h
      from (values ('a', 0, 1), ('b', 1, 24), ('c', 24, 168), ('d', 168, 1e9)) as b(k, lo, hi)
      left join t on t.h >= b.lo and t.h < b.hi group by b.k order by b.k`,
    sql<{ k: string; n: string }[]>`
      select case when c = 1 then '1' when c <= 3 then '2-3' else '4+' end as k, count(*) as n
      from (select count(*) as c from regalos where red = ${network} and usuario_id is not null group by usuario_id) x group by 1 order by 1`,
    sql<{ total: string; con_mensaje: string; con_de: string; largo: string | null }[]>`
      select count(*) as total, count(*) filter (where mensaje <> '') as con_mensaje, count(*) filter (where de is not null) as con_de,
        avg(char_length(mensaje)) filter (where mensaje <> '') as largo
      from regalos where red = ${network}`,
    sql<{ reclamos: string; recuperos: string; programados: string }[]>`
      select count(*) filter (where reclamo_tipo = 'reclamo') as reclamos, count(*) filter (where reclamo_tipo = 'recupero') as recuperos,
        (select count(*) from difusiones d join regalos r on r.id = d.regalo_id where r.red = ${network} and d.estado = 'esperando') as programados
      from regalos where red = ${network}`,
  ]);
  const usdPerBtc = await price.btcUsd().catch(() => null);
  // Altas de las últimas 12 semanas por país y por origen: solo contadores (altas.ts).
  const signups = await signupStats(sql, 12);
  const sumBy = (k: 'pais' | 'origen') => signups.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r[k]]: (acc[r[k]] ?? 0) + r.cuentas }), {});

  return {
    red: network,
    altas: { porPais: sumBy('pais'), porOrigen: sumBy('origen') },
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
    motivos: byOccasionAll.map((r) => {
      const o = perOccasion.get(r.k);
      return {
        ocasion: r.k,
        creados: Number(r.n),
        usdPromedio: r.usd === null ? null : Math.round(Number(r.usd) * 100) / 100,
        muestra: o?.muestra ?? 0,
        pagados: o?.pagados ?? 0,
        abiertos: o?.abiertos ?? 0,
        satsRecibidos: (o?.recibidos ?? 0n).toString(),
      };
    }),
    ocasionesLibres: counts(freeTexts),
    montosUsd: {
      rangos: Object.fromEntries(amounts.map((r) => [({ a: '< 5', b: '5–10', c: '10–15', d: '15–20', e: '> 20' } as Record<string, string>)[r.k] ?? r.k, Number(r.n)])),
      promedio: amounts[0]?.promedio == null ? null : Math.round(Number(amounts[0].promedio) * 100) / 100,
      mediana: amounts[0]?.mediana == null ? null : Math.round(Number(amounts[0].mediana) * 100) / 100,
    },
    porEstilo: counts(styles),
    porDiaSemana: counts(weekday),
    porHora: counts(hour),
    tiempoHastaAbrir: {
      rangos: Object.fromEntries(toOpen.map((r) => [({ a: '< 1 h', b: '1–24 h', c: '1–7 días', d: '> 7 días' } as Record<string, string>)[r.k] ?? r.k, Number(r.n)])),
      medianaHoras: toOpen[0]?.mediana_h == null ? null : Math.round(Number(toOpen[0].mediana_h) * 10) / 10,
    },
    regalosPorCuenta: counts(perAccount),
    tarjeta: {
      conMensaje: Number(card[0]?.con_mensaje ?? 0),
      conRemitente: Number(card[0]?.con_de ?? 0),
      largoMensaje: card[0]?.largo == null ? null : Math.round(Number(card[0].largo)),
    },
    reclamos: {
      reclamados: Number(claims[0]?.reclamos ?? 0),
      recuperados: Number(claims[0]?.recuperos ?? 0),
      programadosEsperando: Number(claims[0]?.programados ?? 0),
    },
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
    if (!(await isAdmin(deps.sql, deps.adminEmails, account.email))) throw new ApiError(404, 'no_encontrado');
    if (cached === null || now() - cached.at > CACHE_MS || c.req.query('fresco') === '1') {
      cached = { at: now(), body: await adminSummary(deps) };
    }
    c.header('cache-control', 'no-store');
    return c.json(cached.body);
  });
}
