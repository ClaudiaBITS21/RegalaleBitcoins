import { isLang } from '@regalale/core';
import { createMailLink } from './accounts.ts';
import type { ChainClient } from './chain.ts';
import type { Sql } from './db.ts';
import { type Mailer, readyMail } from './mail.ts';

// "Tu regalo está listo": cuando entra el pago de un regalo de una cuenta, se avisa por
// mail con un link al panel. Lo dispara la tarea programada (Cloud Scheduler).

const LINK_DAYS_MINUTES = 3 * 24 * 60;

export async function sendReadyNotices(deps: { sql: Sql; chain: ChainClient; mailer: Mailer; publicUrl: string }): Promise<number> {
  const { sql, chain, mailer, publicUrl } = deps;
  const pending = await sql<{ id: string; direccion: string; para: string; usuario_id: string; email: string; idioma: string }[]>`
    select r.id, r.direccion, r.para, r.usuario_id, u.email, u.idioma
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
    try {
      await mailer.send(readyMail(g.email, isLang(g.idioma) ? g.idioma : 'es', g.para, `${publicUrl}/panel#acceso=${token}`));
      sent++;
    } catch (error) {
      console.error(`No se pudo avisar el regalo ${g.id}: ${(error as Error).message}`);
    }
  }
  return sent;
}
