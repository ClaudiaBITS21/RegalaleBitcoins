import { useEffect, useState } from 'preact/hooks';
import { ALLOW_MAINNET } from '../config.ts';
import { occasionLabel } from '../content/occasions.ts';
import { formatMinor, formatSats } from '../format.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from '../ui.tsx';
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
  const [token, setToken] = useState('');

  useEffect(() => {
    const [token = '', key = ''] = window.location.hash.slice(1).split('.');
    setToken(token);
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
        {data.estado === 'no_llego' ? (
          <NotArrived codigo={data.codigo} quedan={data.avisosQuedan ?? 0} token={token} onDone={() => void listApi.mine(token).then(setData)} />
        ) : (
          <Notice kind={data.estado === 'anunciada' ? 'info' : 'ok'}>{t(stateKey, { sats: data.satsConvertidos === null ? '' : formatSats(BigInt(data.satsConvertidos), lang) })}</Notice>
        )}
        {data.estado === 'convertida' && data.tanda !== null && data.tanda.aportes > 1 && (
          <small class="texto-suave">{t('lista.mio.tanda', { total: formatSats(BigInt(data.tanda.sats), lang), n: String(data.tanda.aportes) })}</small>
        )}
        {data.estado === 'convertida' && data.compra?.corregida != null && (
          <small class="texto-suave">{t('lista.mio.corregida', { fecha: new Date(data.compra.corregida).toLocaleDateString(lang, { day: 'numeric', month: 'numeric' }) })}</small>
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

/**
 * Quien armó la lista no encontró la transferencia (handoff 21/10): el invitado revisa con su banco
 * y puede volver a avisar, con una nota, hasta 3 veces.
 */
function NotArrived({ codigo, quedan, token, onDone }: { codigo: string; quedan: number; token: string; onDone: () => void }) {
  const { t } = useI18n();
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div class="caja">
      <Notice kind="error">{t('lista.mio.noLlego', { codigo })}</Notice>
      {quedan > 0 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setFailed(false);
            listApi
              .remind(token, nota.trim())
              .then(onDone)
              .catch(() => setFailed(true))
              .finally(() => setBusy(false));
          }}
        >
          <label class="campo">
            <span>{t('lista.mio.reavisoNota')}</span>
            <input type="text" maxLength={140} placeholder={t('lista.mio.reavisoEjemplo')} value={nota} onInput={(e) => setNota((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <Button type="submit" disabled={busy}>
            {t('lista.mio.reaviso')}
          </Button>
          <small class="texto-suave">{t(quedan === 1 ? 'lista.mio.reavisoQuedan1' : 'lista.mio.reavisoQuedan', { n: String(quedan) })}</small>
          {failed && <small class="error-campo">{t('regalar.error')}</small>}
        </form>
      ) : (
        <p class="texto-suave">{t('lista.mio.reavisoSinMas')}</p>
      )}
    </div>
  );
}
