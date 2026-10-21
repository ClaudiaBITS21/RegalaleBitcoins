import { createHash } from 'node:crypto';
import { isLang } from '@regalale/core';
import type { Context, Hono } from 'hono';
import { currentAccount } from './accountRoutes.ts';
import { isAdmin } from './admins.ts';
import type { Sql } from './db.ts';
import { ApiError } from './errors.ts';
import { GIFT_ID } from './gifts.ts';
import { type Mailer, reportMail } from './mail.ts';
import { RateLimiter } from './ratelimit.ts';
import { clientIp } from './validate.ts';

// Denuncias de listas y pausa escalonada (handoff 2026-10-21, «listas por país», sección 6).
// 1. Primera denuncia: la lista se pausa en el acto y deja de mostrar datos para aportar (dato de
//    cobro, dirección y QR: en una lista trucha la llave también es del estafador). Se le avisa a
//    quien la armó con el motivo, sin el mail de quien denunció.
// 2. Quien la armó la puede reactivar una sola vez.
// 3. Una denuncia después de esa reactivación la deja en revisión hasta que la vea un admin.
// 4. Una denuncia por mail y por lista, con límite por IP. Los aportes anunciados no cambian.

export type ListState = 'activa' | 'pausada' | 'en_revision' | 'baja';

export interface ReportDeps {
  readonly sql: Sql;
  readonly network: string;
  readonly adminEmails: readonly string[];
  readonly mailer: Mailer;
  readonly publicUrl: string;
  readonly reportsPerHour?: number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ipHash = (ip: string) => createHash('sha256').update(`denuncia:${ip}`).digest();

export function registerReportRoutes(app: Hono, deps: ReportDeps): void {
  const { sql, mailer } = deps;
  const limiter = new RateLimiter(deps.reportsPerHour ?? 5, 60 * 60 * 1000);
  const body = async (c: Context) => ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  /** Reportar una lista pública: la pausa (o la deja en revisión si ya se reactivó una vez). */
  app.post('/api/listas/:id/denuncias', async (c) => {
    const ip = clientIp(c.req.header('x-forwarded-for'));
    if (!limiter.allowed(ip)) throw new ApiError(429, 'demasiados_pedidos');
    const id = c.req.param('id');
    if (!GIFT_ID.test(id)) throw new ApiError(404, 'no_encontrado');
    const b = await body(c);
    const motivo = typeof b.motivo === 'string' ? b.motivo.trim() : '';
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    if (motivo === '' || [...motivo].length > 500 || !EMAIL.test(email) || email.length > 254) throw new ApiError(400, 'pedido_invalido');
    const result = await sql.begin(async (tx) => {
      const [l] = await tx<{ estado: ListState; reactivada: Date | null; titulo: string; email: string; idioma: string }[]>`
        select l.estado, l.reactivada, l.titulo, u.email, u.idioma from listas l join usuarios u on u.id = l.usuario_id
        where l.id = ${id} and l.red = ${deps.network} for update of l`;
      if (l === undefined || l.estado === 'baja') throw new ApiError(404, 'no_encontrado');
      const inserted = await tx`
        insert into denuncias (lista_id, email, motivo, ip_hash) values (${id}, ${email}, ${motivo}, ${ipHash(ip)})
        on conflict (lista_id, email) do nothing returning id`;
      if (inserted.length === 0) throw new ApiError(409, 'ya_denunciada');
      if (l.estado !== 'activa') return { owner: null, estado: l.estado };
      const estado: ListState = l.reactivada === null ? 'pausada' : 'en_revision';
      await tx`update listas set estado = ${estado} where id = ${id}`;
      return { owner: l, estado };
    });
    limiter.record(ip);
    if (result.owner !== null) {
      const lang = isLang(result.owner.idioma) ? result.owner.idioma : 'es';
      await mailer
        .send(reportMail(result.owner.email, lang, { titulo: result.owner.titulo, motivo, review: result.estado === 'en_revision', link: `${deps.publicUrl}/panel` }))
        .catch((e: unknown) => console.warn(`denuncia: no se pudo avisar a quien armó la lista ${id}: ${String(e)}`));
    }
    return c.json({ estado: result.estado }, 201);
  });

  /** Quien armó la lista la reactiva (una sola vez), con su sesión. */
  app.post('/api/cuenta/listas/:id/reactivar', async (c) => {
    const account = await currentAccount(sql, c);
    if (account === null) throw new ApiError(401, 'sesion_requerida');
    const rows = await sql`
      update listas set estado = 'activa', reactivada = now()
      where id = ${c.req.param('id')} and usuario_id = ${account.id} and estado = 'pausada' and reactivada is null
      returning id`;
    if (rows.length === 0) throw new ApiError(409, 'pedido_invalido', 'no_se_puede_reactivar');
    return c.json({ estado: 'activa' });
  });

  // ── Admin: denuncias ──

  const admin = async (c: Context, passkey: boolean) => {
    const account = await currentAccount(sql, c);
    if (account === null) throw new ApiError(401, 'sesion_requerida');
    if (!(await isAdmin(sql, deps.adminEmails, account.email))) throw new ApiError(404, 'no_encontrado');
    if (passkey && account.viaPasskey !== true) throw new ApiError(403, 'passkey_requerida');
    c.header('cache-control', 'no-store');
    return account;
  };

  /** Listas con denuncias: las pausadas o en revisión primero. Los datos de cobro no se ven. */
  app.get('/api/admin/denuncias', async (c) => {
    await admin(c, false);
    const lists = await sql<{ id: string; titulo: string; ocasion: string; creada: Date; estado: ListState; reactivada: Date | null; email: string }[]>`
      select l.id, l.titulo, l.ocasion, l.creada, l.estado, l.reactivada, u.email from listas l join usuarios u on u.id = l.usuario_id
      where l.red = ${deps.network} and exists (select 1 from denuncias d where d.lista_id = l.id)
      order by (l.estado in ('pausada', 'en_revision')) desc, (select max(creada) from denuncias d where d.lista_id = l.id) desc limit 200`;
    const reports = lists.length === 0 ? [] : await sql<{ lista_id: string; email: string; motivo: string; creada: Date }[]>`
      select lista_id, email, motivo, creada from denuncias where lista_id in ${sql(lists.map((l) => l.id))} order by creada`;
    return c.json({
      listas: lists.map((l) => ({
        id: l.id,
        titulo: l.titulo,
        ocasion: l.ocasion,
        creada: l.creada.toISOString(),
        estado: l.estado,
        reactivada: l.reactivada?.toISOString() ?? null,
        dueno: l.email,
        denuncias: reports.filter((r) => r.lista_id === l.id).map((r) => ({ email: r.email, motivo: r.motivo, creada: r.creada.toISOString() })),
      })),
    });
  });

  /** Reactivar o dar de baja una lista denunciada (con passkey; queda en registro_admin). */
  app.post('/api/admin/denuncias/:id', async (c) => {
    const account = await admin(c, true);
    const { accion } = await body(c);
    if (accion !== 'reactivar' && accion !== 'baja') throw new ApiError(400, 'pedido_invalido');
    const estado: ListState = accion === 'reactivar' ? 'activa' : 'baja';
    const rows = await sql`update listas set estado = ${estado} where id = ${c.req.param('id')} and red = ${deps.network} returning id`;
    if (rows.length === 0) throw new ApiError(404, 'no_encontrado');
    await sql`insert into registro_admin (email, accion, detalle) values (${account.email}, ${accion === 'reactivar' ? 'lista_reactivada' : 'lista_baja'}, ${c.req.param('id')})`;
    return c.json({ estado });
  });
}
