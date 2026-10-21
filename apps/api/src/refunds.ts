import { isCoreError, type Network, parseDestination } from '@regalale/core';
import type { Context, Hono } from 'hono';
import { currentAccount } from './accountRoutes.ts';
import { adminEmails as allAdmins, isAdmin } from './admins.ts';
import type { Account } from './accounts.ts';
import type { Sql } from './db.ts';
import { ApiError } from './errors.ts';
import type { Mailer } from './mail.ts';

// Botón de arrepentimiento (handoff 2026-10-19, «cobro y créditos»). Procede dentro de los 10 días
// de la compra si no usó ningún crédito del pack y, en listas, si no recibió aportes (hoy las listas
// todavía no consumen créditos: alcanza con que no los haya usado). Se le da un código de trámite.
// La devolución (los mismos sats pagados, no su valor en dólares) la manda la responsable a mano;
// el admin marca el pago como devuelto y quita lo que había otorgado con un ajuste.

export const REFUND_DAYS = 10;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => `ARR-${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')}`;

interface Purchase {
  id: string;
  producto: string;
  precio_cents: number;
  sats_recibidos: string;
  confirmado: Date;
  regalos: number;
  listas_cumple: number;
  listas_otras: number;
  plan: string | null;
  codigo: string | null;
  arr_estado: string | null;
}

type Reason = 'vencido' | 'usado' | null;

/** Por qué no procede (o null si procede): pasaron los 10 días, o ya usó créditos de la compra. */
async function refundBlocker(sql: Sql, accountId: string, p: Purchase): Promise<Reason> {
  if (Date.now() - p.confirmado.getTime() > REFUND_DAYS * 86_400_000) return 'vencido';
  if (p.plan !== null) {
    // Un plan está usado si cubrió algún regalo desde la compra.
    const [u] = await sql<{ n: string }[]>`
      select count(*) as n from movimientos where usuario_id = ${accountId} and tipo = 'consumo' and origen = 'plan' and creado >= ${p.confirmado}`;
    return Number(u?.n ?? 0) > 0 ? 'usado' : null;
  }
  // Créditos pagos: el saldo de cada unidad tiene que cubrir lo que otorgó esta compra.
  const rows = await sql<{ unidad: string; total: string }[]>`
    select unidad, coalesce(sum(cantidad), 0) as total from movimientos
    where usuario_id = ${accountId} and origen <> 'bienvenida' and ocasion is null group by unidad`;
  const left = (u: string) => Number(rows.find((r) => r.unidad === u)?.total ?? 0);
  if (left('regalo') < p.regalos || left('lista_cumple') < p.listas_cumple || left('lista_otras') < p.listas_otras) return 'usado';
  return null;
}

async function ownPurchases(sql: Sql, accountId: string): Promise<Purchase[]> {
  return sql<Purchase[]>`
    select p.id, p.producto, p.precio_cents, p.sats_recibidos, p.confirmado, pr.regalos, pr.listas_cumple, pr.listas_otras, pr.plan,
           a.codigo, a.estado as arr_estado
    from pagos p join productos pr on pr.codigo = p.producto left join arrepentimientos a on a.pago_id = p.id
    where p.usuario_id = ${accountId} and p.estado in ('confirmado', 'devuelto')
    order by p.confirmado desc`;
}

/** Nombres de Precios para los mails a los admins (los mismos de la web; código interno al lado). */
const PRODUCT_NAMES: Readonly<Record<string, string>> = {
  pack10: 'Satoshi (pack10)',
  pack10_lista: 'Node (pack10_lista)',
  lista_cumple: 'Lista de cumpleaños (lista_cumple)',
  anual: 'Hodler (anual)',
  fundador: 'Genesis (fundador)',
};

export function registerRefundRoutes(app: Hono, deps: { sql: Sql; network: Network; adminEmails: readonly string[]; mailer: Mailer }): void {
  const { sql, network, adminEmails, mailer } = deps;
  const signedIn = async (c: Context): Promise<Account> => {
    const account = await currentAccount(sql, c);
    if (account === null) throw new ApiError(401, 'sesion_requerida');
    return account;
  };

  /** Compras propias, con si se puede pedir el arrepentimiento. */
  app.get('/api/cuenta/compras', async (c) => {
    const account = await signedIn(c);
    const list = await ownPurchases(sql, account.id);
    const out = [];
    for (const p of list) {
      out.push({
        id: p.id,
        producto: p.producto,
        precioUsd: p.precio_cents / 100,
        sats: p.sats_recibidos,
        fecha: p.confirmado.toISOString(),
        arrepentimiento: p.codigo === null ? null : { codigo: p.codigo, estado: p.arr_estado },
        noProcede: p.codigo === null ? await refundBlocker(sql, account.id, p) : null,
      });
    }
    return c.json({ compras: out, dias: REFUND_DAYS });
  });

  /** Pedir el arrepentimiento de una compra: devuelve el código de trámite. */
  app.post('/api/cuenta/arrepentimiento', async (c) => {
    const account = await signedIn(c);
    const { pago, direccion } = ((await c.req.json().catch(() => null)) ?? {}) as { pago?: unknown; direccion?: unknown };
    if (typeof pago !== 'string' || typeof direccion !== 'string' || direccion.length > 120) throw new ApiError(400, 'pedido_invalido');
    let address: string;
    try {
      address = parseDestination(direccion, network).address;
    } catch (e) {
      if (isCoreError(e)) throw new ApiError(422, 'direccion_invalida');
      throw e;
    }
    const p = (await ownPurchases(sql, account.id)).find((x) => x.id === pago);
    if (p === undefined) throw new ApiError(404, 'no_encontrado');
    if (p.codigo !== null) return c.json({ codigo: p.codigo });
    const blocker = await refundBlocker(sql, account.id, p);
    if (blocker !== null) throw new ApiError(409, blocker === 'vencido' ? 'arrepentimiento_vencido' : 'creditos_usados');
    const codigo = newCode();
    await sql`
      insert into arrepentimientos (codigo, pago_id, usuario_id, direccion_devolucion, sats)
      values (${codigo}, ${p.id}, ${account.id}, ${address}, ${p.sats_recibidos})`;
    const text = `Pedido de arrepentimiento ${codigo}: pago ${p.id.slice(0, 8)} (${PRODUCT_NAMES[p.producto] ?? p.producto}), devolver ${p.sats_recibidos} sats a ${address}.`;
    for (const to of await allAdmins(sql, adminEmails)) await mailer.send({ to, subject: `Regalale Bitcoin: arrepentimiento ${codigo}`, text }).catch(() => undefined);
    await mailer
      .send({
        to: account.email,
        subject: `Regalale Bitcoin: recibimos tu pedido ${codigo}`,
        text: `Recibimos tu pedido de arrepentimiento ${codigo}. Te vamos a devolver ${p.sats_recibidos} sats a ${address}. Si no lo pediste, respondé este mail.`,
      })
      .catch(() => undefined);
    return c.json({ codigo }, 201);
  });

  /** El admin marca una devolución hecha: el pago queda «devuelto» y se quita lo otorgado. Exige passkey. */
  app.post('/api/admin/arrepentimiento/:codigo/devuelto', async (c) => {
    const account = await signedIn(c);
    if (!(await isAdmin(sql, adminEmails, account.email))) throw new ApiError(404, 'no_encontrado');
    if (account.viaPasskey !== true) throw new ApiError(403, 'passkey_requerida');
    const codigo = c.req.param('codigo');
    const done = await sql.begin(async (tx) => {
      const [a] = await tx<{ pago_id: string; usuario_id: string }[]>`
        update arrepentimientos set estado = 'devuelto', resuelto = now() where codigo = ${codigo} and estado = 'pedido' returning pago_id, usuario_id`;
      if (a === undefined) return false;
      await tx`update pagos set estado = 'devuelto' where id = ${a.pago_id}`;
      const [pr] = await tx<{ regalos: number; listas_cumple: number; listas_otras: number }[]>`
        select pr.regalos, pr.listas_cumple, pr.listas_otras from pagos p join productos pr on pr.codigo = p.producto where p.id = ${a.pago_id}`;
      for (const [unidad, n] of [['regalo', pr?.regalos ?? 0], ['lista_cumple', pr?.listas_cumple ?? 0], ['lista_otras', pr?.listas_otras ?? 0]] as const) {
        if (n > 0) {
          await tx`insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, referencia, motivo)
                   values (${a.usuario_id}, 'ajuste', ${unidad}, ${-n}, 'admin', ${a.pago_id}, ${`Arrepentimiento ${codigo}`})`;
        }
      }
      await tx`update planes set hasta = now() where referencia = ${a.pago_id} and (hasta is null or hasta > now())`;
      await tx`insert into registro_admin (email, accion, detalle) values (${account.email}, 'arrepentimiento_devuelto', ${codigo})`;
      return true;
    });
    if (!done) throw new ApiError(404, 'no_encontrado');
    return c.json({ ok: true });
  });

  /** Pedidos de arrepentimiento para el admin (con la dirección a la que hay que devolver). */
  app.get('/api/admin/arrepentimientos', async (c) => {
    const account = await signedIn(c);
    if (!(await isAdmin(sql, adminEmails, account.email))) throw new ApiError(404, 'no_encontrado');
    const rows = await sql<{ codigo: string; pago_id: string; producto: string; sats: string; direccion_devolucion: string; estado: string; creado: Date }[]>`
      select a.codigo, a.pago_id, p.producto, a.sats, a.direccion_devolucion, a.estado, a.creado
      from arrepentimientos a join pagos p on p.id = a.pago_id order by a.creado desc limit 50`;
    c.header('cache-control', 'no-store');
    return c.json({
      pedidos: rows.map((r) => ({ codigo: r.codigo, pago: r.pago_id.slice(0, 8), producto: r.producto, sats: r.sats, direccion: r.direccion_devolucion, estado: r.estado, fecha: r.creado.toISOString() })),
    });
  });
}
