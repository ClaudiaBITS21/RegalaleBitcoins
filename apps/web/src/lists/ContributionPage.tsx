import { useEffect, useState } from 'preact/hooks';
import { ALLOW_MAINNET } from '../config.ts';
import { occasionLabel } from '../content/occasions.ts';
import { formatMinor, formatSats } from '../format.ts';
import { Layout, Notice, StepTitle, useI18n } from '../ui.tsx';
import { type Cobro, LIST_KEY, openCobro } from './cobro.ts';
import { listApi, type MyGift } from './listApi.ts';
import { mostrarDato } from './medios.ts';

// "Mi aporte" (/aporte#<token>): el invitado ve solo su propio regalo a una lista. El token
// va después del # (nunca llega al servidor en la URL) y se borra de la barra al leerlo. En una
// transferencia, el link trae además la clave de la lista (/aporte#<token>.<clave>) para volver a
// mostrar el dato de cobro, que llega cifrado.

export function ContributionPage() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<MyGift | null>(null);
  const [missing, setMissing] = useState(false);
  const [cobro, setCobro] = useState<Cobro | null>(null);

  useEffect(() => {
    const [token = '', key = ''] = window.location.hash.slice(1).split('.');
    if (window.location.hash !== '') history.replaceState(null, '', window.location.pathname);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      setMissing(true);
      return;
    }
    listApi
      .mine(token)
      .then(async (d) => {
        setData(d);
        if (d.tipo !== 'transferencia') return;
        if (d.cobro !== null) setCobro(LIST_KEY.test(key) ? await openCobro(key, d.lista.id, d.cobro) : null);
        else if (d.alias !== null) setCobro({ medio: 'alias', dato: d.alias, titular: d.titular ?? '' });
      })
      .catch(() => setMissing(true));
  }, []);

  let body;
  if (missing) body = <Notice kind="error">{t('lista.mio.noExiste')}</Notice>;
  else if (data === null) body = <p class="texto-suave cargando">{t('reclamo.cargando')}</p>;
  else if (data.tipo === 'transferencia') {
    const stateKey = data.estado === 'convertida' ? 'lista.mio.convertida' : data.estado === 'recibida' ? 'lista.mio.recibida' : 'lista.mio.anunciada';
    body = (
      <div class="paso">
        <StepTitle>{t('lista.mio.titulo')}</StepTitle>
        <div class="caja">
          <p class="tarjeta-ocasion">{occasionLabel(data.lista.ocasion, lang, data.lista.ocasionLibre)}</p>
          <p>
            <strong>{data.lista.titulo}</strong>
          </p>
          <p>{t('lista.mio.montoPesos', { monto: formatMinor(BigInt(data.monto), data.moneda, lang) })}</p>
          {cobro !== null ? (
            <p class="texto-suave">{t('lista.mio.datosPesos', { dato: mostrarDato(cobro.medio, cobro.dato), titular: cobro.titular, codigo: data.codigo })}</p>
          ) : (
            <p class="texto-suave">
              {t('lista.pesos.codigo')}: <span class="mono">{data.codigo}</span>
            </p>
          )}
          {data.nombre !== null && <p class="texto-suave">{t('lista.mio.firmado', { nombre: data.nombre })}</p>}
          {data.mensaje !== '' && <p class="texto-suave">“{data.mensaje}”</p>}
        </div>
        {data.listaPausada && <Notice>{t('lista.revision')}</Notice>}
        <Notice kind={data.estado === 'anunciada' ? 'info' : 'ok'}>{t(stateKey, { sats: data.satsConvertidos === null ? '' : formatSats(BigInt(data.satsConvertidos), lang) })}</Notice>
        {data.estado === 'convertida' && data.tanda !== null && data.tanda.aportes > 1 && (
          <small class="texto-suave">{t('lista.mio.tanda', { total: formatSats(BigInt(data.tanda.sats), lang), n: String(data.tanda.aportes) })}</small>
        )}
        <small class="texto-suave">{t('lista.mio.pesosAviso')}</small>
      </div>
    );
  } else {
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
