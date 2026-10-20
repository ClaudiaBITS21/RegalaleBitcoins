import { deriveListAddress, isCoreError, type Network, parsePaymentKey } from '@regalale/core';
import type { Context, Hono } from 'hono';
import { currentAccount } from './accountRoutes.ts';
import type { Account } from './accounts.ts';
import { chargingActive, setChargingActive } from './credits.ts';
import type { Sql } from './db.ts';
import { ApiError } from './errors.ts';
import type { Mail, Mailer } from './mail.ts';
import { foundersLeft, keyFingerprint, paymentKey, pendingPaymentKey, setPaymentKey } from './payments.ts';

// Admin del cobro (handoff 2026-10-19, «cobro y créditos»): llave de cobro, activar el cobro,
// precios, ajustes manuales de créditos y pagos. La llave nunca vuelve al navegador ni va a los
// logs: se muestra y se registra su huella. Cambiar la llave o el cobro exige una sesión abierta con
// passkey, avisa por mail a los admins y queda en registro_admin.

export interface AdminCobroDeps {
  readonly sql: Sql;
  readonly network: Network;
  readonly adminEmails: readonly string[];
  readonly mailer: Mailer;
}

const UNITS = ['regalo', 'lista_cumple', 'lista_otras'] as const;

export function registerAdminCobroRoutes(app: Hono, deps: AdminCobroDeps): void {
  const { sql, network, adminEmails, mailer } = deps;

  const admin = async (c: Context, passkey = false): Promise<Account> => {
    const account = await currentAccount(sql, c);
    if (account === null) throw new ApiError(401, 'sesion_requerida');
    if (!adminEmails.includes(account.email.toLowerCase())) throw new ApiError(404, 'no_encontrado');
    if (passkey && account.viaPasskey !== true) throw new ApiError(403, 'passkey_requerida');
    c.header('cache-control', 'no-store');
    return account;
  };
  const log = (account: Account, accion: string, detalle: string) =>
    sql`insert into registro_admin (email, accion, detalle) values (${account.email}, ${accion}, ${detalle.slice(0, 500)})`;
  const notify = async (subject: string, text: string) => {
    for (const to of adminEmails) {
      const mail: Mail = { to, subject, text };
      await mailer.send(mail).catch((e: Error) => console.error(`Aviso al admin sin mandar: ${e.message}`));
    }
  };
  const body = async (c: Context) => ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const keyInput = (input: unknown): string => {
    if (typeof input !== 'string' || input.length > 300) throw new ApiError(400, 'pedido_invalido');
    return input;
  };
  const invalidKey = (c: Context, e: unknown) => {
    if (!isCoreError(e)) throw e;
    return c.json({ error: 'llave_invalida', problema: (e.details as { problem?: string } | undefined)?.problem ?? 'formato' }, 422);
  };

  app.get('/api/admin/cobro', async (c) => {
    await admin(c);
    // Primero la llave vigente: si un cambio ya cumplió las 24 h, lo pasa a vigente antes de leer el pendiente.
    const key = await paymentKey(sql, network);
    const [charging, pending, founders] = await Promise.all([chargingActive(sql), pendingPaymentKey(sql, network), foundersLeft(sql)]);
    const productos = await sql<{ codigo: string; precio_sats: string; activo: boolean; regalos: number; listas_otras: number; plan: string | null; regalos_libres: boolean; dias: number | null; cupo: number | null }[]>`
      select codigo, precio_sats, activo, regalos, listas_otras, plan, regalos_libres, dias, cupo from productos order by precio_sats, codigo`;
    const pagos = await sql<{ id: string; producto: string; estado: string; sats: string; sats_recibidos: string; precio_cents: number; creado: Date; confirmado: Date | null }[]>`
      select id, producto, estado, sats, sats_recibidos, precio_cents, creado, confirmado from pagos order by creado desc limit 50`;
    const [totales] = await sql<{ confirmados: string; usd: string | null; sats: string | null }[]>`
      select count(*) as confirmados, sum(precio_cents) / 100.0 as usd, sum(sats_recibidos) as sats from pagos where estado = 'confirmado'`;
    const registro = await sql<{ email: string; accion: string; detalle: string; creado: Date }[]>`
      select email, accion, detalle, creado from registro_admin order by id desc limit 30`;
    return c.json({
      cobroActivo: charging,
      llave: key === null ? null : { huella: keyFingerprint(key), direcciones: [0, 1, 2].map((i) => deriveListAddress(key, i).address) },
      llaveNueva: pending === null ? null : { huella: keyFingerprint(pending.key), vigenteDesde: pending.from.toISOString() },
      fundadoresQuedan: founders,
      productos: productos.map((p) => ({
        codigo: p.codigo,
        precioSats: p.precio_sats,
        activo: p.activo,
        plan: p.plan,
        regalos: p.regalos_libres ? null : p.regalos,
        listas: p.listas_otras,
        dias: p.dias,
        cupo: p.cupo,
      })),
      pagos: pagos.map((p) => ({
        id: p.id,
        producto: p.producto,
        estado: p.estado,
        precioUsd: p.precio_cents / 100,
        sats: p.sats,
        satsRecibidos: p.sats_recibidos,
        creado: p.creado.toISOString(),
        confirmado: p.confirmado?.toISOString() ?? null,
      })),
      totales: { confirmados: Number(totales?.confirmados ?? 0), usd: Number(totales?.usd ?? 0), sats: totales?.sats ?? '0' },
      registro: registro.map((r) => ({ email: r.email, accion: r.accion, detalle: r.detalle, fecha: r.creado.toISOString() })),
    });
  });

  /** Vista previa: las 3 primeras direcciones de la llave, para compararlas con la billetera. No guarda nada. */
  app.post('/api/admin/llave/vista', async (c) => {
    await admin(c);
    const input = keyInput((await body(c)).llave);
    try {
      const key = parsePaymentKey(input, network);
      return c.json({ huella: keyFingerprint(key), direcciones: [0, 1, 2].map((i) => deriveListAddress(key, i).address) });
    } catch (e) {
      return invalidKey(c, e);
    }
  });

  /** Cargar (o cambiar) la llave de cobro: exige passkey; un cambio entra en vigor a las 24 h. */
  app.post('/api/admin/llave', async (c) => {
    const account = await admin(c, true);
    const input = keyInput((await body(c)).llave);
    let result;
    try {
      result = await setPaymentKey(sql, network, input);
    } catch (e) {
      return invalidKey(c, e);
    }
    const huella = keyFingerprint(result.key);
    await log(account, result.pending ? 'llave_cambio_pedido' : 'llave_cargada', `huella ${huella}`);
    await notify(
      result.pending ? 'Regalale Bitcoin: pidieron cambiar la llave de cobro' : 'Regalale Bitcoin: se cargó la llave de cobro',
      result.pending
        ? `${account.email} cargó una llave de cobro nueva (huella ${huella}). Entra en vigor en 24 horas. Si no fuiste vos, entrá a /admin y volvé a cargar la llave anterior.`
        : `${account.email} cargó la llave de cobro (huella ${huella}). Desde ahora los pagos van a direcciones de esa llave.`,
    );
    return c.json({ huella, pendiente: result.pending });
  });

  /** Activar o apagar el cobro: exige passkey y la llave cargada. */
  app.post('/api/admin/cobro', async (c) => {
    const account = await admin(c, true);
    const { activo } = await body(c);
    if (typeof activo !== 'boolean') throw new ApiError(400, 'pedido_invalido');
    if (activo && (await paymentKey(sql, network)) === null) throw new ApiError(409, 'cobro_no_configurado');
    await setChargingActive(sql, activo);
    await log(account, activo ? 'cobro_activado' : 'cobro_apagado', '');
    await notify(`Regalale Bitcoin: cobro ${activo ? 'activado' : 'apagado'}`, `${account.email} ${activo ? 'activó' : 'apagó'} el cobro.`);
    return c.json({ cobroActivo: activo });
  });

  /** Precio de un producto, en sats (los precios están en sats desde el 20/10). */
  app.post('/api/admin/precio', async (c) => {
    const account = await admin(c, true);
    const { producto, precioSats } = await body(c);
    if (typeof producto !== 'string' || typeof precioSats !== 'number' || !Number.isInteger(precioSats) || precioSats <= 0 || precioSats > 100_000_000) {
      throw new ApiError(400, 'pedido_invalido');
    }
    const [antes] = await sql<{ precio_sats: string }[]>`select precio_sats from productos where codigo = ${producto} and codigo <> 'bienvenida'`;
    if (antes === undefined) throw new ApiError(404, 'no_encontrado');
    await sql`update productos set precio_sats = ${precioSats} where codigo = ${producto}`;
    await log(account, 'precio', `${producto}: ${antes.precio_sats} → ${precioSats} sats`);
    return c.json({ producto, precioSats: String(precioSats) });
  });

  /**
   * Qué incluye un producto (los valores y límites pueden cambiar, Rodolfo 20/10): regalos (null =
   * libres, solo en planes), listas, días de vigencia (null = para siempre, solo en planes) y cupo
   * (null = sin límite). Un plan ya comprado conserva lo que incluía.
   */
  app.post('/api/admin/producto', async (c) => {
    const account = await admin(c, true);
    const { producto, regalos, listas, dias, cupo } = await body(c);
    const count = (v: unknown, max: number, nullable: boolean) => (v === null && nullable) || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max);
    if (typeof producto !== 'string' || !count(regalos, 10_000, true) || !count(listas, 1000, false) || !count(dias, 36_500, true) || dias === 0 || !count(cupo, 1_000_000, true)) {
      throw new ApiError(400, 'pedido_invalido');
    }
    const [antes] = await sql<{ plan: string | null; regalos: number; regalos_libres: boolean; listas_otras: number; dias: number | null; cupo: number | null }[]>`
      select plan, regalos, regalos_libres, listas_otras, dias, cupo from productos where codigo = ${producto} and codigo <> 'bienvenida'`;
    if (antes === undefined) throw new ApiError(404, 'no_encontrado');
    // Regalos libres y vigencia solo tienen sentido en un plan: los créditos sueltos no vencen.
    if (antes.plan === null && (regalos === null || dias !== null)) throw new ApiError(400, 'pedido_invalido');
    const libres = regalos === null;
    await sql`
      update productos set regalos = ${libres ? 0 : (regalos as number)}, regalos_libres = ${libres}, listas_otras = ${listas as number},
        dias = ${dias as number | null}, cupo = ${cupo as number | null}
      where codigo = ${producto}`;
    const fmt = (r: number | null, l: number, d: number | null, k: number | null) =>
      `regalos ${r ?? 'libres'}, listas ${l}, días ${d ?? 'siempre'}, cupo ${k ?? 'sin límite'}`;
    await log(account, 'producto', `${producto}: ${fmt(antes.regalos_libres ? null : antes.regalos, antes.listas_otras, antes.dias, antes.cupo)} → ${fmt(regalos as number | null, listas as number, dias as number | null, cupo as number | null)}`);
    return c.json({ ok: true });
  });

  /** Otorgar o quitar créditos a una cuenta, con motivo. */
  app.post('/api/admin/ajuste', async (c) => {
    const account = await admin(c, true);
    const { email, unidad, cantidad, motivo } = await body(c);
    if (
      typeof email !== 'string' ||
      typeof unidad !== 'string' ||
      !(UNITS as readonly string[]).includes(unidad) ||
      typeof cantidad !== 'number' ||
      !Number.isInteger(cantidad) ||
      cantidad === 0 ||
      Math.abs(cantidad) > 1000 ||
      typeof motivo !== 'string' ||
      motivo.trim().length < 3 ||
      motivo.length > 300
    ) {
      throw new ApiError(400, 'pedido_invalido');
    }
    const [u] = await sql<{ id: string }[]>`select id from usuarios where email = ${email.trim().toLowerCase()}`;
    if (u === undefined) throw new ApiError(404, 'no_encontrado');
    await sql`
      insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, motivo)
      values (${u.id}, 'ajuste', ${unidad}, ${cantidad}, 'admin', ${motivo.trim()})`;
    await log(account, 'ajuste', `${email.trim().toLowerCase()}, ${unidad} ${cantidad > 0 ? '+' : ''}${cantidad}: ${motivo.trim()}`);
    return c.json({ ok: true });
  });
}
