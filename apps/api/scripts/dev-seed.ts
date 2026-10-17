// Registra en la base local los regalos de prueba de .dev/dev-gifts.json y muestra el
// link de reclamo de cada uno. Solo signet.
//
//   node apps/api/scripts/dev-seed.ts [http://localhost:5173]

import { loadConfig } from '../src/config.ts';
import { connect, migrate } from '../src/db.ts';
import { insertGift } from '../src/gifts.ts';
import { DEV_FILE, loadDevState } from './dev-gift.ts';

const base = process.argv[2] ?? 'http://localhost:5173';
const state = loadDevState();
if (state === null) {
  console.error(`No hay regalos de prueba. Corré antes: node apps/api/scripts/dev-gift.ts (${DEV_FILE})`);
  process.exit(1);
}
const config = loadConfig();
if (config.network.name !== 'signet') throw new Error('dev-seed solo corre en signet.');
const sql = connect(config.databaseUrl);
await migrate(sql);
for (const g of state.gifts) {
  const existing = await sql<{ id: string }[]>`select id from regalos where direccion = ${g.address}`;
  const id =
    existing[0]?.id ??
    (
      await insertGift(sql, {
        network: 'signet',
        address: g.address,
        lang: g.lang,
        occasion: 'cumple',
        to: 'Tomi',
        from: 'Rodo',
        message: 'Los verdaderos amigos son escasos. Bitcoin también.',
        image: 1,
        currency: 'USD',
        amount: 25,
        usdPerBtc: null,
      })
    ).id;
  console.log(`Regalo #${g.index}: ${base}/r/${id}#${g.fragment}`);
  console.log(`  palabras (${g.lang}): ${g.words.join(' ')}`);
}
await sql.end();
