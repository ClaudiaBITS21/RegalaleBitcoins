import { deriveListAddress, type Network, parseAccountKey } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import { occasionLabel } from '../content/occasions.ts';
import { formatArsExact, formatSats, parseAmount } from '../format.ts';
import { Button, Notice, useI18n } from '../ui.tsx';
import { listApi, listUrl, type OwnedList, type Transfer } from './listApi.ts';

// "Mis listas" en el panel: cada lista con su link, lo que llegó y quién regaló qué. El
// navegador vuelve a derivar cada dirección desde la llave pública: si el servidor mostrara
// una dirección que no es de tu billetera, se avisa en rojo.

function addressIsMine(list: OwnedList, network: Network, index: number, address: string): boolean {
  try {
    return deriveListAddress(parseAccountKey(list.xpub, network), index).address === address;
  } catch {
    return false;
  }
}

/** Una transferencia en pesos: quien armó la lista la marca recibida y, al comprar, convertida. */
function TransferRow({ listId, tr, onDone }: { listId: string; tr: Transfer; onDone: () => void }) {
  const { t, lang } = useI18n();
  const [converting, setConverting] = useState(false);
  const [sats, setSats] = useState('');
  const [failed, setFailed] = useState(false);
  const parsed = parseAmount(sats, lang, 0);
  const satsOk = parsed.ok && parsed.value > 0n;
  const mark = (estado: 'recibida' | 'convertida', value?: bigint) => {
    setFailed(false);
    listApi
      .mark(listId, tr.codigo, estado, value?.toString())
      .then(onDone)
      .catch(() => setFailed(true));
  };
  return (
    <li>
      <span class="lista-aporte-quien">
        <span class="mono">{tr.codigo}</span> · {tr.nombre ?? t('lista.panel.anonimo')}
      </span>
      <span class="lista-aporte-monto">{tr.estado === 'convertida' && tr.satsConvertidos !== null ? formatSats(BigInt(tr.satsConvertidos), lang) : formatArsExact(tr.montoArs, lang)}</span>
      <span class={`etiqueta-estado estado-${tr.estado}`}>{t(`lista.transf.${tr.estado}`)}</span>
      {tr.mensaje !== '' && <span class="lista-aporte-mensaje">“{tr.mensaje}”</span>}
      {tr.estado === 'anunciada' && (
        <span class="lista-aporte-acciones">
          <button type="button" class="boton boton-contorno boton-chico" onClick={() => mark('recibida')}>
            {t('lista.transf.marcarRecibida')}
          </button>
        </span>
      )}
      {tr.estado === 'recibida' &&
        (converting ? (
          <form
            class="lista-aporte-acciones"
            onSubmit={(e) => {
              e.preventDefault();
              if (parsed.ok && satsOk) mark('convertida', parsed.value);
            }}
          >
            <input type="text" inputMode="numeric" placeholder={t('lista.transf.sats')} aria-label={t('lista.transf.sats')} value={sats} onInput={(e) => setSats((e.currentTarget as HTMLInputElement).value)} />
            <button type="submit" class="boton boton-chico" disabled={!satsOk}>
              {satsOk && parsed.ok ? t('lista.transf.confirmarSats', { sats: formatSats(parsed.value, lang) }) : t('lista.transf.marcarConvertida')}
            </button>
          </form>
        ) : (
          <span class="lista-aporte-acciones">
            <button type="button" class="boton boton-contorno boton-chico" onClick={() => setConverting(true)}>
              {t('lista.transf.marcarConvertida')}
            </button>
          </span>
        ))}
      {failed && <small class="error-campo">{t('regalar.error')}</small>}
    </li>
  );
}

export function MyLists({ network }: { network: Network | null }) {
  const { t, lang } = useI18n();
  const [lists, setLists] = useState<readonly OwnedList[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () =>
    listApi
      .owned()
      .then((r) => setLists(r.listas))
      .catch(() => setFailed(true));
  useEffect(() => {
    void load();
  }, []);

  if (failed) return <Notice kind="error">{t('reclamo.sinRed')}</Notice>;
  if (lists === null || network === null) return null;
  return (
    <section class="mis-listas">
      <h2>{t('lista.panel.titulo')}</h2>
      {lists.length === 0 ? (
        <div class="caja">
          <p>{t('lista.panel.vacio')}</p>
          <a class="boton boton-rosa" href="/listas/nueva">
            {t('menu.lista')}
          </a>
        </div>
      ) : (
        lists.map((l) => {
          const bad = l.aportes.filter((a) => !addressIsMine(l, network, a.indice, a.direccion));
          return (
            <article class="caja lista-panel" key={l.id}>
              <p class="kicker tarjeta-ocasion">{occasionLabel(l.ocasion, lang, l.ocasionLibre)}</p>
              <strong>{l.titulo}</strong>
              <p class="mono enlace-regalo" translate={false}>
                {listUrl(l.id)}
              </p>
              <p>{t(l.aportes.length === 1 ? 'lista.panel.total1' : 'lista.panel.total', { total: formatSats(BigInt(l.totalRecibido), lang), n: l.aportes.length })}</p>
              {bad.length > 0 && <Notice kind="error">{t('lista.panel.direccionAjena')}</Notice>}
              {l.aportes.length > 0 && (
                <ul class="lista-aportes">
                  {l.aportes.map((a) => (
                    <li key={a.indice}>
                      <span class="lista-aporte-quien">{a.nombre ?? t('lista.panel.anonimo')}</span>
                      <span class="lista-aporte-monto">
                        {a.recibidos !== null && BigInt(a.recibidos) > 0n ? formatSats(BigInt(a.recibidos), lang) : t('lista.panel.prometido', { monto: formatSats(BigInt(a.satsDeclarados), lang) })}
                      </span>
                      <span class={`etiqueta-estado estado-${a.estado ?? 'sin-dato'}`}>{t(a.estado === 'recibido' ? 'lista.estado.recibido' : a.estado === 'en_la_red' ? 'lista.estado.enCamino' : 'lista.estado.esperando')}</span>
                      {a.mensaje !== '' && <span class="lista-aporte-mensaje">“{a.mensaje}”</span>}
                    </li>
                  ))}
                </ul>
              )}
              {l.alias !== null && (
                <div class="lista-transferencias">
                  <h3>{t('lista.transf.titulo')}</h3>
                  <p class="texto-suave">{t('lista.transf.alias', { alias: l.alias })}</p>
                  {l.transferencias.length === 0 ? (
                    <p class="texto-suave">{t('lista.transf.vacio')}</p>
                  ) : (
                    <ul class="lista-aportes">
                      {l.transferencias.map((tr) => (
                        <TransferRow key={tr.codigo} listId={l.id} tr={tr} onDone={() => void load()} />
                      ))}
                    </ul>
                  )}
                  <small class="texto-suave">{t('lista.transf.compromiso')}</small>
                </div>
              )}
              {l.abierta ? (
                <Button kind="contorno" onClick={() => void listApi.close(l.id).then(load)}>
                  {t('lista.panel.cerrar')}
                </Button>
              ) : (
                <p class="texto-suave">{t('lista.panel.cerradaTexto')}</p>
              )}
            </article>
          );
        })
      )}
      <small class="texto-suave">{t('lista.panel.gap')}</small>
    </section>
  );
}
