import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cachedFees, ChainError, type ChainClient, esploraClient, fallbackChain, feesFromEstimates, type FeeRates } from '../src/chain.ts';

const FEES: FeeRates = { fastest: 5, halfHour: 3, hour: 2, economy: 1, minimum: 1 };

/** Cliente que responde o falla según lo que se le indique, y cuenta las llamadas. */
function fake(name: string, failWith: ChainError | null = null): ChainClient & { calls: string[] } {
  const calls: string[] = [];
  const run = async <T>(method: string, value: T): Promise<T> => {
    calls.push(method);
    if (failWith !== null) throw failWith;
    return value;
  };
  return {
    calls,
    addressStats: () => run('addressStats', { confirmedFunded: 0n, confirmedSpent: 0n, mempoolFunded: 0n, mempoolSpent: 0n, txCount: name === 'a' ? 1 : 2 }),
    addressUtxos: () => run('addressUtxos', []),
    mempoolPayments: () => run('mempoolPayments', []),
    txHex: () => run('txHex', name),
    broadcast: () => run('broadcast', name),
    fees: () => run('fees', FEES),
  };
}

describe('fuentes de cadena', () => {
  it('usa la principal mientras responde', async () => {
    const a = fake('a');
    const b = fake('b');
    const chain = fallbackChain(a, b);
    assert.equal(await chain.txHex('x'), 'a');
    assert.equal(b.calls.length, 0);
  });

  it('pasa al respaldo si la principal se cae, nos limita o no responde', async () => {
    for (const error of [new ChainError('caída', 503), new ChainError('límite', 429), new ChainError('sin conexión')]) {
      const used: string[] = [];
      const chain = fallbackChain(fake('a', error), fake('b'), (m) => used.push(m));
      assert.equal(await chain.broadcast('00'), 'b');
      assert.equal((await chain.addressStats('x')).txCount, 2);
      assert.deepEqual(used, ['broadcast', 'addressStats']);
    }
  });

  it('un rechazo del pedido no se reintenta en la otra fuente', async () => {
    const b = fake('b');
    const chain = fallbackChain(fake('a', new ChainError('transacción inválida', 400)), b);
    await assert.rejects(chain.broadcast('00'), (e: unknown) => e instanceof ChainError && e.status === 400);
    assert.equal(b.calls.length, 0);
  });

  it('guarda las comisiones unos segundos', async () => {
    let t = 0;
    const a = fake('a');
    const chain = cachedFees(a, 30_000, () => t);
    await chain.fees();
    t = 29_000;
    await chain.fees();
    assert.deepEqual(a.calls, ['fees']);
    t = 31_000;
    await chain.fees();
    assert.deepEqual(a.calls, ['fees', 'fees']);
  });

  it('comisiones de Blockstream: objetivo en bloques a sat/vB, nunca menos de 1', async () => {
    assert.deepEqual(feesFromEstimates({ '1': 30.5, '2': 25, '3': 20, '6': 12, '144': 2.1, '504': 1.2, '1008': 0.8 }), {
      fastest: 30.5,
      halfHour: 20,
      hour: 12,
      economy: 2.1,
      minimum: 1,
    });
    // Sin el objetivo exacto, toma el más cercano por debajo (más rápido).
    assert.equal(feesFromEstimates({ '1': 10, '5': 4 }).hour, 4);
    assert.throws(() => feesFromEstimates({}), ChainError);
  });

  it('el cliente de Blockstream pide /fee-estimates', async () => {
    const asked: string[] = [];
    const fetchFake = (async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify({ '1': 9, '3': 6, '6': 4, '144': 2, '1008': 1 }));
    }) as unknown as typeof fetch;
    const fees = await esploraClient('https://blockstream.info/api', fetchFake, 1_000, 'blockstream').fees();
    assert.deepEqual(asked, ['https://blockstream.info/api/fee-estimates']);
    assert.equal(fees.halfHour, 6);
  });
});
