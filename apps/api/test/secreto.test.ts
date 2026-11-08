import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { connect, migrate, type Sql } from '../src/db.ts';
import { isSealed, loadKeys, mailHash, open, seal, sealExisting, useDevKeys } from '../src/secreto.ts';

const DB = process.env.DATABASE_URL_TEST ?? 'postgres://regalale:regalale@127.0.0.1:5432/regalale_test';

describe('Mails cifrados (08/11/2026)', () => {
  let sql: Sql;
  before(async () => {
    sql = connect(DB);
    await migrate(sql);
  });
  after(async () => {
    useDevKeys();
    await sql.end();
  });

  it('sella y abre; cada sellado es distinto; la huella es fija y no deja ver el mail', () => {
    useDevKeys();
    const a = seal('ana@example.com');
    const b = seal('ana@example.com');
    assert.ok(isSealed(a) && a !== b && !a.includes('ana'));
    assert.equal(open(a), 'ana@example.com');
    assert.equal(open('viejo@example.com'), 'viejo@example.com', 'un mail todavía sin sellar se devuelve igual');
    assert.deepEqual(mailHash('ana@example.com'), mailHash('ana@example.com'));
    assert.notDeepEqual(mailHash('ana@example.com'), mailHash('beto@example.com'));
    // Alterado, no abre.
    const raw = Buffer.from(a.slice(3), 'base64');
    raw[20] = (raw[20] as number) ^ 1;
    assert.throws(() => open(`m1.${raw.toString('base64')}`));
  });

  it('con KMS: la primera vez genera y guarda las claves envueltas; después las desenvuelve; sin KMS no se leen', async () => {
    await sql`delete from claves`;
    const calls: string[] = [];
    // KMS de mentira: «envuelve» con un prefijo. Lo que importa es que la base solo guarde lo envuelto.
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push(u.split('/').pop() as string);
      if (u.includes('metadata.google.internal')) return Response.json({ access_token: 't' });
      const body = JSON.parse(String(init?.body)) as { plaintext?: string; ciphertext?: string };
      if (u.endsWith(':encrypt')) return Response.json({ ciphertext: `env:${body.plaintext}` });
      if (u.endsWith(':decrypt')) return Response.json({ plaintext: (body.ciphertext as string).slice(4) });
      return new Response('', { status: 404 });
    }) as typeof fetch;
    const KEY = 'projects/p/locations/l/keyRings/r/cryptoKeys/mails';
    await loadKeys(sql, KEY, fakeFetch);
    const sealed = seal('leo@example.com');
    const [row] = await sql<{ envuelta: string }[]>`select envuelta from claves where nombre = 'mails'`;
    assert.ok(row?.envuelta.startsWith('env:'));
    // Otro arranque: las mismas claves, desde la base.
    useDevKeys();
    assert.throws(() => open(sealed), 'con otra clave no abre');
    await loadKeys(sql, KEY, fakeFetch);
    assert.equal(open(sealed), 'leo@example.com');
    assert.ok(calls.filter((c) => c.endsWith(':encrypt')).length === 1, 'genera una sola vez');
    // Si KMS no responde, el servidor no arranca con claves inventadas.
    const down = (async () => new Response('no', { status: 403 })) as unknown as typeof fetch;
    await assert.rejects(loadKeys(sql, KEY, down));
    await sql`delete from claves`;
    useDevKeys();
  });

  it('sella los mails que quedaban en claro (cuentas y cupones)', async () => {
    useDevKeys();
    await sql`delete from usuarios where email in ('claro@example.com')`;
    await sql`insert into usuarios (email) values ('claro@example.com')`;
    assert.ok((await sealExisting(sql)) >= 1);
    const [u] = await sql<{ email: string; email_huella: Buffer }[]>`select email, email_huella from usuarios where email_huella = ${mailHash('claro@example.com')}`;
    assert.ok(u !== undefined && isSealed(u.email) && open(u.email) === 'claro@example.com');
    assert.equal(await sealExisting(sql), 0, 'una segunda vez no hace nada');
    await sql`delete from usuarios where email_huella = ${mailHash('claro@example.com')}`;
  });
});
