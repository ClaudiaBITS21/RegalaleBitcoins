import { isLang } from '@regalale/core';
import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  type Account,
  accountCredentials,
  accountGifts,
  consumeChallenge,
  createAccount,
  createChallenge,
  createMailLink,
  createSession,
  deleteSession,
  findAccountByEmail,
  findCredential,
  nextGiftIndex,
  normalizeEmail,
  redeemMailLink,
  SESSION_DAYS,
  sessionAccount,
  touchCredential,
} from './accounts.ts';
import type { ArsPriceClient, ChainClient, PriceClient } from './chain.ts';
import type { Sql } from './db.ts';
import { isAdmin } from './admins.ts';
import { balance, canGive, chargingActive, features, hasPlanFeatures } from './credits.ts';
import { ApiError } from './errors.ts';
import { confirmMail, loginMail, type Mailer } from './mail.ts';
import { RateLimiter } from './ratelimit.ts';
import { giftState } from './state.ts';
import { verifyAssertion, verifyRegistration, WebAuthnError } from './webauthn.ts';

// Cuentas de quien regala: registro e ingreso con passkey, link por mail y panel.
// Sesión en la cookie "__session" (Firebase Hosting solo deja pasar esa) con HttpOnly,
// Secure y SameSite=Strict; además, los POST tienen que venir de un origen permitido.

export interface AccountConfig {
  /** Orígenes desde los que se aceptan passkeys y pedidos (https://regalalebitcoins.web.app, …). */
  readonly origins: readonly string[];
  /** Base de los links que van por mail. */
  readonly publicUrl: string;
  readonly mailer: Mailer;
  readonly cookieSecure: boolean;
}

export const SESSION_COOKIE = '__session';
const VAULT = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{20,400}$/;
const LINK_MINUTES = 20;
const CONFIRM_MINUTES = 24 * 60;
/** Nombres de error de WebAuthn que se aceptan en el diagnóstico (nada libre llega al log). */
const WEBAUTHN_ERRORS = new Set(['NotAllowedError', 'AbortError', 'InvalidStateError', 'NotSupportedError', 'SecurityError', 'ConstraintError', 'UnknownError', 'TypeError', 'Error']);

export async function currentAccount(sql: Sql, c: Context): Promise<Account | null> {
  return sessionAccount(sql, getCookie(c, SESSION_COOKIE));
}

export function registerAccountRoutes(
  app: Hono,
  deps: { sql: Sql; chain: ChainClient; config: AccountConfig; clientIp: (c: Context) => string; price?: PriceClient; arsPrice?: ArsPriceClient | undefined; adminEmails?: readonly string[] },
): void {
  const { sql, chain, config } = deps;
  const challengeLimiter = new RateLimiter(60, 60 * 60 * 1000);
  const mailLimiter = new RateLimiter(5, 60 * 60 * 1000);
  // Cuentas con solo el mail: pocas por IP, para que no se junten regalos de bienvenida de a cientos.
  const mailAccountLimiter = new RateLimiter(5, 60 * 60 * 1000);

  const startSession = async (c: Context, account: Account, method: 'passkey' | 'link', credentialId: string | null = null) => {
    const token = await createSession(sql, account.id, method, credentialId);
    setCookie(c, SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'Strict',
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
  };

  // Defensa extra contra pedidos desde otros sitios (además de SameSite=Strict).
  app.use('/api/cuenta/*', async (c, next) => {
    if (c.req.method === 'POST') {
      const origin = c.req.header('origin');
      if (origin !== undefined && !config.origins.includes(origin)) throw new ApiError(403, 'no_autorizado');
    }
    await next();
  });

  const body = async (c: Context): Promise<Record<string, unknown>> => {
    const b = (await c.req.json().catch(() => null)) as unknown;
    if (b === null || typeof b !== 'object') throw new ApiError(400, 'pedido_invalido');
    return b as Record<string, unknown>;
  };

  app.post('/api/cuenta/desafio', async (c) => {
    const ip = deps.clientIp(c);
    if (!challengeLimiter.allowed(ip)) throw new ApiError(429, 'demasiados_pedidos');
    challengeLimiter.record(ip);
    const { tipo, email } = await body(c);
    if (tipo !== 'registro' && tipo !== 'ingreso') throw new ApiError(400, 'pedido_invalido');
    // Antes de crear una passkey nueva se revisa el mail: si ya tiene cuenta, el navegador no
    // llega a crear la passkey (quedaría huérfana en el llavero y se ofrecería al entrar).
    if (tipo === 'registro' && email !== undefined) {
      const normalized = normalizeEmail(email);
      if (normalized === null) throw new ApiError(400, 'pedido_invalido');
      if ((await findAccountByEmail(sql, normalized)) !== null) throw new ApiError(409, 'cuenta_existente', 'Mail con cuenta (antes de crear la passkey).');
    }
    return c.json({ desafio: await createChallenge(sql, tipo) });
  });

  app.post('/api/cuenta/registro', async (c) => {
    const b = await body(c);
    const email = normalizeEmail(b.email);
    if (email === null) throw new ApiError(400, 'pedido_invalido');
    const lang = typeof b.idioma === 'string' && isLang(b.idioma) ? b.idioma : 'es';
    const vault = b.boveda ?? null;
    if (vault !== null && (typeof vault !== 'string' || !VAULT.test(vault))) throw new ApiError(400, 'pedido_invalido');
    if ((await findAccountByEmail(sql, email)) !== null) throw new ApiError(409, 'cuenta_existente');
    let reg;
    try {
      reg = verifyRegistration((b.credencial ?? {}) as Parameters<typeof verifyRegistration>[0], config.origins);
    } catch (e) {
      if (e instanceof WebAuthnError) throw new ApiError(422, 'passkey_invalida', e.message);
      throw e;
    }
    if (!(await consumeChallenge(sql, reg.challenge, 'registro'))) throw new ApiError(422, 'passkey_invalida', 'Desafío vencido o usado.');
    const account = await createAccount(sql, {
      email,
      lang,
      credential: { id: reg.credentialId, publicKey: reg.publicKey, alg: reg.alg, signCount: reg.signCount, vault: vault as string | null },
    }).catch((e: { code?: string }) => {
      if (e.code === '23505') throw new ApiError(409, 'cuenta_existente');
      throw e;
    });
    await startSession(c, account, 'passkey', reg.credentialId);
    // Con passkey se puede regalar enseguida; el mail se confirma después, con este link.
    await sendConfirm(account).catch((e: Error) => console.error(`Mail de confirmación sin mandar: ${e.message}`));
    return c.json({ email: account.email }, 201);
  });

  /** Manda el link para confirmar el mail (y entrar); vale 24 horas. */
  const sendConfirm = async (account: Account) => {
    const token = await createMailLink(sql, account.id, CONFIRM_MINUTES);
    await config.mailer.send(confirmMail(account.email, account.lang, `${config.publicUrl}/panel#acceso=${token}`));
  };

  /**
   * Cuenta con solo el mail, para quien regala con el código de 12 palabras (sin passkey). Sin
   * passkey el mail se confirma antes de regalar (Rodolfo, 20/10): no abre sesión, manda el link y
   * la sesión se abre al canjearlo. Responde igual exista o no la cuenta (si existe, el link sirve
   * para entrar).
   */
  app.post('/api/cuenta/registro-mail', async (c) => {
    const b = await body(c);
    const email = normalizeEmail(b.email);
    if (email === null) throw new ApiError(400, 'pedido_invalido');
    const lang = typeof b.idioma === 'string' && isLang(b.idioma) ? b.idioma : 'es';
    const ip = deps.clientIp(c);
    if (!mailLimiter.allowed(ip) || !mailLimiter.allowed(email)) throw new ApiError(429, 'demasiados_pedidos');
    mailLimiter.record(ip);
    mailLimiter.record(email);
    let account = await findAccountByEmail(sql, email);
    if (account === null) {
      if (!mailAccountLimiter.allowed(ip)) throw new ApiError(429, 'demasiados_pedidos');
      mailAccountLimiter.record(ip);
      account = await createAccount(sql, { email, lang, credential: null }).catch(async (e: { code?: string }) => {
        if (e.code === '23505') return (await findAccountByEmail(sql, email)) as Account;
        throw e;
      });
    }
    await sendConfirm(account);
    return c.json({ ok: true }, 202);
  });

  app.post('/api/cuenta/ingreso', async (c) => {
    const b = await body(c);
    const input = (b.credencial ?? {}) as Parameters<typeof verifyAssertion>[0];
    const id = typeof input.id === 'string' ? input.id : '';
    const credential = await findCredential(sql, id);
    if (credential === null) throw new ApiError(401, 'passkey_desconocida', 'Passkey desconocida.');
    let result;
    try {
      result = verifyAssertion(input, credential, config.origins);
    } catch (e) {
      if (e instanceof WebAuthnError) throw new ApiError(401, 'passkey_invalida', e.message);
      throw e;
    }
    if (!(await consumeChallenge(sql, result.challenge, 'ingreso'))) throw new ApiError(401, 'passkey_invalida', 'Desafío vencido o usado.');
    await touchCredential(sql, credential.id, result.signCount);
    const [row] = await sql<{ email: string; idioma: string }[]>`select email, idioma from usuarios where id = ${credential.accountId}`;
    if (row === undefined) throw new ApiError(401, 'passkey_invalida');
    await startSession(c, { id: credential.accountId, email: row.email, lang: isLang(row.idioma) ? row.idioma : 'es' }, 'passkey', credential.id);
    const extra = await sql<{ boveda: string }[]>`select boveda from bovedas_extra where credencial_id = ${credential.id} order by creada desc`;
    return c.json({ email: row.email, credencial: credential.id, boveda: credential.vault, bovedasExtra: extra.map((r) => r.boveda) });
  });

  // ── Vincular la compu con el celu (docs en la migración 024) ──
  const VINCULO_MINUTOS = 10;
  const sessionWithPasskey = async (c: Context) => {
    const account = await currentAccount(sql, c);
    if (account === null) throw new ApiError(401, 'sesion_requerida');
    if (account.viaPasskey !== true || account.credentialId === null || account.credentialId === undefined) throw new ApiError(403, 'passkey_requerida');
    c.header('cache-control', 'no-store');
    return account as Account & { credentialId: string };
  };
  const vinculoId = (c: Context) => {
    const id = c.req.param('id') ?? '';
    if (!/^[A-Za-z0-9_-]{22}$/.test(id)) throw new ApiError(404, 'vinculo_invalido');
    return id;
  };

  /** La compu (entró por QR y la bóveda no abrió) pide un vínculo. */
  app.post('/api/cuenta/vinculos', async (c) => {
    const account = await sessionWithPasskey(c);
    await sql`delete from vinculos where creado < now() - make_interval(mins => ${VINCULO_MINUTOS})`;
    // Un QR a la vez por passkey: el nuevo reemplaza a los que esperaban.
    await sql`delete from vinculos where credencial_id = ${account.credentialId} and paquete is null`;
    const [{ n } = { n: '0' }] = await sql<{ n: string }[]>`select count(*) as n from vinculos where usuario_id = ${account.id}`;
    if (Number(n) >= 5) throw new ApiError(429, 'demasiados_pedidos');
    const id = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
    await sql`insert into vinculos (id, usuario_id, credencial_id) values (${id}, ${account.id}, ${account.credentialId})`;
    return c.json({ id, minutos: VINCULO_MINUTOS }, 201);
  });

  /** El celu (misma cuenta, abrió la bóveda con su passkey) sube la clave maestra cifrada para la compu. */
  app.post('/api/cuenta/vinculos/:id', async (c) => {
    const account = await sessionWithPasskey(c);
    const id = vinculoId(c);
    const { paquete } = await body(c);
    if (typeof paquete !== 'string' || !/^v1(\.[A-Za-z0-9_-]{16,700}){3}$/.test(paquete)) throw new ApiError(400, 'pedido_invalido');
    const rows = await sql`
      update vinculos set paquete = ${paquete}
      where id = ${id} and usuario_id = ${account.id} and paquete is null and creado > now() - make_interval(mins => ${VINCULO_MINUTOS})
      returning id`;
    if (rows.length === 0) throw new ApiError(404, 'vinculo_invalido');
    return c.json({ ok: true });
  });

  /** La compu espera el paquete; al entregarlo, el vínculo se borra. */
  app.get('/api/cuenta/vinculos/:id', async (c) => {
    const account = await sessionWithPasskey(c);
    const id = vinculoId(c);
    const [v] = await sql<{ paquete: string | null; vencido: boolean }[]>`
      select paquete, creado <= now() - make_interval(mins => ${VINCULO_MINUTOS}) as vencido
      from vinculos where id = ${id} and usuario_id = ${account.id} and credencial_id = ${account.credentialId}`;
    if (v === undefined || (v.vencido && v.paquete === null)) throw new ApiError(404, 'vinculo_invalido');
    if (v.paquete === null) return c.json({ paquete: null });
    await sql`delete from vinculos where id = ${id}`;
    return c.json({ paquete: v.paquete });
  });

  /**
   * Otra copia de la bóveda para la passkey de esta sesión: la armó el navegador con las 12
   * palabras y la salida PRF que dio la passkey desde este dispositivo (por QR puede ser otra).
   * Solo cajas cifradas; hasta 3 por passkey (se queda con las últimas).
   */
  app.post('/api/cuenta/boveda-extra', async (c) => {
    const account = await currentAccount(sql, c);
    if (account === null) throw new ApiError(401, 'sesion_requerida');
    if (account.viaPasskey !== true || account.credentialId === null || account.credentialId === undefined) throw new ApiError(403, 'passkey_requerida');
    const { boveda } = await body(c);
    if (typeof boveda !== 'string' || !/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{40,300}$/.test(boveda)) throw new ApiError(400, 'pedido_invalido');
    const [cred] = await sql<{ boveda: string | null }[]>`select boveda from credenciales where id = ${account.credentialId} and usuario_id = ${account.id}`;
    // Solo passkeys con bóveda (con PRF): sin ella no hay nada que copiar.
    if (cred === undefined || cred.boveda === null) throw new ApiError(409, 'sin_boveda');
    await sql.begin(async (tx) => {
      await tx`insert into bovedas_extra (credencial_id, boveda) values (${account.credentialId as string}, ${boveda}) on conflict do nothing`;
      await tx`delete from bovedas_extra where credencial_id = ${account.credentialId as string}
        and boveda not in (select boveda from bovedas_extra where credencial_id = ${account.credentialId as string} order by creada desc limit 3)`;
    });
    return c.json({ ok: true }, 201);
  });

  /**
   * El navegador cuenta por qué falló la passkey (solo el nombre del error de WebAuthn y el
   * paso), para distinguir en los logs "canceló" de "este teléfono no tiene la passkey".
   */
  app.post('/api/cuenta/diagnostico', async (c) => {
    const ip = deps.clientIp(c);
    if (!challengeLimiter.allowed(ip)) throw new ApiError(429, 'demasiados_pedidos');
    challengeLimiter.record(ip);
    const { paso, error } = await body(c);
    if ((paso !== 'registro' && paso !== 'ingreso') || typeof error !== 'string' || !WEBAUTHN_ERRORS.has(error)) throw new ApiError(400, 'pedido_invalido');
    console.warn(`cuenta: passkey falló en el navegador (${paso}): ${error}`);
    return c.body(null, 204);
  });

  app.post('/api/cuenta/salir', async (c) => {
    await deleteSession(sql, getCookie(c, SESSION_COOKIE));
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: config.cookieSecure });
    return c.json({ ok: true });
  });

  /** Link de acceso por mail. Siempre responde igual, exista o no la cuenta. */
  app.post('/api/cuenta/link', async (c) => {
    const b = await body(c);
    const email = normalizeEmail(b.email);
    if (email === null) throw new ApiError(400, 'pedido_invalido');
    const ip = deps.clientIp(c);
    if (!mailLimiter.allowed(ip) || !mailLimiter.allowed(email)) throw new ApiError(429, 'demasiados_pedidos');
    mailLimiter.record(ip);
    mailLimiter.record(email);
    const account = await findAccountByEmail(sql, email);
    if (account !== null) {
      const token = await createMailLink(sql, account.id, LINK_MINUTES);
      await config.mailer.send(loginMail(account.email, account.lang, `${config.publicUrl}/panel#acceso=${token}`));
    }
    return c.json({ ok: true }, 202);
  });

  app.post('/api/cuenta/link/canje', async (c) => {
    const { token } = await body(c);
    const account = typeof token === 'string' ? await redeemMailLink(sql, token) : null;
    if (account === null) throw new ApiError(401, 'link_invalido');
    await startSession(c, account, 'link');
    return c.json({ email: account.email });
  });

  /** ¿Hay una sesión iniciada? Para el menú: responde siempre 200, sin datos de la cuenta. */
  app.get('/api/cuenta/sesion', async (c) => c.json({ abierta: (await currentAccount(sql, c)) !== null }));

  const featureFlags = async (id: string, b: Awaited<ReturnType<typeof balance>>, charging: boolean, admin: boolean) => {
    const f = await features(sql, id, b, charging, admin);
    return { conIa: f.ia, conTarjeta: f.tarjeta, conSaludo: f.saludo };
  };

  /** «Mi plan»: saldo por tipo, plan vigente y si puede crear un regalo más. */
  app.get('/api/cuenta/creditos', async (c) => {
    const account = await currentAccount(sql, c);
    if (account === null) throw new ApiError(401, 'sesion_requerida');
    const [b, charging, admin] = await Promise.all([balance(sql, account.id), chargingActive(sql), isAdmin(sql, deps.adminEmails ?? [], account.email)]);
    const moves = await sql<{ tipo: string; unidad: string; cantidad: number; origen: string; creado: Date }[]>`
      select tipo, unidad, cantidad, origen, creado from movimientos where usuario_id = ${account.id} order by id desc limit 100`;
    return c.json({
      cobroActivo: charging,
      // Los admins tienen todo activado y libre, para probar (Claudia, 22/10).
      admin,
      puedeRegalar: canGive(b, charging, undefined, admin),
      conPlan: hasPlanFeatures(b, charging, admin),
      // Cada servicio por separado: lo gratis puede incluir algunos (Claudia, 23/10).
      ...(await featureFlags(account.id, b, charging, admin)),
      regalos: { bienvenida: b.welcome, pagos: b.paid, porOcasion: b.giftsByOccasion },
      listas: { cumple: b.birthdayLists, otras: b.otherLists, porOcasion: b.listsByOccasion },
      plan: b.plan === null ? null : { tipo: b.plan.type, hasta: b.plan.until?.toISOString() ?? null, regalosQuedan: b.plan.giftsLeft, listas: b.plan.lists },
      movimientos: moves.map((m) => ({ tipo: m.tipo, unidad: m.unidad, cantidad: m.cantidad, origen: m.origen, fecha: m.creado.toISOString() })),
    });
  });

  /** El panel: cuenta, passkeys y regalos con su estado (calculado desde la cadena). */
  app.get('/api/cuenta', async (c) => {
    const account = await currentAccount(sql, c);
    if (account === null) throw new ApiError(401, 'sesion_requerida');
    // La cotización de hoy, para mostrar cuánto vale cada regalo (si no responde, no se muestra).
    const [credentials, gifts, next, usdNow, arsNow] = await Promise.all([
      accountCredentials(sql, account.id),
      accountGifts(sql, account.id),
      nextGiftIndex(sql, account.id),
      deps.price?.btcUsd().catch(() => null) ?? null,
      deps.arsPrice?.btcArs().then((q) => q.price).catch(() => null) ?? null,
    ]);
    const states = await Promise.all(
      gifts.map(async (g) => {
        try {
          const stats = await chain.addressStats(g.address);
          return giftState({ claimTxid: g.claimTxid, claimKind: g.claimKind } as Parameters<typeof giftState>[0], stats, false);
        } catch {
          return null;
        }
      }),
    );
    return c.json({
      email: account.email,
      idioma: account.lang,
      credenciales: credentials,
      proximoIndice: next,
      cotizacion: { usdPorBtc: usdNow, arsPorBtc: arsNow },
      regalos: gifts.map((g, i) => ({
        id: g.id,
        indice: g.index,
        idioma: g.lang,
        ocasion: g.occasion,
        ocasionLibre: g.occasionFree,
        para: g.to,
        // Para comprobar en el navegador que unas 12 palabras son las de esta cuenta.
        direccion: g.address,
        satsEsperados: g.satsExpected,
        creado: g.createdAt.toISOString(),
        estilo: g.style,
        abierto: g.claimedAt?.toISOString() ?? null,
        original: g.currency === null || g.amount === null ? null : { moneda: g.currency, monto: g.amount, usdPorBtc: g.usdPerBtc },
        estado: states[i]?.state ?? null,
        sats: states[i] === null || states[i] === undefined ? null : (states[i].confirmedSats + states[i].unconfirmedSats).toString(),
      })),
    });
  });
}
