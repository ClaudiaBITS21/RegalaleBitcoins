import { isLang } from '@regalale/core';
import { createMailLink } from './accounts.ts';
import type { ChainClient } from './chain.ts';
import type { Sql } from './db.ts';
import { type Mailer, readyMail, reminderMail, genericReminderMail } from './mail.ts';
import { occasionName } from './ocasiones.ts';
import { open } from './secreto.ts';

// «¡Felicitaciones!»: cuando entra el pago de un regalo de una cuenta, se avisa por mail con un
// link al panel (que además confirma el mail). Lo dispara la tarea programada (Cloud Scheduler).

const LINK_DAYS_MINUTES = 3 * 24 * 60;

export async function sendReadyNotices(deps: { sql: Sql; chain: ChainClient; mailer: Mailer; publicUrl: string }): Promise<number> {
  const { sql, chain, mailer, publicUrl } = deps;
  const pending = await sql<{ id: string; direccion: string; para: string | null; usuario_id: string; email: string; idioma: string; verificado: Date | null }[]>`
    select r.id, r.direccion, r.para, r.usuario_id, u.email, u.idioma, u.verificado
    from regalos r join usuarios u on u.id = r.usuario_id
    where r.aviso_listo is null and r.reclamo_txid is null and r.creado > now() - interval '30 days'
    order by r.creado limit 50`;
  let sent = 0;
  for (const g of pending) {
    let stats;
    try {
      stats = await chain.addressStats(g.direccion);
    } catch {
      continue;
    }
    if (stats.confirmedFunded <= 0n) continue;
    // Se marca antes de mandar: ante una falla, mejor un aviso de menos que dos repetidos.
    const marked = await sql`update regalos set aviso_listo = now() where id = ${g.id} and aviso_listo is null returning id`;
    if (marked.length === 0) continue;
    const token = await createMailLink(sql, g.usuario_id, LINK_DAYS_MINUTES);
    // ¿Es su primer regalo? Los anteriores de la cuenta que ya tuvieron su aviso, o (etapa D: los
    // desvinculados ya no se ven) si la cuenta lleva armado más de uno.
    const [prev] = await sql<{ n: string }[]>`
      select (select count(*) from regalos where usuario_id = ${g.usuario_id} and aviso_listo is not null and id <> ${g.id})
        + greatest((select regalos_hechos from usuarios where id = ${g.usuario_id}) - 1, 0) as n`;
    try {
      await mailer.send(
        readyMail(open(g.email), isLang(g.idioma) ? g.idioma : 'es', {
          para: g.para,
          sats: stats.confirmedFunded,
          first: Number(prev?.n ?? 0) === 0,
          verified: g.verificado !== null,
          link: `${publicUrl}/panel#acceso=${token}`,
        }),
      );
      sent++;
    } catch (error) {
      console.error(`No se pudo avisar el regalo ${g.id}: ${(error as Error).message}`);
    }
  }
  return sent;
}

// Recordatorios a quien regala: si el regalo está pago y nadie lo abrió, a los 14 días del aviso
// de "listo" y otra vez a los 60. Nunca a quien recibe (no tenemos sus datos). Un regalo abierto o
// cancelado ya movió sus fondos: se reconoce en la cadena, aunque se haya abierto por fuera.
export const REMINDER_DAYS = [14, 60] as const;

export async function sendReminders(deps: { sql: Sql; chain: ChainClient; mailer: Mailer; publicUrl: string }): Promise<number> {
  const { sql, chain, mailer, publicUrl } = deps;
  const [first, second] = REMINDER_DAYS;
  const due = await sql<{ id: string; direccion: string; para: string | null; usuario_id: string; email: string; idioma: string; recordatorios: number; ocasion: string; ocasion_libre: string | null; creado: Date }[]>`
    select r.id, r.direccion, r.para, r.usuario_id, u.email, u.idioma, r.recordatorios, r.ocasion, r.ocasion_libre, r.creado
    from regalos r join usuarios u on u.id = r.usuario_id
    where r.aviso_listo is not null and r.reclamo_txid is null
      and ((r.recordatorios = 0 and r.aviso_listo < now() - make_interval(days => ${first}))
        or (r.recordatorios = 1 and r.aviso_listo < now() - make_interval(days => ${second})))
    order by r.aviso_listo limit 50`;
  let sent = 0;
  for (const g of due) {
    let stats;
    try {
      stats = await chain.addressStats(g.direccion);
    } catch {
      continue;
    }
    if (stats.confirmedSpent > 0n || stats.mempoolSpent > 0n) {
      // Ya se abrió (o se canceló): no hay nada que recordar.
      await sql`update regalos set recordatorios = 2 where id = ${g.id}`;
      continue;
    }
    // Como el aviso: se marca antes de mandar, para no repetir ante una falla.
    const marked = await sql`
      update regalos set recordatorios = recordatorios + 1, ultimo_recordatorio = now()
      where id = ${g.id} and recordatorios = ${g.recordatorios} returning id`;
    if (marked.length === 0) continue;
    const token = await createMailLink(sql, g.usuario_id, LINK_DAYS_MINUTES);
    try {
      const lang = isLang(g.idioma) ? g.idioma : 'es';
      await mailer.send(reminderMail(open(g.email), lang, g.para, `${publicUrl}/panel#acceso=${token}`, { ocasion: occasionName(g.ocasion, lang, g.ocasion_libre), creado: g.creado }));
      sent++;
    } catch (error) {
      console.error(`No se pudo mandar el recordatorio del regalo ${g.id}: ${(error as Error).message}`);
    }
  }
  return sent;
}

// Aviso genérico (etapa D): con los regalos desvinculados, el servidor solo sabe cuántos regalos sin
// abrir vio el navegador la última vez (`pendientes`) y cuándo se armó el último. Manda un mail a
// los 14 días de un regalo nuevo y, mientras ese número no cambie, otra vez cada 60 días.
export const GENERIC_DAYS = { first: 14, again: 60 } as const;

export async function sendGenericReminders(deps: { sql: Sql; mailer: Mailer; publicUrl: string }): Promise<number> {
  const { sql, mailer, publicUrl } = deps;
  const due = await sql<{ id: string; email: string; idioma: string }[]>`
    update usuarios set aviso_generico = now()
    where id in (
      select id from usuarios
      where pendientes > 0 and ultimo_regalo is not null
        -- Si todavía tiene regalos vinculados con recordatorio propio por delante, va ese.
        and not exists (select 1 from regalos r where r.usuario_id = usuarios.id and r.reclamo_txid is null and r.recordatorios < 2)
        and ((ultimo_regalo < now() - make_interval(days => ${GENERIC_DAYS.first}) and (aviso_generico is null or aviso_generico < ultimo_regalo))
          or (aviso_generico < now() - make_interval(days => ${GENERIC_DAYS.again})
              and coalesce(pendientes_desde, ultimo_regalo) < now() - make_interval(days => ${GENERIC_DAYS.again})))
      order by ultimo_regalo limit 50)
    returning id, email, idioma`;
  let sent = 0;
  for (const u of due) {
    const token = await createMailLink(sql, u.id, LINK_DAYS_MINUTES);
    try {
      await mailer.send(genericReminderMail(open(u.email), isLang(u.idioma) ? u.idioma : 'es', `${publicUrl}/panel#acceso=${token}`));
      sent++;
    } catch (error) {
      console.error(`No se pudo mandar el aviso genérico: ${(error as Error).message}`);
    }
  }
  return sent;
}
