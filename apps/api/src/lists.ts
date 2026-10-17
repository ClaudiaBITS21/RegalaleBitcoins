import { createHash } from 'node:crypto';
import { deriveListAddress, isCoreError, isLang, type Lang, type Network, parseAccountKey } from '@regalale/core';
import type { Context, Hono } from 'hono';
import { currentAccount } from './accountRoutes.ts';
import type { ArsPriceClient, ChainClient, PriceClient } from './chain.ts';
import type { Sql } from './db.ts';
import { ApiError } from './errors.ts';
import { GIFT_ID, newGiftId } from './gifts.ts';
import { RateLimiter } from './ratelimit.ts';
import { checkAmount, clientIp, text } from './validate.ts';

// Listas de regalos (solo BTC). Quien arma la lista guarda su zpub/vpub; cada invitado que
// confirma un aporte recibe la próxima dirección libre de esa llave. Las direcciones de
// aportes abandonados (nunca recibieron nada) se reciclan para no abrir huecos grandes en la
// billetera, que deja de mirar después de ~20 direcciones sin usar.

export const LIST_LIMITS = { title: 60, message: 280, name: 40, freeOccasion: 40 } as const;
/** Un aporte sin pagar libera su dirección después de esto (si nunca recibió nada). */
export const RESERVATION_MS = 72 * 60 * 60 * 1000;
/** Mínimo por aporte: va directo a la billetera de quien recibe, no hace falta barrerlo. */
export const MIN_CONTRIBUTION_SATS = 1_000n;
const RECYCLE_CANDIDATES = 5;
const CHAIN_CONCURRENCY = 5;

export interface ListDeps {
  readonly sql: Sql;
  readonly chain: ChainClient;
  readonly price: PriceClient;
  readonly arsPrice?: ArsPriceClient | undefined;
  readonly network: Network;
  readonly ceilingUsd: number;
  readonly occasions: readonly string[];
  readonly contributionsPerHour?: number;
  readonly now?: () => number;
}

interface ListRow {
  id: string;
  red: string;
  usuario_id: string;
  xpub: string;
  titulo: string;
  ocasion: string;
  ocasion_libre: string | null;
  mensaje: string;
  fecha: Date | null;
  idioma: Lang;
  creada: Date;
  cerrada: Date | null;
}

interface ContributionRow {
  id: string;
  lista_id: string;
  indice: number;
  direccion: string;
  nombre: string | null;
  mensaje: string;
  moneda: string;
  monto: string;
  sats_declarados: string;
  creado: Date;
  pagado: Date | null;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest();
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

async function findList(sql: Sql, id: string): Promise<ListRow | null> {
  if (!GIFT_ID.test(id)) return null;
  const [r] = await sql<ListRow[]>`select * from listas where id = ${id}`;
  return r ?? null;
}

/** Estado de un aporte visto desde la cadena. */
async function contributionState(chain: ChainClient, address: string) {
  const s = await chain.addressStats(address);
  const confirmed = s.confirmedFunded;
  const total = s.confirmedFunded + s.mempoolFunded;
  return {
    estado: confirmed > 0n ? 'recibido' : total > 0n ? 'en_la_red' : 'esperando',
    recibidos: total,
    confirmados: confirmed,
  } as const;
}

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

const publicList = (l: ListRow, ceilingUsd: number) => ({
  id: l.id,
  red: l.red,
  titulo: l.titulo,
  ocasion: l.ocasion,
  ocasionLibre: l.ocasion_libre,
  mensaje: l.mensaje,
  fecha: l.fecha === null ? null : l.fecha.toISOString().slice(0, 10),
  idioma: l.idioma,
  abierta: l.cerrada === null,
  topeUsd: ceilingUsd,
});

export function registerListRoutes(app: Hono, deps: ListDeps): void {
  const { sql, chain, price, network } = deps;
  const now = deps.now ?? Date.now;
  const limiter = new RateLimiter(deps.contributionsPerHour ?? 30, 60 * 60 * 1000);

  const owner = async (c: Context) => {
    const account = await currentAccount(sql, c);
    if (account === null) throw new ApiError(401, 'sesion_requerida');
    return account;
  };

  /** Crear una lista: la persona confirma que su billetera muestra la misma primera dirección. */
  app.post('/api/listas', async (c) => {
    const account = await owner(c);
    const b = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    let xpub: string;
    let first: string;
    try {
      const key = parseAccountKey(String(b.xpub ?? ''), network);
      xpub = key.text;
      first = deriveListAddress(key, 0).address;
    } catch (error) {
      if (isCoreError(error, 'INVALID_XPUB')) {
        const problem = (error.details as { problem?: string } | undefined)?.problem ?? 'formato';
        throw new ApiError(400, 'pedido_invalido', `xpub_${problem}`);
      }
      throw error;
    }
    if (b.primeraDireccion !== first) throw new ApiError(400, 'pedido_invalido', 'primera_direccion');
    if (typeof b.idioma !== 'string' || !isLang(b.idioma)) throw new ApiError(400, 'pedido_invalido');
    if (typeof b.ocasion !== 'string' || !deps.occasions.includes(b.ocasion)) throw new ApiError(400, 'pedido_invalido');
    const fecha = typeof b.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? b.fecha : null;
    const id = newGiftId();
    await sql`
      insert into listas (id, red, usuario_id, xpub, titulo, ocasion, ocasion_libre, mensaje, fecha, idioma)
      values (${id}, ${network.name}, ${account.id}, ${xpub}, ${text(b.titulo, LIST_LIMITS.title, true)}, ${b.ocasion},
              ${b.ocasion === 'otra' ? text(b.ocasionLibre, LIST_LIMITS.freeOccasion, false) : null},
              ${text(b.mensaje, LIST_LIMITS.message, false) ?? ''}, ${fecha}, ${b.idioma})`;
    return c.json({ id }, 201);
  });

  /** La lista para los invitados: nunca muestra aportes ni totales. */
  app.get('/api/listas/:id', async (c) => {
    const list = await findList(sql, c.req.param('id'));
    if (list === null || list.red !== network.name) throw new ApiError(404, 'no_encontrado');
    return c.json(publicList(list, deps.ceilingUsd));
  });

  /** Un invitado confirma su aporte: recibe la dirección para pagar y su link privado. */
  app.post('/api/listas/:id/aportes', async (c) => {
    const ip = clientIp(c.req.header('x-forwarded-for'));
    if (!limiter.allowed(ip)) throw new ApiError(429, 'demasiados_pedidos');
    const list = await findList(sql, c.req.param('id'));
    if (list === null || list.red !== network.name) throw new ApiError(404, 'no_encontrado');
    if (list.cerrada !== null) throw new ApiError(409, 'regalo_no_disponible', 'lista_cerrada');
    const b = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (typeof b.sats !== 'string' || !/^[1-9]\d{0,15}$/.test(b.sats)) throw new ApiError(400, 'monto_invalido');
    if (b.moneda !== 'USD' && b.moneda !== 'ARS' && b.moneda !== 'SAT') throw new ApiError(400, 'monto_invalido');
    if (typeof b.monto !== 'number' || !Number.isFinite(b.monto) || b.monto <= 0) throw new ApiError(400, 'monto_invalido');
    const amount = { satsExpected: BigInt(b.sats), currency: b.moneda, amount: b.monto } as const;
    const [usdPerBtc, arsPerBtc] = await Promise.all([
      price.btcUsd(),
      amount.currency === 'ARS' ? (deps.arsPrice?.btcArs().then((q) => q.price) ?? Promise.reject(new ApiError(422, 'monto_invalido'))) : null,
    ]);
    checkAmount(amount, usdPerBtc, arsPerBtc, MIN_CONTRIBUTION_SATS, deps.ceilingUsd);
    const name = text(b.nombre, LIST_LIMITS.name, false);
    const message = text(b.mensaje, LIST_LIMITS.message, false) ?? '';
    const key = parseAccountKey(list.xpub, network);
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

    // Reciclar un aporte vencido cuya dirección nunca recibió nada; si no, el índice siguiente.
    const expired = await sql<{ id: string; indice: number; direccion: string }[]>`
      select id, indice, direccion from aportes
      where lista_id = ${list.id} and pagado is null and not externa and creado < ${new Date(now() - RESERVATION_MS)}
      order by indice limit ${RECYCLE_CANDIDATES}`;
    let reuse: { id: string; indice: number } | null = null;
    for (const e of expired) {
      const stats = await chain.addressStats(e.direccion);
      if (stats.txCount === 0) {
        reuse = e;
        break;
      }
      await sql`update aportes set pagado = now() where id = ${e.id} and pagado is null`;
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const index =
        reuse?.indice ??
        Number((await sql<{ n: number }[]>`select coalesce(max(indice) + 1, 0) as n from aportes where lista_id = ${list.id}`)[0]?.n ?? 0);
      const address = deriveListAddress(key, index).address;
      // Una dirección con movimientos ya se usó fuera de la lista: se saltea.
      if (reuse === null && (await chain.addressStats(address)).txCount > 0) {
        await sql`
          insert into aportes (lista_id, indice, direccion, moneda, monto, sats_declarados, token_hash, pagado, externa)
          values (${list.id}, ${index}, ${address}, 'SAT', 0, 1, ${crypto.getRandomValues(new Uint8Array(32))}, now(), true)
          on conflict do nothing`;
        continue;
      }
      try {
        await sql.begin(async (tx) => {
          if (reuse !== null) await tx`delete from aportes where id = ${reuse.id} and pagado is null`;
          await tx`
            insert into aportes (lista_id, indice, direccion, nombre, mensaje, moneda, monto, sats_declarados, usd_por_btc, token_hash)
            values (${list.id}, ${index}, ${address}, ${name}, ${message}, ${amount.currency}, ${amount.amount},
                    ${amount.satsExpected.toString()}, ${usdPerBtc}, ${hashToken(token)})`;
        });
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          reuse = null;
          continue;
        }
        throw error;
      }
      limiter.record(ip);
      return c.json({ direccion: address, sats: amount.satsExpected.toString(), token }, 201);
    }
    throw new ApiError(409, 'regalo_existente');
  });

  /** El invitado mira su propio aporte con su link privado (el token viaja en el cuerpo, no en la URL). */
  app.post('/api/aportes/consulta', async (c) => {
    const b = ((await c.req.json().catch(() => null)) ?? {}) as { token?: unknown };
    if (typeof b.token !== 'string' || !TOKEN.test(b.token)) throw new ApiError(404, 'no_encontrado');
    const [r] = await sql<(ContributionRow & { titulo: string; ocasion: string; ocasion_libre: string | null; idioma: string })[]>`
      select a.*, l.titulo, l.ocasion, l.ocasion_libre, l.idioma from aportes a join listas l on l.id = a.lista_id
      where a.token_hash = ${hashToken(b.token)} and l.red = ${network.name} and not a.externa`;
    if (r === undefined) throw new ApiError(404, 'no_encontrado');
    const state = await contributionState(chain, r.direccion);
    if (state.estado === 'recibido' && r.pagado === null) await sql`update aportes set pagado = now() where id = ${r.id}`;
    return c.json({
      lista: { id: r.lista_id, titulo: r.titulo, ocasion: r.ocasion, ocasionLibre: r.ocasion_libre, idioma: r.idioma },
      direccion: r.direccion,
      nombre: r.nombre,
      mensaje: r.mensaje,
      satsDeclarados: r.sats_declarados.toString(),
      estado: state.estado,
      recibidos: state.recibidos.toString(),
      creado: r.creado.toISOString(),
    });
  });

  /** Panel de quien armó la lista: todos los aportes, con nombre, mensaje y lo que llegó. */
  app.get('/api/cuenta/listas', async (c) => {
    const account = await owner(c);
    const lists = await sql<ListRow[]>`select * from listas where usuario_id = ${account.id} and red = ${network.name} order by creada desc`;
    const out = await Promise.all(
      lists.map(async (l) => {
        const real = await sql<ContributionRow[]>`select * from aportes where lista_id = ${l.id} and not externa order by indice`;
        const states = await mapLimit(real, CHAIN_CONCURRENCY, (r) => contributionState(chain, r.direccion).catch(() => null));
        let total = 0n;
        const aportes = real.map((r, i) => {
          const s = states[i];
          if (s) total += s.recibidos;
          return {
            indice: r.indice,
            direccion: r.direccion,
            nombre: r.nombre,
            mensaje: r.mensaje,
            satsDeclarados: r.sats_declarados.toString(),
            estado: s?.estado ?? null,
            recibidos: s?.recibidos.toString() ?? null,
            creado: r.creado.toISOString(),
          };
        });
        return { ...publicList(l, deps.ceilingUsd), xpub: l.xpub, totalRecibido: total.toString(), aportes };
      }),
    );
    return c.json({ listas: out });
  });

  /** Cerrar una lista: no acepta más aportes nuevos (los ya confirmados siguen valiendo). */
  app.post('/api/cuenta/listas/:id/cerrar', async (c) => {
    const account = await owner(c);
    const rows = await sql`update listas set cerrada = now() where id = ${c.req.param('id')} and usuario_id = ${account.id} and cerrada is null returning id`;
    if (rows.length === 0) throw new ApiError(404, 'no_encontrado');
    return c.json({ ok: true });
  });
}
