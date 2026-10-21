import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLinkFragment, sealForLink, startLink } from '../src/vinculo.ts';

const ID = 'AbCdEfGhIjKlMnOpQrStUv';
const MASTER = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('el celu cifra la clave maestra y solo la compu del QR la abre', async () => {
  const compu = await startLink(ID);
  const qr = parseLinkFragment(`#${compu.fragment}`);
  assert.ok(qr !== null);
  assert.equal(qr.id, ID);
  const paquete = await sealForLink(qr.id, qr.pub, MASTER);
  assert.match(paquete, /^v1(\.[A-Za-z0-9_-]{16,700}){3}$/);
  assert.ok(!paquete.includes('abandon'));
  assert.equal(await compu.open(paquete), MASTER);
  // Otra compu (otro par de claves) no lo abre, ni con otro id.
  await assert.rejects((await startLink(ID)).open(paquete));
  const otroId = await startLink('ZZZZZZZZZZZZZZZZZZZZZZ');
  await assert.rejects(otroId.open(await sealForLink('ZZZZZZZZZZZZZZZZZZZZZZ', parseLinkFragment(`#${compu.fragment.replace(ID, 'ZZZZZZZZZZZZZZZZZZZZZZ')}`)!.pub, MASTER)));
});

test('fragmento inválido', () => {
  assert.equal(parseLinkFragment('#nada'), null);
  assert.equal(parseLinkFragment(`#${ID}.${'A'.repeat(40)}`), null);
  assert.equal(parseLinkFragment(`#corto.${'A'.repeat(87)}`), null);
});
