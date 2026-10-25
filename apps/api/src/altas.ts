import type postgres from 'postgres';
import type { Sql } from './db.ts';

// Estadística de altas (Claudia, 25/10): al crear una cuenta se suma 1 al contador de su semana,
// su país aproximado (por la zona horaria del dispositivo) y de dónde llegó. Nada de esto queda en
// la cuenta ni se puede relacionar con ella.

type Tx = Sql | postgres.TransactionSql;

export interface SignupStats {
  readonly pais: string;
  readonly origen: string;
}

/** País (código de 2 letras o INT) y origen (dominio, utm:…, cupon o directo), o lo genérico. */
export function parseSignupStats(b: Record<string, unknown>): SignupStats {
  const pais = typeof b.pais === 'string' && /^([A-Z]{2}|INT)$/.test(b.pais) ? b.pais : 'INT';
  const raw = typeof b.origen === 'string' ? b.origen.trim().toLowerCase() : '';
  const origen = /^[a-z0-9:._-]{1,64}$/.test(raw) ? raw : 'directo';
  return { pais, origen };
}

export async function countSignup(tx: Tx, s: SignupStats): Promise<void> {
  await tx`
    insert into altas_semana (semana, pais, origen, cuentas)
    values (date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires')::date, ${s.pais}, ${s.origen}, 1)
    on conflict (semana, pais, origen) do update set cuentas = altas_semana.cuentas + 1`;
}

/** Las últimas semanas, para el admin. */
export async function signupStats(sql: Sql, weeks = 12): Promise<Array<{ semana: string; pais: string; origen: string; cuentas: number }>> {
  const rows = await sql<{ semana: string; pais: string; origen: string; cuentas: number }[]>`
    select to_char(semana, 'YYYY-MM-DD') as semana, pais, origen, cuentas from altas_semana
    where semana >= (now() - make_interval(weeks => ${weeks}))::date
    order by semana desc, cuentas desc, pais, origen`;
  return rows.map((r) => ({ ...r }));
}
