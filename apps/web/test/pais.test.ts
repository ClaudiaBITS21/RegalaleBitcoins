import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { criptoyaUrl, detectCountry } from '../src/pais.ts';

describe('CriptoYa del país de quien paga', () => {
  it('la zona horaria manda', () => {
    assert.equal(detectCountry(['es-MX'], 'America/Argentina/Buenos_Aires'), 'AR');
    assert.equal(detectCountry(['es'], 'America/Mexico_City'), 'MX');
    assert.equal(detectCountry(['pt-BR'], 'America/Sao_Paulo'), 'BR');
    assert.equal(detectCountry(['es-AR'], 'Europe/Madrid'), null);
  });

  it('sin zona útil, la región del idioma', () => {
    assert.equal(detectCountry(['es-CO'], 'UTC'), 'CO');
    assert.equal(detectCountry(['en', 'es-419', 'pt-BR'], undefined), 'BR');
    assert.equal(detectCountry(['es'], 'Etc/GMT+3'), null);
  });

  it('la raíz es la Argentina; los países sin versión no llevan link', () => {
    assert.equal(criptoyaUrl('AR'), 'https://criptoya.com/');
    assert.equal(criptoyaUrl('CL'), 'https://criptoya.com/cl');
    assert.equal(criptoyaUrl('UY'), null);
    assert.equal(criptoyaUrl('ES'), null);
    assert.equal(criptoyaUrl(null), null);
  });
});
