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
  alias: string | null;
  alias_titular: string | null;
  pais: Pais | null;
  moneda: string | null;
  cobro: string | null;
  clave_cifrada: string | null;
  /** Denuncias (reports.ts): fuera de «activa» no muestra datos para aportar. */
  estado: 'activa' | 'pausada' | 'en_revision' | 'baja';
  reactivada: Date | null;
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
  para: string | null;
  varios: boolean;
  semilla: boolean;
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

interface TransferRow {
  id: string;
  lista_id: string;
  codigo: string;
  nombre: string | null;
  mensaje: string;
  /** En la unidad menor de la moneda de la lista. */
  monto: string;
  estado: 'anunciada' | 'recibida' | 'convertida';
  sats_convertidos: string | null;
  tanda_sats: string | null;
  tanda_aportes: number | null;
  creada: Date;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest();
/**
 * Países de las listas que aceptan transferencias y su moneda (handoff 21/10/2026, «listas por
 * país»). En «Otro» (XX) la moneda la elige el dueño (ISO 4217). El medio y el dato van cifrados.
 */
export type Pais = 'AR' | 'BR' | 'CO' | 'EU' | 'XX';
const COUNTRY_CURRENCY: Readonly<Record<Pais, string | null>> = { AR: 'ARS', BR: 'BRL', CO: 'COP', EU: 'EUR', XX: null };
/** Dato de cobro cifrado (v1, AES-256-GCM en el navegador del dueño) y clave de la lista envuelta. */
const SEALED_COBRO = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{40,2000}$/;
const SEALED_KEY = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{40,200}$/;
/** Código de referencia para el concepto de la transferencia: sin 0/O ni 1/I para no confundirse. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => `RB-${Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')}`;
const newToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
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

/**
 * Tope por aporte: las listas con billetera propia (cold wallet) no tienen; las de "Semilla nueva",
 * el mismo que los regalos (autorizado el 17/10/2026, docs/mainnet.md).
 */
const listCeiling = (l: Pick<ListRow, 'semilla'>, ceilingUsd: number): number | null => (l.semilla ? ceilingUsd : null);

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
  topeUsd: listCeiling(l, ceilingUsd),
  estado: l.estado,
  // Acepta transferencias de persona a persona en la moneda de la lista (el dato va cifrado).
  aceptaTransferencias: l.estado === 'activa' && (l.cobro !== null || l.alias !== null),
  pais: l.pais,
  moneda: l.moneda,
  para: l.para,
  varios: l.varios,
});

/** Dato para transferir: el cifrado (lo abre el navegador del invitado) o, en listas viejas, el alias en claro. */
const collectData = (l: Pick<ListRow, 'cobro' | 'alias' | 'alias_titular'>) =>
  l.cobro !== null ? { cobro: l.cobro, alias: null, titular: null } : { cobro: null, alias: l.alias, titular: l.alias_titular };

const transferView = (r: TransferRow) => ({
  codigo: r.codigo,
  nombre: r.nombre,
  mensaje: r.mensaje,
  monto: r.monto.toString(),
  estado: r.estado,
  satsConvertidos: r.sats_convertidos === null ? null : r.sats_convertidos.toString(),
  tanda: r.tanda_sats === null ? null : { sats: r.tanda_sats.toString(), aportes: r.tanda_aportes as number },
  creada: r.creada.toISOString(),
});

/**
 * Reparte los sats de una compra entre transferencias, en proporción a sus montos (en la unidad
 * menor de la moneda de la lista, con bigint). Lo que sobra del redondeo va a las de mayor resto, así la suma da exacto.
 */
export function splitPurchase(sats: bigint, centsList: readonly bigint[]): bigint[] {
  const total = centsList.reduce((a, b) => a + b, 0n);
  const shares = centsList.map((c) => (sats * c) / total);
  const remainders = centsList.map((c, i) => ({ i, r: (sats * c) % total }));
  let left = sats - shares.reduce((a, b) => a + b, 0n);
  remainders.sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i));
  for (const { i } of remainders) {
    if (left === 0n) break;
    shares[i] = (shares[i] as bigint) + 1n;
    left -= 1n;
  }
  return shares;
}

/** País de la lista y su moneda (fija, o ISO 4217 en «Otro»). */
function countryAndCurrency(pais: unknown, moneda: unknown): { pais: Pais; moneda: string } {
  if (typeof pais !== 'string' || !(pais in COUNTRY_CURRENCY)) throw new ApiError(400, 'pedido_invalido', 'pais');
  const fixed = COUNTRY_CURRENCY[pais as Pais];
  if (fixed !== null) {
    if (moneda !== undefined && moneda !== fixed) throw new ApiError(400, 'pedido_invalido', 'moneda');
    return { pais: pais as Pais, moneda: fixed };
  }
  if (typeof moneda !== 'string' || !/^[A-Z]{3}$/.test(moneda)) throw new ApiError(400, 'pedido_invalido', 'moneda');
  return { pais: pais as Pais, moneda };
}

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
    // Transferencias (opcional): país y moneda, y el compromiso explícito de convertirlas a
    // bitcoin. El dato de cobro llega después, cifrado con el id de la lista (/cobro).
    const transfers = b.pais === undefined || b.pais === null ? null : countryAndCurrency(b.pais, b.moneda);
    if (transfers !== null && b.convertir !== true) throw new ApiError(400, 'pedido_invalido', 'convertir');
    const id = newGiftId();
    await sql`
      insert into listas (id, red, usuario_id, xpub, titulo, ocasion, ocasion_libre, mensaje, fecha, idioma, pais, moneda, para, varios, semilla)
      values (${id}, ${network.name}, ${account.id}, ${xpub}, ${text(b.titulo, LIST_LIMITS.title, true)}, ${b.ocasion},
              ${b.ocasion === 'otra' ? text(b.ocasionLibre, LIST_LIMITS.freeOccasion, false) : null},
              ${text(b.mensaje, LIST_LIMITS.message, false) ?? ''}, ${fecha}, ${b.idioma}, ${transfers?.pais ?? null}, ${transfers?.moneda ?? null},
              ${text(b.para, 60, false)}, ${b.varios === true}, ${b.semilla === true})`;
    return c.json({ id }, 201);
  });

  /**
   * El dato de cobro cifrado (y, si la cuenta tiene bóveda, la clave de la lista envuelta con la
   * clave maestra). Sirve para cargarlo la primera vez y para volver a cargarlo con otra clave:
   * entonces el alias en claro de una lista vieja se borra. La moneda no cambia si ya hay
   * transferencias (una lista tiene una sola moneda).
   */
  app.post('/api/cuenta/listas/:id/cobro', async (c) => {
    const account = await owner(c);
    const b = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (typeof b.cobro !== 'string' || !SEALED_COBRO.test(b.cobro)) throw new ApiError(400, 'pedido_invalido', 'cobro');
    if (b.clave !== undefined && b.clave !== null && (typeof b.clave !== 'string' || !SEALED_KEY.test(b.clave))) throw new ApiError(400, 'pedido_invalido', 'clave');
    const { pais, moneda } = countryAndCurrency(b.pais, b.moneda);
    await sql.begin(async (tx) => {
      const [l] = await tx<{ moneda: string | null; transferencias: string }[]>`
        select l.moneda, (select count(*) from transferencias t where t.lista_id = l.id) as transferencias
        from listas l where l.id = ${c.req.param('id')} and l.usuario_id = ${account.id} for update`;
      if (l === undefined) throw new ApiError(404, 'no_encontrado');
      if (Number(l.transferencias) > 0 && l.moneda !== moneda) throw new ApiError(409, 'pedido_invalido', 'moneda');
      await tx`
        update listas set pais = ${pais}, moneda = ${moneda}, cobro = ${b.cobro as string}, clave_cifrada = ${(b.clave as string | undefined) ?? null},
          alias = null, alias_titular = null
        where id = ${c.req.param('id')}`;
    });
    return c.json({ ok: true });
  });

  /** La lista para los invitados: nunca muestra aportes ni totales. */
  app.get('/api/listas/:id', async (c) => {
    const list = await findList(sql, c.req.param('id'));
    if (list === null || list.red !== network.name || list.estado === 'baja') throw new ApiError(404, 'no_encontrado');
    return c.json(publicList(list, deps.ceilingUsd));
  });

  /**
   * Turno del mazo de mensajes de ejemplo: cada invitado que abre la lista recibe el siguiente
   * (la mezcla la hace el navegador con el id de la lista). No toca nada de fondos.
   */
  app.post('/api/listas/:id/ejemplo', async (c) => {
    const [row] = await sql<{ turno: number }[]>`
      update listas set mazo = mazo + 1 where id = ${c.req.param('id')} and red = ${network.name} and cerrada is null returning mazo - 1 as turno`;
    if (row === undefined) throw new ApiError(404, 'no_encontrado');
    return c.json({ turno: row.turno });
  });

  /** Un invitado confirma su aporte: recibe la dirección para pagar y su link privado. */
  app.post('/api/listas/:id/aportes', async (c) => {
    const ip = clientIp(c.req.header('x-forwarded-for'));
    if (!limiter.allowed(ip)) throw new ApiError(429, 'demasiados_pedidos');
    const list = await findList(sql, c.req.param('id'));
    if (list === null || list.red !== network.name || list.estado === 'baja') throw new ApiError(404, 'no_encontrado');
    if (list.estado !== 'activa') throw new ApiError(409, 'lista_pausada');
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
    checkAmount(amount, usdPerBtc, arsPerBtc, MIN_CONTRIBUTION_SATS, listCeiling(list, deps.ceilingUsd) ?? Number.POSITIVE_INFINITY);
    const name = text(b.nombre, LIST_LIMITS.name, false);
    const message = text(b.mensaje, LIST_LIMITS.message, false) ?? '';
    const key = parseAccountKey(list.xpub, network);
    const token = newToken();

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

  /**
   * Un invitado anuncia una transferencia: recibe el dato de cobro cifrado (lo abre su navegador
   * con la clave del link) y un código de referencia único para el concepto. Va de persona a
   * persona: no pasa por la plataforma ni tiene tope. Las listas viejas con alias en claro lo
   * siguen devolviendo hasta que su dueño lo vuelva a cargar.
   */
  app.post('/api/listas/:id/transferencias', async (c) => {
    const ip = clientIp(c.req.header('x-forwarded-for'));
    if (!limiter.allowed(ip)) throw new ApiError(429, 'demasiados_pedidos');
    const list = await findList(sql, c.req.param('id'));
    if (list === null || list.red !== network.name || (list.cobro === null && list.alias === null) || list.moneda === null || list.estado === 'baja') throw new ApiError(404, 'no_encontrado');
    if (list.estado !== 'activa') throw new ApiError(409, 'lista_pausada');
    if (list.cerrada !== null) throw new ApiError(409, 'regalo_no_disponible', 'lista_cerrada');
    const b = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    // En la unidad menor de la moneda de la lista (centavos), como texto.
    if (typeof b.monto !== 'string' || !/^[1-9]\d{0,14}$/.test(b.monto)) throw new ApiError(400, 'monto_invalido');
    const name = text(b.nombre, LIST_LIMITS.name, false);
    const message = text(b.mensaje, LIST_LIMITS.message, false) ?? '';
    const token = newToken();
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = newCode();
      try {
        await sql`
          insert into transferencias (lista_id, codigo, nombre, mensaje, monto, token_hash)
          values (${list.id}, ${code}, ${name}, ${message}, ${b.monto}, ${hashToken(token)})`;
      } catch (error) {
        if ((error as { code?: string }).code === '23505') continue;
        throw error;
      }
      limiter.record(ip);
      return c.json({ codigo: code, monto: b.monto, moneda: list.moneda, token, ...collectData(list) }, 201);
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
    if (r === undefined) {
      const [tr] = await sql<(TransferRow & { titulo: string; ocasion: string; ocasion_libre: string | null; idioma: string } & Pick<ListRow, 'alias' | 'alias_titular' | 'cobro' | 'moneda'> & { lista_estado: ListRow['estado'] })[]>`
        select t.*, l.titulo, l.ocasion, l.ocasion_libre, l.idioma, l.alias, l.alias_titular, l.cobro, l.moneda, l.estado as lista_estado from transferencias t join listas l on l.id = t.lista_id
        where t.token_hash = ${hashToken(b.token)} and l.red = ${network.name}`;
      if (tr === undefined) throw new ApiError(404, 'no_encontrado');
      return c.json({
        tipo: 'transferencia',
        lista: { id: tr.lista_id, titulo: tr.titulo, ocasion: tr.ocasion, ocasionLibre: tr.ocasion_libre, idioma: tr.idioma },
        moneda: tr.moneda,
        // Con la lista pausada por una denuncia, el dato de cobro no se muestra (el aporte sí).
        ...(tr.lista_estado === 'activa' ? collectData(tr) : { cobro: null, alias: null, titular: null }),
        listaPausada: tr.lista_estado !== 'activa',
        ...transferView(tr),
      });
    }
    const state = await contributionState(chain, r.direccion);
    if (state.estado === 'recibido' && r.pagado === null) await sql`update aportes set pagado = now() where id = ${r.id}`;
    return c.json({
      tipo: 'bitcoin',
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
        const transfers = await sql<TransferRow[]>`select * from transferencias where lista_id = ${l.id} order by creada`;
        // Los motivos de las denuncias, sin el mail de quien denunció.
        const reports = await sql<{ motivo: string; creada: Date }[]>`select motivo, creada from denuncias where lista_id = ${l.id} order by creada`;
        return {
          ...publicList(l, deps.ceilingUsd),
          xpub: l.xpub,
          cobro: l.cobro,
          claveCifrada: l.clave_cifrada,
          alias: l.alias,
          aliasTitular: l.alias_titular,
          totalRecibido: total.toString(),
          puedeReactivar: l.estado === 'pausada' && l.reactivada === null,
          denuncias: reports.map((r) => ({ motivo: r.motivo, creada: r.creada.toISOString() })),
          aportes,
          transferencias: transfers.map(transferView),
        };
      }),
    );
    return c.json({ listas: out });
  });

  /**
   * Quien armó la lista marca que una transferencia le llegó. Es lo único que no se verifica en
   * la cadena. La conversión a bitcoin se marca con una compra (abajo), de una o de varias juntas.
   */
  app.post('/api/cuenta/listas/:id/transferencias/:codigo', async (c) => {
    const account = await owner(c);
    const b = ((await c.req.json().catch(() => null)) ?? {}) as { estado?: unknown };
    if (b.estado !== 'recibida') throw new ApiError(400, 'pedido_invalido');
    const rows = await sql`
      update transferencias t set estado = 'recibida', actualizada = now()
      from listas l
      where t.lista_id = l.id and l.id = ${c.req.param('id')} and l.usuario_id = ${account.id} and t.codigo = ${c.req.param('codigo')}
        and t.estado = 'anunciada'
      returning t.id`;
    if (rows.length === 0) throw new ApiError(404, 'no_encontrado');
    return c.json({ ok: true });
  });

  /**
   * Compra en tanda: quien armó la lista compró bitcoin con varias transferencias recibidas (las
   * que quiso, cuando quiso). Los sats se reparten en proporción a los pesos de cada una y cada
   * invitado ve su parte. No es una promesa: es la división de una compra que ya hizo.
   */
  app.post('/api/cuenta/listas/:id/tanda', async (c) => {
    const account = await owner(c);
    const b = ((await c.req.json().catch(() => null)) ?? {}) as { codigos?: unknown; sats?: unknown };
    if (typeof b.sats !== 'string' || !/^[1-9]\d{0,15}$/.test(b.sats)) throw new ApiError(400, 'monto_invalido');
    const codes = Array.isArray(b.codigos) ? [...new Set(b.codigos.filter((x): x is string => typeof x === 'string'))] : [];
    if (codes.length === 0 || codes.length > 200) throw new ApiError(400, 'pedido_invalido');
    const sats = BigInt(b.sats);
    await sql.begin(async (tx) => {
      const rows = await tx<{ id: string; monto: string }[]>`
        select t.id, t.monto from transferencias t join listas l on l.id = t.lista_id
        where l.id = ${c.req.param('id')} and l.usuario_id = ${account.id} and t.estado = 'recibida' and t.codigo in ${tx(codes)}
        order by t.id for update of t`;
      // Todas tienen que ser de esta lista y estar recibidas (ni anunciadas ni ya convertidas).
      if (rows.length !== codes.length) throw new ApiError(409, 'pedido_invalido', 'transferencias');
      // Montos en la unidad menor de la moneda de la lista: una tanda nunca mezcla monedas.
      const cents = rows.map((r) => BigInt(r.monto));
      if (sats < BigInt(rows.length)) throw new ApiError(400, 'monto_invalido');
      const shares = splitPurchase(sats, cents);
      for (const [i, r] of rows.entries()) {
        await tx`
          update transferencias set estado = 'convertida', sats_convertidos = ${(shares[i] as bigint).toString()},
            tanda_sats = ${sats.toString()}, tanda_aportes = ${rows.length}, actualizada = now()
          where id = ${r.id}`;
      }
    });
    return c.json({ ok: true });
  });

  /** Cerrar una lista: no acepta más aportes nuevos (los ya confirmados siguen valiendo). */
  app.post('/api/cuenta/listas/:id/cerrar', async (c) => {
    const account = await owner(c);
    const rows = await sql`update listas set cerrada = now() where id = ${c.req.param('id')} and usuario_id = ${account.id} and cerrada is null returning id`;
    if (rows.length === 0) throw new ApiError(404, 'no_encontrado');
    return c.json({ ok: true });
  });
}
