import { timingSafeEqual } from 'node:crypto';
import { addressFromScript, isCoreError, isLang, inspectTransaction, type InspectedTx, minimumGiftAmount, type Network, parseDestination } from '@regalale/core';
import { Hono } from 'hono';
import { type ArsPriceClient, ChainError, type ChainClient, type PriceClient, type Utxo } from './chain.ts';
import type { Sql } from './db.ts';
import { processPending } from './broadcaster.ts';
import { CARD_STYLES, type CardStyle, clearClaim, findGift, findOwnImage, type OwnImage, type Gift, insertGift, isDuplicateAddress, pendingFor, recordClaim, schedulePending } from './gifts.ts';
import { RateLimiter } from './ratelimit.ts';
import { ApiError } from './errors.ts';
import { type AccountConfig, currentAccount, registerAccountRoutes } from './accountRoutes.ts';
import { registerAdminRoutes } from './admin.ts';
import { registerListRoutes } from './lists.ts';
import { checkAmount, clientIp, text } from './validate.ts';
import { consoleMailer } from './mail.ts';
import { registerAdminCobroRoutes } from './adminCobro.ts';
import { registerRefundRoutes } from './refunds.ts';
import { balance, canGive, chargingActive, consumeGiftCredits, refundCanceledGifts } from './credits.ts';
import { BUYABLE, createPayment, findPayment, foundersLeft, paymentKey, paymentView, refreshPayment, watchPayments } from './payments.ts';
import { sendReadyNotices, sendReminders } from './notices.ts';
import { giftState } from './state.ts';

export interface AppDeps {
  readonly sql: Sql;
  readonly chain: ChainClient;
  readonly price: PriceClient;
  /** Sin cotización en pesos, los regalos solo se arman en dólares o sats. */
  readonly arsPrice?: ArsPriceClient;
  readonly network: Network;
  /** Si está, habilita POST /api/tareas/difusiones con el encabezado x-tarea-token. */
  readonly tasksToken?: string | null;
  /** Regalos que puede crear una misma IP por hora. */
  readonly createLimitPerHour?: number;
  /** Cuentas con passkey y mails. Sin esto, solo desde localhost y con mails al log. */
  readonly accounts?: AccountConfig;
  /** Techo por regalo en dólares (TOPE_USD). En mainnet nunca supera MAINNET_CEILING_USD. */
  readonly ceilingUsd?: number;
  /** Aportes a listas que puede confirmar una misma IP por hora. */
  readonly listContributionsPerHour?: number;
  /** Mails con acceso al panel de administración (ADMIN_EMAILS). */
  readonly adminEmails?: readonly string[];
}

/** Techo de la beta en redes de prueba: un regalo no puede superar este valor en dólares. */
export const CEILING_USD = 100;
/**
 * Techo en mainnet autorizado por la responsable del proyecto (docs/mainnet.md). Subirlo
 * requiere una nueva autorización explícita, no solo cambiar la variable de entorno.
 */
export const MAINNET_CEILING_USD = 100;

/** Techo efectivo según la red: en mainnet, el menor entre el configurado y el autorizado. */
export function effectiveCeilingUsd(network: Network, configured: number | undefined): number {
  const base = configured !== undefined && Number.isFinite(configured) && configured > 0 ? configured : CEILING_USD;
  return network.name === 'mainnet' ? Math.min(base, MAINNET_CEILING_USD) : base;
}
// Mismo catálogo que apps/web/src/content/occasions.ts ("otra" = ocasión libre; "graduacion" queda por regalos viejos).
export const OCCASIONS = [
  'cumple', 'bautismo', 'navidad', 'casamiento', 'babyshower', 'porque', 'nacimiento', 'comunion', 'mitzva', 'quince',
  'egresados', 'recibido', 'aniversario', 'jubilacion', 'casanueva', 'reyes', 'anionuevo', 'sanvalentin', 'pascuas',
  'diamadre', 'diapadre', 'dianino', 'amigo', 'abuelos', 'maestro', 'pizzaday', 'genesis', 'whitepaper', 'halving',
  'trabajo', 'gracias', 'mejorate', 'graduacion', 'otra',
] as const;
export const LIMITS = { to: 30, from: 30, message: 280, freeOccasion: 40 } as const;

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Tasa mínima que se acepta difundir (sat/vB) y tope de sanidad. */
const MIN_RELAY_SAT_VB = 0.1;
const MAX_SAT_VB = 1000;

function confirmedUtxos(utxos: Utxo[]): Utxo[] {
  return utxos.filter((u) => u.confirmed);
}

/**
 * Verifica que la transacción firmada sea un barrido del regalo: gasta exactamente
 * todos sus UTXO confirmados, nada más, y tiene una sola salida. Devuelve la
 * transacción leída y la tasa de comisión efectiva.
 */
export function verifySweep(hex: string, utxos: Utxo[]): { tx: InspectedTx; feeRate: number; fee: bigint } {
  let tx: InspectedTx;
  try {
    tx = inspectTransaction(hex);
  } catch (error) {
    if (isCoreError(error)) throw new ApiError(422, 'transaccion_invalida');
    throw error;
  }
  const available = new Map(confirmedUtxos(utxos).map((u) => [`${u.txid}:${u.vout}`, u.value]));
  const spent = new Set(tx.inputs.map((i) => `${i.txid}:${i.vout}`));
  if (spent.size !== tx.inputs.length) throw new ApiError(422, 'transaccion_invalida', 'Entradas repetidas.');
  if (tx.outputs.length !== 1) throw new ApiError(422, 'transaccion_invalida', 'El barrido tiene que tener una sola salida.');
  for (const key of spent) {
    if (!available.has(key)) throw new ApiError(409, 'fondos_cambiaron', 'La transacción gasta algo que no es un UTXO confirmado del regalo.');
  }
  if (spent.size !== available.size) throw new ApiError(409, 'fondos_cambiaron', 'Llegaron fondos nuevos: hay que volver a armar el barrido.');
  const total = [...available.values()].reduce((a, b) => a + b, 0n);
  const fee = total - (tx.outputs[0]?.amount ?? 0n);
  const feeRate = Number(fee) / tx.vsize;
  if (fee <= 0n || feeRate < MIN_RELAY_SAT_VB || feeRate > MAX_SAT_VB) {
    throw new ApiError(422, 'transaccion_invalida', `Comisión fuera de rango: ${feeRate.toFixed(2)} sat/vB.`);
  }
  return { tx, feeRate, fee };
}

async function giftOr404(sql: Sql, id: string): Promise<Gift> {
  const gift = await findGift(sql, id);
  if (gift === null) throw new ApiError(404, 'regalo_no_encontrado');
  return gift;
}

export function createApp(deps: AppDeps): Hono {
  const { sql, chain, price, network } = deps;
  const app = new Hono();

  app.use('/api/*', async (c, next) => {
    await next();
    c.header('cache-control', 'no-store');
    c.header('x-content-type-options', 'nosniff');
  });

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      // Rechazos de cuenta y passkey al log, con el motivo (nunca el mail ni la credencial).
      if (c.req.path.startsWith('/api/cuenta/') && error.status !== 429) console.warn(`cuenta: ${c.req.path} ${error.status} ${error.code}: ${error.message}`);
      return c.json({ error: error.code, detalle: error.message }, error.status);
    }
    if (error instanceof ChainError) return c.json({ error: 'cadena_no_disponible' }, 502);
    console.error(error);
    return c.json({ error: 'error_interno' }, 500);
  });

  const ceilingUsd = effectiveCeilingUsd(network, deps.ceilingUsd);
  app.get('/api/salud', (c) => c.json({ ok: true, red: network.name, topeUsd: ceilingUsd }));

  const accounts: AccountConfig = deps.accounts ?? { origins: ['http://localhost'], publicUrl: 'http://localhost', mailer: consoleMailer, cookieSecure: false };
  registerAccountRoutes(app, { sql, chain, config: accounts, clientIp: (c) => clientIp(c.req.header('x-forwarded-for')) });
  registerListRoutes(app, { sql, chain, price, arsPrice: deps.arsPrice, network, ceilingUsd, occasions: OCCASIONS, ...(deps.listContributionsPerHour === undefined ? {} : { contributionsPerHour: deps.listContributionsPerHour }) });
  registerAdminRoutes(app, { sql, chain, price, network: network.name, adminEmails: deps.adminEmails ?? [] });
  registerAdminCobroRoutes(app, { sql, network, adminEmails: deps.adminEmails ?? [], mailer: accounts.mailer });
  registerRefundRoutes(app, { sql, network, adminEmails: deps.adminEmails ?? [], mailer: accounts.mailer });

  /** Precios públicos (para la página de precios y la pantalla de compra). */
  app.get('/api/productos', async (c) => {
    const rows = await sql<{ codigo: string; precio_cents: number; regalos: number; listas_cumple: number; listas_otras: number; plan: string | null }[]>`
      select codigo, precio_cents, regalos, listas_cumple, listas_otras, plan from productos where activo order by precio_cents, codigo`;
    const [charging, key, founders] = await Promise.all([chargingActive(sql), paymentKey(sql, network).catch(() => null), foundersLeft(sql)]);
    return c.json({
      cobroActivo: charging,
      // Se puede comprar si la llave de cobro está cargada (aunque el cobro todavía no esté activo: la compra de prueba).
      seVende: key !== null,
      fundadoresQuedan: founders,
      productos: rows.map((p) => ({
        codigo: p.codigo,
        precioUsd: p.precio_cents / 100,
        regalos: p.regalos,
        listasCumple: p.listas_cumple,
        listasOtras: p.listas_otras,
        plan: p.plan,
        seVendeSuelto: (BUYABLE as readonly string[]).includes(p.codigo),
      })),
    });
  });

  /** Comprar un producto: cotiza en sats (30 minutos) y devuelve una dirección nueva para pagar. */
  app.post('/api/cuenta/pagos', async (c) => {
    const account = await currentAccount(sql, c);
    if (account === null) throw new ApiError(401, 'sesion_requerida');
    const body = ((await c.req.json().catch(() => null)) ?? {}) as { producto?: unknown };
    if (typeof body.producto !== 'string') throw new ApiError(400, 'pedido_invalido');
    const payment = await createPayment({ sql, price, network }, account.id, body.producto);
    return c.json(paymentView(payment), 201);
  });

  /** Estado de un pago propio (mira la cadena en el momento). */
  app.get('/api/cuenta/pagos/:id', async (c) => {
    const account = await currentAccount(sql, c);
    if (account === null) throw new ApiError(401, 'sesion_requerida');
    const id = c.req.param('id');
    const payment = /^[A-Za-z0-9_-]{22}$/.test(id) ? await findPayment(sql, id) : null;
    if (payment === null || payment.accountId !== account.id) throw new ApiError(404, 'no_encontrado');
    return c.json(paymentView(await refreshPayment({ sql, chain, price }, payment)));
  });

  /** Difusiones programadas: lo dispara Cloud Scheduler cada pocos minutos. */
  app.post('/api/tareas/difusiones', async (c) => {
    const expected = deps.tasksToken;
    const given = c.req.header('x-tarea-token') ?? '';
    if (expected === undefined || expected === null || !sameToken(given, expected)) return c.json({ error: 'no_autorizado' }, 401);
    const broadcasts = await processPending({ sql, chain, network });
    const avisoDeps = { sql, chain, mailer: accounts.mailer, publicUrl: accounts.publicUrl };
    const avisos = await sendReadyNotices(avisoDeps);
    const recordatorios = await sendReminders(avisoDeps);
    const creditos = await consumeGiftCredits({ sql, chain });
    const devoluciones = await refundCanceledGifts(sql);
    const pagos = await watchPayments({ sql, chain, price });
    return c.json({ ...broadcasts, avisos, recordatorios, creditos, devoluciones, pagos });
  });

  app.get('/api/precio', async (c) => {
    const [usdPorBtc, ars] = await Promise.all([price.btcUsd(), deps.arsPrice?.btcArs().catch(() => null) ?? null]);
    // Las fuentes se muestran junto a la conversión, para que se pueda verificar.
    return c.json({ usdPorBtc, fuenteUsd: 'mempool.space', arsPorBtc: ars?.price ?? null, fuenteArs: ars?.source ?? null });
  });

  const createLimiter = new RateLimiter(deps.createLimitPerHour ?? 30, 60 * 60 * 1000);

  /**
   * El que regala registra el regalo antes de pagarlo: datos de la tarjeta, la dirección
   * derivada en su navegador y cuánto va a mandar. Nunca recibe semillas ni palabras.
   * 409 regalo_existente si la dirección ya está registrada: el navegador prueba el índice siguiente.
   */
  app.post('/api/gifts', async (c) => {
    const ip = clientIp(c.req.header('x-forwarded-for'));
    if (!createLimiter.allowed(ip)) throw new ApiError(429, 'demasiados_pedidos');
    const g = parseNewGift(await c.req.json().catch(() => null), network);
    // Con sesión, el regalo queda en la cuenta (con su índice, para volver a derivarlo desde la bóveda).
    const account = await currentAccount(sql, c);
    // Con el cobro activo, una cuenta sin créditos ni plan no puede crear otro regalo: la web le
    // ofrece los packs antes de mostrar la dirección.
    if (account !== null && (await chargingActive(sql)) && !canGive(await balance(sql, account.id), true)) {
      throw new ApiError(409, 'sin_creditos');
    }
    const [usdPerBtc, fees, arsPerBtc, history] = await Promise.all([
      price.btcUsd(),
      chain.fees(),
      g.currency === 'ARS' ? (deps.arsPrice?.btcArs().then((q) => q.price) ?? Promise.reject(new ApiError(422, 'monto_invalido'))) : null,
      chain.addressStats(g.address),
    ]);
    // Una dirección con movimientos ya se usó (por ejemplo, una base restaurada que perdió
    // regalos): quien recibió ese regalo antes tiene link y palabras. Se trata como existente.
    if (history.txCount > 0) throw new ApiError(409, 'regalo_existente');
    checkAmount(g, usdPerBtc, arsPerBtc, minimumGiftAmount(fees.economy), ceilingUsd);
    try {
      const gift = await insertGift(sql, {
        ...g,
        network: network.name,
        usdPerBtc,
        accountId: account?.id ?? null,
        index: account === null ? null : (g.index ?? null),
      });
      createLimiter.record(ip);
      return c.json({ id: gift.id }, 201);
    } catch (error) {
      if (isDuplicateAddress(error)) throw new ApiError(409, 'regalo_existente');
      throw error;
    }
  });

  app.get('/api/gifts/:id', async (c) => {
    const gift = await giftOr404(sql, c.req.param('id'));
    if (gift.network !== network.name) throw new ApiError(404, 'regalo_no_encontrado');
    const [stats, pending, usdNow] = await Promise.all([
      chain.addressStats(gift.address),
      pendingFor(sql, gift.id),
      price.btcUsd().catch(() => null),
    ]);
    const funds = giftState(gift, stats, pending !== null);
    // Pago trabado: alguna transacción sin confirmar paga menos que la comisión "económica".
    let stuck = false;
    if (funds.state === 'en_la_red') {
      const [payments, fees] = await Promise.all([chain.mempoolPayments(gift.address), chain.fees()]);
      stuck = payments.some((p) => p.value > 0n && p.feeRate < fees.economy);
    }
    return c.json({
      id: gift.id,
      red: gift.network,
      idioma: gift.lang,
      ocasion: gift.occasion,
      ocasionLibre: gift.occasionFree,
      para: gift.to,
      de: gift.from,
      mensaje: gift.message,
      imagen: gift.image,
      estilo: gift.style,
      direccion: gift.address,
      estado: funds.state,
      sats: {
        confirmados: funds.confirmedSats.toString(),
        sinConfirmar: funds.unconfirmedSats.toString(),
        esperados: gift.satsExpected === null ? null : gift.satsExpected.toString(),
      },
      pagoTrabado: stuck,
      original: gift.amount === null ? null : { moneda: gift.currency, monto: gift.amount, usdPorBtc: gift.usdPerBtc },
      usdPorBtcHoy: usdNow,
      reclamo: gift.claimTxid === null ? (pending === null ? null : { txid: pending.txid, tipo: 'programado' }) : { txid: gift.claimTxid, tipo: gift.claimKind },
    });
  });

  /** UTXO confirmados con su transacción completa: el navegador verifica los montos contra el txid. */
  /**
   * Un reclamo difundido que la red olvidó (expulsado de la mempool, nunca confirmado) con los
   * fondos todavía en la dirección del regalo no lo deja trabado: se libera para firmar otra vez.
   */
  const releaseStaleClaim = async (gift: Gift): Promise<Gift> => {
    if (gift.claimTxid === null) return gift;
    if (confirmedUtxos(await chain.addressUtxos(gift.address)).length === 0) return gift;
    try {
      await chain.txHex(gift.claimTxid);
      return gift;
    } catch (error) {
      if (!(error instanceof ChainError) || error.status !== 404) throw error;
      await clearClaim(sql, gift.id, gift.claimTxid);
      return { ...gift, claimTxid: null, claimKind: null };
    }
  };

  app.get('/api/gifts/:id/utxos', async (c) => {
    const gift = await releaseStaleClaim(await giftOr404(sql, c.req.param('id')));
    if (gift.network !== network.name) throw new ApiError(404, 'regalo_no_encontrado');
    if (gift.claimTxid !== null) throw new ApiError(409, 'ya_reclamado');
    const utxos = confirmedUtxos(await chain.addressUtxos(gift.address));
    const txids = [...new Set(utxos.map((u) => u.txid))];
    const raw = new Map(await Promise.all(txids.map(async (t) => [t, await chain.txHex(t)] as const)));
    return c.json({ utxos: utxos.map((u) => ({ txid: u.txid, vout: u.vout, rawTx: raw.get(u.txid) })) });
  });

  /** Imagen propia de la tarjeta: nunca cambia, se sirve como archivo inerte. */
  app.get('/api/gifts/:id/imagen', async (c) => {
    const image = await findOwnImage(sql, c.req.param('id'));
    if (image === null) throw new ApiError(404, 'regalo_no_encontrado');
    return c.body(image.data as Uint8Array<ArrayBuffer>, 200, {
      'content-type': image.type,
      'cache-control': 'public, max-age=31536000, immutable',
      'content-security-policy': "default-src 'none'; sandbox",
      'content-disposition': 'inline',
    });
  });

  app.get('/api/fees', async (c) => c.json(await chain.fees()));

  app.post('/api/gifts/:id/claim', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { hex?: unknown; modo?: unknown } | null;
    if (body === null || typeof body.hex !== 'string' || (body.modo !== 'ahora' && body.modo !== 'esperar')) {
      throw new ApiError(400, 'pedido_invalido');
    }
    const gift = await releaseStaleClaim(await giftOr404(sql, c.req.param('id')));
    if (gift.network !== network.name) throw new ApiError(404, 'regalo_no_encontrado');
    if (gift.claimTxid !== null) throw new ApiError(409, 'ya_reclamado');
    const utxos = await chain.addressUtxos(gift.address);
    if (confirmedUtxos(utxos).length === 0) throw new ApiError(409, 'regalo_no_disponible');
    const { tx, feeRate } = verifySweep(body.hex, utxos);
    const destination = describeOutput(tx, network);

    if (body.modo === 'esperar') {
      const fees = await chain.fees();
      if (feeRate < fees.minimum) {
        await schedulePending(sql, { giftId: gift.id, txid: tx.txid, hex: body.hex.toLowerCase(), satVb: feeRate });
        return c.json({ txid: tx.txid, estado: 'reclamo_programado' }, 202);
      }
    }
    let txid: string;
    try {
      txid = await chain.broadcast(body.hex.toLowerCase());
    } catch (error) {
      if (error instanceof ChainError && error.status !== undefined && error.status < 500) {
        throw new ApiError(422, 'difusion_rechazada', error.message);
      }
      throw error;
    }
    if (txid !== tx.txid) throw new ApiError(502, 'cadena_no_disponible', 'El servidor de cadena devolvió otro txid.');
    await recordClaim(sql, gift.id, { txid, kind: 'reclamo', destination });
    return c.json({ txid, estado: 'reclamado' });
  });

  return app;
}

/** IP del cliente: Cloud Run y Firebase Hosting la ponen primera en x-forwarded-for. */

type ParsedGift = Omit<Parameters<typeof insertGift>[1], 'network' | 'usdPerBtc' | 'accountId'> & {
  satsExpected: bigint;
  currency: 'USD' | 'ARS' | 'SAT';
  amount: number;
};


function badRequest(): never {
  throw new ApiError(400, 'pedido_invalido');
}

/** Tope de la imagen propia (ya achicada en el navegador a ~1024 px). */
export const OWN_IMAGE_MAX_BYTES = 600_000;

/** Imagen propia en base64: solo WebP, JPEG o PNG reconocidos por su firma, nunca SVG. */
function parseOwnImage(value: unknown): OwnImage {
  if (typeof value !== 'string' || value.length > Math.ceil(OWN_IMAGE_MAX_BYTES / 3) * 4 + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) badRequest();
  const data = new Uint8Array(Buffer.from(value, 'base64'));
  if (data.length < 100 || data.length > OWN_IMAGE_MAX_BYTES) badRequest();
  const at = (i: number, bytes: number[]) => bytes.every((b, j) => data[i + j] === b);
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return { type: 'image/webp', data };
  if (at(0, [0xff, 0xd8, 0xff])) return { type: 'image/jpeg', data };
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { type: 'image/png', data };
  return badRequest();
}

function parseNewGift(body: unknown, network: Network): ParsedGift {
  if (body === null || typeof body !== 'object') throw new ApiError(400, 'pedido_invalido');
  const b = body as Record<string, unknown>;
  let address: string;
  try {
    const d = parseDestination(String(b.direccion ?? ''), network);
    if (d.type !== 'p2wpkh') throw new ApiError(400, 'pedido_invalido');
    address = d.address;
  } catch (error) {
    if (error instanceof ApiError || isCoreError(error)) throw new ApiError(400, 'pedido_invalido');
    throw error;
  }
  if (typeof b.idioma !== 'string' || !isLang(b.idioma)) throw new ApiError(400, 'pedido_invalido');
  if (typeof b.ocasion !== 'string' || !(OCCASIONS as readonly string[]).includes(b.ocasion)) throw new ApiError(400, 'pedido_invalido');
  if (typeof b.imagen !== 'number' || !Number.isInteger(b.imagen) || b.imagen < 1 || b.imagen > 4) throw new ApiError(400, 'pedido_invalido');
  if (typeof b.sats !== 'string' || !/^[1-9]\d{0,15}$/.test(b.sats)) throw new ApiError(400, 'monto_invalido');
  if (b.moneda !== 'USD' && b.moneda !== 'ARS' && b.moneda !== 'SAT') throw new ApiError(400, 'monto_invalido');
  const style: CardStyle = b.estilo === undefined ? 'ilustracion' : (CARD_STYLES as readonly unknown[]).includes(b.estilo) ? (b.estilo as CardStyle) : badRequest();
  const ownImage = style === 'propia' ? parseOwnImage(b.imagenPropia) : null;
  if (typeof b.monto !== 'number' || !Number.isFinite(b.monto) || b.monto <= 0) throw new ApiError(400, 'monto_invalido');
  return {
    address,
    lang: b.idioma,
    occasion: b.ocasion,
    occasionFree: b.ocasion === 'otra' ? text(b.ocasionLibre, LIMITS.freeOccasion, false) : null,
    to: text(b.para, LIMITS.to, true) as string,
    from: text(b.de, LIMITS.from, false),
    message: text(b.mensaje, LIMITS.message, false) ?? '',
    image: b.imagen,
    style,
    ownImage,
    currency: b.moneda,
    amount: b.monto,
    satsExpected: BigInt(b.sats),
    index: typeof b.indice === 'number' && Number.isInteger(b.indice) && b.indice >= 0 && b.indice < 2 ** 31 ? b.indice : null,
  };
}


/** La dirección de destino del barrido, para registrarla (o el script en hex si no es estándar). */
function describeOutput(tx: InspectedTx, network: Network): string {
  const script = tx.outputs[0]?.script ?? new Uint8Array(0);
  return addressFromScript(script, network) ?? Buffer.from(script).toString('hex');
}
