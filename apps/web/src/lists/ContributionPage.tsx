import { useEffect, useState } from 'preact/hooks';
import { ALLOW_MAINNET } from '../config.ts';
import { occasionLabel } from '../content/occasions.ts';
import { formatSats } from '../format.ts';
import { Layout, Notice, StepTitle, useI18n } from '../ui.tsx';
import { listApi, type MyContribution } from './listApi.ts';

// "Mi aporte" (/aporte#<token>): el invitado ve solo su propio regalo a una lista. El token
// va después del # (nunca llega al servidor en la URL) y se borra de la barra al leerlo.

export function ContributionPage() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<MyContribution | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (token !== '') history.replaceState(null, '', window.location.pathname);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      setMissing(true);
      return;
    }
    listApi
      .mine(token)
      .then(setData)
      .catch(() => setMissing(true));
  }, []);

  let body;
  if (missing) body = <Notice kind="error">{t('lista.mio.noExiste')}</Notice>;
  else if (data === null) body = <p class="texto-suave cargando">{t('reclamo.cargando')}</p>;
  else {
    const stateKey = data.estado === 'recibido' ? 'lista.mio.recibido' : data.estado === 'en_la_red' ? 'lista.mio.enCamino' : 'lista.mio.esperando';
    body = (
      <div class="paso">
        <StepTitle>{t('lista.mio.titulo')}</StepTitle>
        <div class="caja">
          <p class="tarjeta-ocasion">{occasionLabel(data.lista.ocasion, lang, data.lista.ocasionLibre)}</p>
          <p>
            <strong>{data.lista.titulo}</strong>
          </p>
          <p>{t('lista.mio.monto', { monto: formatSats(BigInt(data.satsDeclarados), lang) })}</p>
          {data.nombre !== null && <p class="texto-suave">{t('lista.mio.firmado', { nombre: data.nombre })}</p>}
          {data.mensaje !== '' && <p class="texto-suave">“{data.mensaje}”</p>}
        </div>
        <Notice kind={data.estado === 'recibido' ? 'ok' : 'info'}>{t(stateKey, { llego: formatSats(BigInt(data.recibidos), lang) })}</Notice>
      </div>
    );
  }
  return <Layout testnet={!ALLOW_MAINNET}>{body}</Layout>;
}
