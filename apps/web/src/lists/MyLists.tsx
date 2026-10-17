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

/** Reparto de una compra en proporción a los pesos (mismo cálculo que la API, para mostrarlo antes). */
function split(sats: bigint, cents: readonly bigint[]): bigint[] {
  const total = cents.reduce((x, y) => x + y, 0n);
  if (total === 0n) return cents.map(() => 0n);
  const shares = cents.map((c) => (sats * c) / total);
  let left = sats - shares.reduce((x, y) => x + y, 0n);
  const order = cents.map((c, i) => ({ i, r: (sats * c) % total })).sort((p, q) => (q.r > p.r ? 1 : q.r < p.r ? -1 : p.i - q.i));
  for (const { i } of order) {
    if (left === 0n) break;
    shares[i] = (shares[i] as bigint) + 1n;
    left -= 1n;
  }
  return shares;
}

const centsOf = (ars: number) => BigInt(Math.round(ars * 100));

/**
 * Una transferencia en pesos. Anunciada → "Ya me llegó"; recibida → se puede elegir para una
 * compra; convertida → muestra su parte de la compra.
 */
function TransferRow({ listId, tr, picked, onPick, onDone }: { listId: string; tr: Transfer; picked: boolean; onPick: (on: boolean) => void; onDone: () => void }) {
  const { t, lang } = useI18n();
  const [failed, setFailed] = useState(false);
  return (
    <li>
      <span class="lista-aporte-quien">
        {tr.estado === 'recibida' && (
          <input type="checkbox" class="tanda-elegir" checked={picked} aria-label={t('lista.tanda.elegir', { codigo: tr.codigo })} onChange={(e) => onPick((e.currentTarget as HTMLInputElement).checked)} />
        )}
        <span class="mono">{tr.codigo}</span> · {tr.nombre ?? t('lista.panel.anonimo')}
      </span>
      <span class="lista-aporte-monto">
        {formatArsExact(tr.montoArs, lang)}
        {tr.estado === 'convertida' && tr.satsConvertidos !== null && <small class="texto-suave"> → {formatSats(BigInt(tr.satsConvertidos), lang)}</small>}
      </span>
      <span class={`etiqueta-estado estado-${tr.estado}`}>{t(`lista.transf.${tr.estado}`)}</span>
      {tr.mensaje !== '' && <span class="lista-aporte-mensaje">“{tr.mensaje}”</span>}
      {tr.estado === 'anunciada' && (
        <span class="lista-aporte-acciones">
          <button
            type="button"
            class="boton boton-contorno boton-chico"
            onClick={() => {
              setFailed(false);
              listApi
                .mark(listId, tr.codigo, 'recibida')
                .then(onDone)
                .catch(() => setFailed(true));
            }}
          >
            {t('lista.transf.marcarRecibida')}
          </button>
        </span>
      )}
      {failed && <small class="error-campo">{t('regalar.error')}</small>}
    </li>
  );
}

/** Las transferencias de una lista y la compra en tanda: elegir recibidas, cargar los sats comprados, repartir. */
function Transfers({ list, onDone }: { list: OwnedList; onDone: () => void }) {
  const { t, lang } = useI18n();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [sats, setSats] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const chosen = list.transferencias.filter((tr) => tr.estado === 'recibida' && picked.has(tr.codigo));
  const parsed = parseAmount(sats, lang, 0);
  const total = parsed.ok && parsed.value >= BigInt(Math.max(1, chosen.length)) ? parsed.value : null;
  const shares = total === null ? [] : split(total, chosen.map((tr) => centsOf(tr.montoArs)));
  const pesos = chosen.reduce((x, tr) => x + tr.montoArs, 0);
  const received = list.transferencias.some((tr) => tr.estado === 'recibida');

  const buy = () => {
    if (total === null || chosen.length === 0) return;
    setBusy(true);
    setFailed(false);
    listApi
      .tanda(list.id, chosen.map((tr) => tr.codigo), total.toString())
      .then(() => {
        setPicked(new Set());
        setSats('');
        onDone();
      })
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };

  return (
    <div class="lista-transferencias">
      <h3>{t('lista.transf.titulo')}</h3>
      <p class="texto-suave">{t('lista.transf.alias', { alias: list.alias ?? '' })}</p>
      {list.transferencias.length === 0 ? (
        <p class="texto-suave">{t('lista.transf.vacio')}</p>
      ) : (
        <ul class="lista-aportes">
          {list.transferencias.map((tr) => (
            <TransferRow
              key={tr.codigo}
              listId={list.id}
              tr={tr}
              picked={picked.has(tr.codigo)}
              onPick={(on) =>
                setPicked((p) => {
                  const n = new Set(p);
                  if (on) n.add(tr.codigo);
                  else n.delete(tr.codigo);
                  return n;
                })
              }
              onDone={onDone}
            />
          ))}
        </ul>
      )}
      {received && (
        <form
          class="caja tanda"
          onSubmit={(e) => {
            e.preventDefault();
            buy();
          }}
        >
          <strong>{t('lista.tanda.titulo')}</strong>
          <p class="texto-suave">{chosen.length === 0 ? t('lista.tanda.texto') : t(chosen.length === 1 ? 'lista.tanda.elegida1' : 'lista.tanda.elegidas', { n: String(chosen.length), pesos: formatArsExact(pesos, lang) })}</p>
          {chosen.length > 0 && (
            <>
              <label class="campo">
                <span>{t('lista.tanda.sats')}</span>
                <input type="text" inputMode="numeric" autocomplete="off" value={sats} onInput={(e) => setSats((e.currentTarget as HTMLInputElement).value)} />
              </label>
              {total !== null && (
                <ul class="tanda-reparto">
                  {chosen.map((tr, i) => (
                    <li key={tr.codigo}>
                      <span class="mono">{tr.codigo}</span> <span>{formatArsExact(tr.montoArs, lang)}</span> → <strong>{formatSats(shares[i] as bigint, lang)}</strong>
                    </li>
                  ))}
                </ul>
              )}
              <Button type="submit" disabled={busy || total === null}>
                {total === null ? t('lista.tanda.cta0') : t('lista.tanda.cta', { sats: formatSats(total, lang), n: String(chosen.length) })}
              </Button>
            </>
          )}
          {failed && <Notice kind="error">{t('regalar.error')}</Notice>}
        </form>
      )}
      <small class="texto-suave">{t('lista.transf.compromiso')}</small>
    </div>
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
              {l.alias !== null && <Transfers list={l} onDone={() => void load()} />}
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
