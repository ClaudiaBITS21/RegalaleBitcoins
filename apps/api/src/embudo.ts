import type { Hono } from 'hono';
import type { Sql } from './db.ts';
import { ApiError } from './errors.ts';
import { RateLimiter } from './ratelimit.ts';
import { clientIp } from './validate.ts';

// Embudo por campaña (Claudia, 24/11/2026), para medir qué comunicación funciona. El navegador
// avisa que pasó un paso y de dónde había llegado esa visita; el servidor solo suma 1 a un contador
// por semana, origen y paso. El pedido no lleva el regalo, la cuenta ni nada de la persona, y la
// ruta no lee la sesión: un contador no se puede relacionar con nadie (docs/eventos.md).

/** Los pasos que se cuentan. Cualquier otro nombre se rechaza: no es un canal para mandar datos. */
export const FUNNEL_EVENTS = [
  // Quien regala
  'visita', // primera página de la visita
  'regalar_inicio', // entró al armado del regalo
  'regalo_creado', // llegó a la pantalla de pago (hay dirección)
  'pago_visto', // el pago apareció en la red
  'regalo_compartido', // tocó WhatsApp, mail, copiar o bajó la tarjeta
  'compra', // pagó un pack, plan o lista
  // Quien recibe
  'link_abierto', // abrió el link de un regalo
  'palabras_ok', // puso bien las 4 palabras
  'regalo_abierto', // mandó el regalo a su billetera
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export interface FunnelHit {
  readonly evento: FunnelEvent;
  readonly origen: string;
}

/** El paso (de la lista) y el origen (dominio, utm:…, cupon, regalo o directo). null si el paso no existe. */
export function parseFunnelHit(b: Record<string, unknown>): FunnelHit | null {
  if (typeof b.evento !== 'string' || !(FUNNEL_EVENTS as readonly string[]).includes(b.evento)) return null;
  const raw = typeof b.origen === 'string' ? b.origen.trim().toLowerCase() : '';
  return { evento: b.evento as FunnelEvent, origen: /^[a-z0-9:._-]{1,64}$/.test(raw) ? raw : 'directo' };
}

export async function countFunnelHit(sql: Sql, h: FunnelHit): Promise<void> {
  await sql`
    insert into embudo_semana (semana, origen, evento, cantidad)
    values (date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires')::date, ${h.origen}, ${h.evento}, 1)
    on conflict (semana, origen, evento) do update set cantidad = embudo_semana.cantidad + 1`;
}

/** Las últimas semanas, para el admin. */
export async function funnelStats(sql: Sql, weeks = 12): Promise<Array<{ semana: string; origen: string; evento: string; cantidad: number }>> {
  const rows = await sql<{ semana: string; origen: string; evento: string; cantidad: number }[]>`
    select to_char(semana, 'YYYY-MM-DD') as semana, origen, evento, cantidad from embudo_semana
    where semana >= (now() - make_interval(weeks => ${weeks}))::date
    order by semana desc, origen, evento`;
  return rows.map((r) => ({ ...r }));
}

export function registerFunnelRoutes(app: Hono, deps: { sql: Sql; perHour?: number }): void {
  // Una visita completa son menos de 10 avisos. La IP se usa en memoria para el límite y no se guarda.
  const limiter = new RateLimiter(deps.perHour ?? 60, 60 * 60 * 1000);
  app.post('/api/eventos', async (c) => {
    const ip = clientIp(c.req.header('x-forwarded-for'));
    if (!limiter.allowed(ip)) throw new ApiError(429, 'demasiados_pedidos');
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const hit = body === null || typeof body !== 'object' ? null : parseFunnelHit(body);
    if (hit === null) throw new ApiError(400, 'pedido_invalido');
    limiter.record(ip);
    await countFunnelHit(deps.sql, hit);
    return c.body(null, 204);
  });
}
