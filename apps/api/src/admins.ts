import type { Context, Hono } from 'hono';
import { currentAccount } from './accountRoutes.ts';
import { type Account, normalizeEmail } from './accounts.ts';
import type { Sql } from './db.ts';
import { ApiError } from './errors.ts';
import type { Mailer } from './mail.ts';

// Quiénes son admins (Rodolfo, 21/10): los fijos de ADMIN_EMAILS y los que se suman desde el panel.
// Sumar o quitar uno exige una sesión abierta con passkey, avisa por mail a todos los admins y
// queda en registro_admin. Los fijos no se pueden quitar desde el panel.

/** Todos los admins de ahora: los fijos y los de la tabla, en minúsculas y sin repetir. */
export async function adminEmails(sql: Sql, fixed: readonly string[]): Promise<string[]> {
  const rows = await sql<{ email: string }[]>`select email from admins order by creado`;
  return [...new Set([...fixed, ...rows.map((r) => r.email)])];
}

export async function isAdmin(sql: Sql, fixed: readonly string[], email: string): Promise<boolean> {
  const e = email.toLowerCase();
  if (fixed.includes(e)) return true;
  const [row] = await sql`select 1 from admins where email = ${e}`;
  return row !== undefined;
}

export function registerAdminUserRoutes(app: Hono, deps: { sql: Sql; fixed: readonly string[]; mailer: Mailer }): void {
  const { sql, fixed, mailer } = deps;

  const admin = async (c: Context, passkey: boolean): Promise<Account> => {
    const account = await currentAccount(sql, c);
    if (account === null) throw new ApiError(401, 'sesion_requerida');
    if (!(await isAdmin(sql, fixed, account.email))) throw new ApiError(404, 'no_encontrado');
    if (passkey && account.viaPasskey !== true) throw new ApiError(403, 'passkey_requerida');
    c.header('cache-control', 'no-store');
    return account;
  };
  const emailOf = async (c: Context): Promise<string> => {
    const b = (await c.req.json().catch(() => null)) as { email?: unknown } | null;
    const email = normalizeEmail(b?.email);
    if (email === null) throw new ApiError(400, 'pedido_invalido');
    return email;
  };
  const notify = async (subject: string, text: string) => {
    for (const to of await adminEmails(sql, fixed)) {
      await mailer.send({ to, subject, text }).catch((e: Error) => console.error(`Aviso al admin sin mandar: ${e.message}`));
    }
  };

  app.get('/api/admin/admins', async (c) => {
    await admin(c, false);
    const rows = await sql<{ email: string; agregado_por: string; creado: Date }[]>`select email, agregado_por, creado from admins order by creado`;
    return c.json({ fijos: fixed, agregados: rows.map((r) => ({ email: r.email, agregadoPor: r.agregado_por, creado: r.creado.toISOString() })) });
  });

  app.post('/api/admin/admins', async (c) => {
    const account = await admin(c, true);
    const email = await emailOf(c);
    if (await isAdmin(sql, fixed, email)) throw new ApiError(409, 'ya_es_admin');
    await sql`insert into admins (email, agregado_por) values (${email}, ${account.email})`;
    await sql`insert into registro_admin (email, accion, detalle) values (${account.email}, 'admin_agregado', ${email})`;
    await notify('Regalale Bitcoin: hay un admin nuevo', `${account.email} sumó a ${email} como admin. Si no fue a propósito, entrá a /admin y quitalo.`);
    return c.json({ email }, 201);
  });

  app.post('/api/admin/admins/quitar', async (c) => {
    const account = await admin(c, true);
    const email = await emailOf(c);
    if (fixed.includes(email)) throw new ApiError(409, 'admin_fijo');
    const rows = await sql`delete from admins where email = ${email} returning email`;
    if (rows.length === 0) throw new ApiError(404, 'no_encontrado');
    await sql`insert into registro_admin (email, accion, detalle) values (${account.email}, 'admin_quitado', ${email})`;
    await notify('Regalale Bitcoin: se quitó un admin', `${account.email} quitó a ${email} de los admins.`);
    return c.json({ ok: true });
  });
}
