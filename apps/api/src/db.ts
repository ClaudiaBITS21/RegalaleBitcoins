import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

export type Sql = postgres.Sql;

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export function connect(databaseUrl: string): Sql {
  return postgres(databaseUrl, { max: 10, onnotice: () => {} });
}

/** Aplica en orden las migraciones que falten (archivos NNN_nombre.sql). */
export async function migrate(sql: Sql): Promise<string[]> {
  await sql`create table if not exists migraciones (nombre text primary key, aplicada timestamptz not null default now())`;
  const done = new Set((await sql<{ nombre: string }[]>`select nombre from migraciones`).map((r) => r.nombre));
  const applied: string[] = [];
  for (const file of readdirSync(MIGRATIONS).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort()) {
    if (done.has(file)) continue;
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(MIGRATIONS, file), 'utf8'));
      await tx`insert into migraciones (nombre) values (${file})`;
    });
    applied.push(file);
  }
  return applied;
}
