import assert from 'node:assert/strict';
import { createCipheriv, createHash, createHmac, hkdfSync } from 'node:crypto';
import { describe, it } from 'node:test';
import { base64urlnopad } from '@scure/base';
import { editKeyHash, generateMasterMnemonic, giftEditKey, isSealedGiftList, openGiftList, sealGiftList } from '../src/index.ts';

// Lista de regalos cifrada con la clave maestra y llave de edición (docs/derivacion.md, «Lista de
// regalos»). Los vectores fijan el esquema; se verifican también con node:crypto.
const M = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ENTROPY = new Uint8Array(16); // la de «abandon … about»
const IV = Uint8Array.from({ length: 12 }, (_, i) => 0x10 + i);
const LIST = [
  { i: 0, id: 'AAAAAAAAAAAAAAAAAAAAAA', l: 'es' as const },
  { i: 3, id: 'BBBBBBBBBBBBBBBBBBBBBB', l: 'en' as const },
];
const VECTOR = 'l1.EBESExQVFhcYGRob.rLmbIQZJfAvcSXuh-X-Mw7f2o_kZS76X3fJE1ZU6wAWJnPIAt3pRFJYzi0JlVH5B5CHuK4exXyCGWvioH1kuv0CMVJ4AEzvSXnR0gMZ2kPoME8PbhcdJUfo1eVQ2UrfpeULnqsmxPHqqkIWbJgI7';
const EDIT = '48c3e13676434d7addc3801ad2cc621e71eac8ec2a54f100208af1210ebe45e5';
// Dirección del regalo (la de BIP84 para «abandon … about», m/84'/0'/0'/0/0).
const ADDR = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

describe('Lista de regalos cifrada con la clave maestra', () => {
  it('vector fijo, y el mismo resultado con node:crypto', async () => {
    assert.equal(await sealGiftList(M, LIST, IV), VECTOR);
    const key = Buffer.from(hkdfSync('sha256', ENTROPY, new Uint8Array(0), 'regalalebitcoins/lista-regalos/v1/aes-gcm', 32));
    const c = createCipheriv('aes-256-gcm', key, IV);
    c.setAAD(Buffer.from('regalalebitcoins/lista-regalos/v1'));
    const body = Buffer.concat([c.update(JSON.stringify(LIST), 'utf8'), c.final(), c.getAuthTag()]);
    assert.equal(`l1.${base64urlnopad.encode(IV)}.${base64urlnopad.encode(body)}`, VECTOR);
  });

  it('abre con la misma clave maestra; no con otra ni alterada', async () => {
    assert.deepEqual(await openGiftList(M, VECTOR), LIST);
    await assert.rejects(openGiftList(generateMasterMnemonic(), VECTOR));
    await assert.rejects(openGiftList(M, `${VECTOR.slice(0, -2)}AA`));
    const fresh = await sealGiftList(M, []);
    assert.ok(isSealedGiftList(fresh) && fresh !== (await sealGiftList(M, [])));
    assert.deepEqual(await openGiftList(M, fresh), []);
  });

  it('llave de edición: fija por clave maestra y dirección del regalo; el servidor guarda solo su SHA-256', async () => {
    assert.equal(await giftEditKey(M, ADDR), EDIT);
    const k = Buffer.from(hkdfSync('sha256', ENTROPY, new Uint8Array(0), 'regalalebitcoins/edicion/v1', 32));
    assert.equal(createHmac('sha256', k).update(ADDR).digest('hex'), EDIT);
    assert.notEqual(await giftEditKey(M, 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g'), EDIT);
    assert.equal(editKeyHash(EDIT), '056448a4e0b17c58de4a10f756506063e231c666cb5aa73858c5c5e5d6031629');
    assert.equal(editKeyHash(EDIT), createHash('sha256').update(EDIT).digest('hex'));
  });
});
