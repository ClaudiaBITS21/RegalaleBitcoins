import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { installWay } from '../src/pwa.ts';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 Instagram 389.0.0.49.87',
  iphoneWebview: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 15; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
};

describe('Agregar a la pantalla de inicio', () => {
  it('en iPhone y iPad con Safari, muestra los pasos de Compartir', () => {
    assert.equal(installWay(UA.iphoneSafari, 5), 'ios-safari');
    assert.equal(installWay(UA.ipad, 5), 'ios-safari');
  });

  it('en otros navegadores de iPhone, sugiere abrir el link en Safari', () => {
    for (const ua of [UA.iphoneChrome, UA.iphoneFirefox, UA.iphoneInstagram, UA.iphoneWebview]) assert.equal(installWay(ua, 5), 'ios-otro', ua);
  });

  it('en Android usa el menú del navegador si no hay diálogo nativo', () => {
    assert.equal(installWay(UA.android, 5), 'android');
    assert.equal(installWay(UA.androidFirefox, 5), 'android');
  });

  it('una Mac sin pantalla táctil es una compu, no un iPad', () => {
    assert.equal(installWay(UA.ipad, 0), 'escritorio');
    assert.equal(installWay(UA.mac, 0), 'escritorio');
    assert.equal(installWay(UA.windows, 0), 'escritorio');
  });
});
