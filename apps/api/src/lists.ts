import { createHash } from 'node:crypto';
import { deriveListAddress, isCoreError, isLang, type Lang, type Network, parseAccountKey } from '@regalale/core';
import type { Context, Hono } from 'hono';
import type postgres from 'postgres';
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
  /** Techo por aporte de las listas de casamiento y de las de billetera propia. */
  readonly listCeilingUsd: number;
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
  estado: 'anunciada' | 'recibida' | 'convertida' | 'no_llego';
  sats_convertidos: string | null;
  tanda_sats: string | null;
  tanda_aportes: number | null;
  creada: Date;
  /** Veces que el invitado volvió a avisar después de un «No me llegó» (hasta 3) y su nota. */
  avisos: number;
  nota: string | null;
  no_llego: Date | null;
  compra_id: string | null;
  /** De la compra (left join): cuándo se corrigió por última vez. */
  compra_corregida?: Date | null;
}

/** Lo que leen las vistas de una transferencia, con la fecha de corrección de su compra. */
const TRANSFER_SELECT = 't.*, c.corregida as compra_corregida';
/** Veces que el invitado puede volver a avisar una transferencia que no llegó. */
const MAX_REAVISOS = 3;
const NOTE_MAX = 140;

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
 * Tope por aporte (autorizado el 28/10/2026, docs/mainnet.md): las listas con billetera propia
 * (cold wallet) y las de casamiento, el de las listas (USD 250); las demás de «Semilla nueva», el
 * de los regalos (USD 100). Rige para los aportes nuevos, también en listas ya publicadas.
 */
export const listCeiling = (l: Pick<ListRow, 'semilla' | 'ocasion'>, d: Pick<ListDeps, 'ceilingUsd' | 'listCeilingUsd'>): number =>
  !l.semilla || l.ocasion === 'casamiento' ? d.listCeilingUsd : d.ceilingUsd;

const publicList = (l: ListRow, d: Pick<ListDeps, 'ceilingUsd' | 'listCeilingUsd'>) => ({
  id: l.id,
  red: l.red,
  titulo: l.titulo,
  ocasion: l.ocasion,
  ocasionLibre: l.ocasion_libre,
  mensaje: l.mensaje,
  fecha: l.fecha === null ? null : l.fecha.toISOString().slice(0, 10),
  idioma: l.idioma,
  abierta: l.cerrada === null,
  topeUsd: listCeiling(l, d),
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
  // Panel del dueño (handoff 21/10): «No me llegó», volver a avisar y compras corregidas.
  noLlego: r.no_llego?.toISOString() ?? null,
  avisos: r.avisos,
  avisosQuedan: Math.max(0, MAX_REAVISOS - r.avisos),
  nota: r.nota,
  compra: r.compra_id === null ? null : { id: r.compra_id.toString(), corregida: r.compra_corregida?.toISOString() ?? null },
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
    return c.json(publicList(list, deps));
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
    checkAmount(amount, usdPerBtc, arsPerBtc, MIN_CONTRIBUTION_SATS, listCeiling(list, deps));
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
        select ${sql.unsafe(TRANSFER_SELECT)}, l.titulo, l.ocasion, l.ocasion_libre, l.idioma, l.alias, l.alias_titular, l.cobro, l.moneda, l.estado as lista_estado
        from transferencias t join listas l on l.id = t.lista_id left join compras c on c.id = t.compra_id
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
        const transfers = await sql<TransferRow[]>`
          select ${sql.unsafe(TRANSFER_SELECT)} from transferencias t left join compras c on c.id = t.compra_id where t.lista_id = ${l.id} order by t.creada`;
        const purchases = await sql<{ id: string; sats: string; creada: Date; corregida: Date | null; deshecha: Date | null }[]>`
          select id, sats, creada, corregida, deshecha from compras where lista_id = ${l.id} order by creada`;
        const history = purchases.length === 0 ? [] : await sql<{ compra_id: string; accion: string; sats_antes: string | null; sats: string | null; creada: Date }[]>`
          select compra_id, accion, sats_antes, sats, creada from compras_historial where compra_id in ${sql(purchases.map((p) => p.id))} order by id`;
        // Totales separados (handoff 21/10): nunca un número que mezcle lo que vimos en la cadena
        // con lo que declara el dueño. «No me llegó» no suma en ninguno.
        const sum = (rows: readonly TransferRow[]) => rows.reduce((a, r) => a + BigInt(r.monto), 0n);
        const bought = purchases.filter((p) => p.deshecha === null).reduce((a, p) => a + BigInt(p.sats), 0n);
        // Los motivos de las denuncias, sin el mail de quien denunció.
        const reports = await sql<{ motivo: string; creada: Date }[]>`select motivo, creada from denuncias where lista_id = ${l.id} order by creada`;
        return {
          ...publicList(l, deps),
          xpub: l.xpub,
          cobro: l.cobro,
          claveCifrada: l.clave_cifrada,
          alias: l.alias,
          aliasTitular: l.alias_titular,
          totalRecibido: total.toString(),
          totales: {
            bitcoin: total.toString(),
            satsComprados: bought.toString(),
            anunciado: sum(transfers.filter((r) => r.estado === 'anunciada')).toString(),
            sinConvertir: sum(transfers.filter((r) => r.estado === 'recibida')).toString(),
          },
          compras: purchases
            .filter((p) => p.deshecha === null)
            .map((p) => ({
              id: p.id.toString(),
              sats: p.sats.toString(),
              creada: p.creada.toISOString(),
              corregida: p.corregida?.toISOString() ?? null,
              transferencias: transfers.filter((r) => r.compra_id?.toString() === p.id.toString()).map((r) => r.codigo),
              historial: history
                .filter((h) => h.compra_id.toString() === p.id.toString())
                .map((h) => ({ accion: h.accion, satsAntes: h.sats_antes?.toString() ?? null, sats: h.sats?.toString() ?? null, fecha: h.creada.toISOString() })),
            })),
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
   * Quien armó la lista marca que una transferencia le llegó, o que no le llegó (handoff 21/10:
   * «No me llegó», que no suma en ningún total). Es lo único que no se verifica en la cadena. Si
   * la plata aparece tarde, pasa de «no llegó» a recibida directamente. La conversión a bitcoin
   * se marca con una compra (abajo), de una o de varias juntas.
   */
  app.post('/api/cuenta/listas/:id/transferencias/:codigo', async (c) => {
    const account = await owner(c);
    const b = ((await c.req.json().catch(() => null)) ?? {}) as { estado?: unknown };
    if (b.estado !== 'recibida' && b.estado !== 'no_llego') throw new ApiError(400, 'pedido_invalido');
    const from = b.estado === 'recibida' ? ['anunciada', 'no_llego'] : ['anunciada'];
    const rows = await sql`
      update transferencias t set estado = ${b.estado}, no_llego = ${b.estado === 'no_llego' ? sql`now()` : sql`t.no_llego`}, actualizada = now()
      from listas l
      where t.lista_id = l.id and l.id = ${c.req.param('id')} and l.usuario_id = ${account.id} and t.codigo = ${c.req.param('codigo')}
        and t.estado in ${sql(from)}
      returning t.id`;
    if (rows.length === 0) throw new ApiError(404, 'no_encontrado');
    return c.json({ ok: true });
  });

  /**
   * El invitado vuelve a avisar una transferencia que el dueño no encontró: vuelve a anunciada,
   * con una nota opcional («salió el 12/11 a las 18:40»). Hasta 3 veces por transferencia.
   */
  app.post('/api/aportes/reaviso', async (c) => {
    const b = ((await c.req.json().catch(() => null)) ?? {}) as { token?: unknown; nota?: unknown };
    if (typeof b.token !== 'string' || !TOKEN.test(b.token)) throw new ApiError(404, 'no_encontrado');
    const note = b.nota === undefined || b.nota === null || b.nota === '' ? null : text(b.nota, NOTE_MAX, false);
    const rows = await sql`
      update transferencias t set estado = 'anunciada', avisos = t.avisos + 1, nota = ${note}, actualizada = now()
      from listas l
      where t.lista_id = l.id and l.red = ${network.name} and t.token_hash = ${hashToken(b.token)} and t.estado = 'no_llego' and t.avisos < ${MAX_REAVISOS}
      returning t.id`;
    if (rows.length === 0) throw new ApiError(409, 'pedido_invalido', 'no_se_puede_avisar');
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
      // La compra queda como registro propio, con su historial (handoff 21/10).
      const [purchase] = await tx<{ id: string }[]>`insert into compras (lista_id, sats) values (${c.req.param('id')}, ${sats.toString()}) returning id`;
      const purchaseId = (purchase as { id: string }).id;
      await tx`insert into compras_historial (compra_id, accion, sats) values (${purchaseId}, 'creada', ${sats.toString()})`;
      for (const [i, r] of rows.entries()) {
        await tx`
          update transferencias set estado = 'convertida', sats_convertidos = ${(shares[i] as bigint).toString()},
            tanda_sats = ${sats.toString()}, tanda_aportes = ${rows.length}, compra_id = ${purchaseId}, actualizada = now()
          where id = ${r.id}`;
      }
    });
    return c.json({ ok: true });
  });

  /** Una compra de la lista del dueño, bloqueada para cambiarla; null si no es suya o ya se deshizo. */
  const ownPurchase = async (tx: postgres.TransactionSql, listId: string, accountId: string, purchaseId: string) => {
    if (!/^\d{1,18}$/.test(purchaseId)) return null;
    const [p] = await tx<{ id: string; sats: string }[]>`
      select p.id, p.sats from compras p join listas l on l.id = p.lista_id
      where p.id = ${purchaseId} and l.id = ${listId} and l.usuario_id = ${accountId} and p.deshecha is null
      for update of p`;
    return p ?? null;
  };

  /**
   * Corregir una compra: cambia los sats y se vuelven a repartir en proporción. Siempre se puede,
   * pero nunca en silencio: queda en el historial y el invitado ve «corregido el dd/mm».
   */
  app.post('/api/cuenta/listas/:id/compras/:compra/corregir', async (c) => {
    const account = await owner(c);
    const b = ((await c.req.json().catch(() => null)) ?? {}) as { sats?: unknown };
    if (typeof b.sats !== 'string' || !/^[1-9]\d{0,15}$/.test(b.sats)) throw new ApiError(400, 'monto_invalido');
    const sats = BigInt(b.sats);
    await sql.begin(async (tx) => {
      const p = await ownPurchase(tx, c.req.param('id'), account.id, c.req.param('compra'));
      if (p === null) throw new ApiError(404, 'no_encontrado');
      const rows = await tx<{ id: string; monto: string }[]>`select id, monto from transferencias where compra_id = ${p.id} order by id for update`;
      if (sats < BigInt(rows.length)) throw new ApiError(400, 'monto_invalido');
      if (sats === BigInt(p.sats)) return;
      const shares = splitPurchase(sats, rows.map((r) => BigInt(r.monto)));
      for (const [i, r] of rows.entries()) {
        await tx`update transferencias set sats_convertidos = ${(shares[i] as bigint).toString()}, tanda_sats = ${sats.toString()}, actualizada = now() where id = ${r.id}`;
      }
      await tx`update compras set sats = ${sats.toString()}, corregida = now() where id = ${p.id}`;
      await tx`insert into compras_historial (compra_id, accion, sats_antes, sats) values (${p.id}, 'corregida', ${p.sats}, ${sats.toString()})`;
    });
    return c.json({ ok: true });
  });

  /** Deshacer una compra: sus transferencias vuelven a «recibida» (y se pueden armar de nuevo). */
  app.post('/api/cuenta/listas/:id/compras/:compra/deshacer', async (c) => {
    const account = await owner(c);
    await sql.begin(async (tx) => {
      const p = await ownPurchase(tx, c.req.param('id'), account.id, c.req.param('compra'));
      if (p === null) throw new ApiError(404, 'no_encontrado');
      await tx`
        update transferencias set estado = 'recibida', sats_convertidos = null, tanda_sats = null, tanda_aportes = null, compra_id = null, actualizada = now()
        where compra_id = ${p.id}`;
      await tx`update compras set deshecha = now() where id = ${p.id}`;
      await tx`insert into compras_historial (compra_id, accion, sats_antes) values (${p.id}, 'deshecha', ${p.sats})`;
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
