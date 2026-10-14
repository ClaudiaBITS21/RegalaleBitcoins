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
import type { ChainClient } from './chain.ts';
import type { Sql } from './db.ts';
import { ApiError } from './errors.ts';
import { loginMail, type Mailer } from './mail.ts';
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

export async function currentAccount(sql: Sql, c: Context): Promise<Account | null> {
  return sessionAccount(sql, getCookie(c, SESSION_COOKIE));
}

export function registerAccountRoutes(app: Hono, deps: { sql: Sql; chain: ChainClient; config: AccountConfig; clientIp: (c: Context) => string }): void {
  const { sql, chain, config } = deps;
  const challengeLimiter = new RateLimiter(60, 60 * 60 * 1000);
  const mailLimiter = new RateLimiter(5, 60 * 60 * 1000);

  const startSession = async (c: Context, account: Account) => {
    const token = await createSession(sql, account.id);
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
    const { tipo } = await body(c);
    if (tipo !== 'registro' && tipo !== 'ingreso') throw new ApiError(400, 'pedido_invalido');
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
    await startSession(c, account);
    return c.json({ email: account.email }, 201);
  });

  app.post('/api/cuenta/ingreso', async (c) => {
    const b = await body(c);
    const input = (b.credencial ?? {}) as Parameters<typeof verifyAssertion>[0];
    const id = typeof input.id === 'string' ? input.id : '';
    const credential = await findCredential(sql, id);
    if (credential === null) throw new ApiError(401, 'passkey_invalida', 'Passkey desconocida.');
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
    await startSession(c, { id: credential.accountId, email: row.email, lang: isLang(row.idioma) ? row.idioma : 'es' });
    return c.json({ email: row.email, credencial: credential.id, boveda: credential.vault });
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
    await startSession(c, account);
    return c.json({ email: account.email });
  });

  /** El panel: cuenta, passkeys y regalos con su estado (calculado desde la cadena). */
  app.get('/api/cuenta', async (c) => {
    const account = await currentAccount(sql, c);
    if (account === null) throw new ApiError(401, 'sesion_requerida');
    const [credentials, gifts, next] = await Promise.all([accountCredentials(sql, account.id), accountGifts(sql, account.id), nextGiftIndex(sql, account.id)]);
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
      regalos: gifts.map((g, i) => ({
        id: g.id,
        indice: g.index,
        idioma: g.lang,
        ocasion: g.occasion,
        ocasionLibre: g.occasionFree,
        para: g.to,
        satsEsperados: g.satsExpected,
        creado: g.createdAt.toISOString(),
        estado: states[i]?.state ?? null,
        sats: states[i] === null || states[i] === undefined ? null : (states[i].confirmedSats + states[i].unconfirmedSats).toString(),
      })),
    });
  });
}
