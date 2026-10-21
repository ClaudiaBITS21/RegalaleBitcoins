import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OCCASION_LABELS, occasionReason } from '../src/content/occasions.ts';
import { VOSEO } from './voseo.ts';

// El mensaje que se manda con el link lleva la ocasión como frase («por tu cumpleaños»).
describe('Ocasión en el mensaje del link', () => {
  it('cada ocasión tiene su frase en todos los idiomas, sin voseo (vale con vos y con tú)', () => {
    for (const key of Object.keys(OCCASION_LABELS)) {
      if (key === 'otra') continue;
      for (const lang of ['es', 'pt', 'en', 'it'] as const) assert.notEqual(occasionReason(key, lang), '', `${key} en ${lang}`);
      assert.ok(!VOSEO.test(occasionReason(key, 'es')), key);
    }
  });

  it('la ocasión libre va con «por»; sin ocasión, nada', () => {
    assert.equal(occasionReason('otra', 'es', 'tu cumple 40'), 'por tu cumple 40');
    assert.equal(occasionReason('otra', 'en', 'your promotion'), 'for your promotion');
    assert.equal(occasionReason('otra', 'es', ''), '');
    assert.equal(occasionReason('', 'es'), '');
    assert.equal(occasionReason('cumple', 'es'), 'por tu cumpleaños');
  });
});
