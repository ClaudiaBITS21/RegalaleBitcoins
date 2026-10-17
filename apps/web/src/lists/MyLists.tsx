import { deriveListAddress, type Network, parseAccountKey } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import { occasionLabel } from '../content/occasions.ts';
import { formatSats } from '../format.ts';
import { Button, Notice, useI18n } from '../ui.tsx';
import { listApi, listUrl, type OwnedList } from './listApi.ts';

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
