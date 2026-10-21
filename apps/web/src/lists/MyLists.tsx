import { deriveListAddress, masterRootFromMnemonic, type Network, parseAccountKey } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import { occasionLabel } from '../content/occasions.ts';
import { formatMinor, formatSats, parseAmount } from '../format.ts';
import type { Key } from '../i18n/index.ts';
import { Button, Notice, useI18n } from '../ui.tsx';
import { type Cobro, LIST_KEY, localListKey, newListKey, openCobro, sealCobro, wrapKeyFor } from './cobro.ts';
import { checkCobro, CobroFields, type CobroDraft, emptyCobro } from './CobroFields.tsx';
import { listApi, listUrl, type OwnedList, type Transfer } from './listApi.ts';
import { mostrarDato, type Pais } from './medios.ts';

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

/** Reparto de una compra en proporción a los montos (mismo cálculo que la API, para mostrarlo antes). */
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


/**
 * Una transferencia en pesos. Anunciada → "Ya me llegó"; recibida → se puede elegir para una
 * compra; convertida → muestra su parte de la compra.
 */
function TransferRow({ listId, currency, tr, picked, onPick, onDone }: { listId: string; currency: string; tr: Transfer; picked: boolean; onPick: (on: boolean) => void; onDone: () => void }) {
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
        {formatMinor(BigInt(tr.monto), currency, lang)}
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
function Transfers({ list, cobro, onDone }: { list: OwnedList; cobro: Cobro | null; onDone: () => void }) {
  const { t, lang } = useI18n();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [sats, setSats] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const chosen = list.transferencias.filter((tr) => tr.estado === 'recibida' && picked.has(tr.codigo));
  const parsed = parseAmount(sats, lang, 0);
  const total = parsed.ok && parsed.value >= BigInt(Math.max(1, chosen.length)) ? parsed.value : null;
  const currency = list.moneda ?? 'ARS';
  const shares = total === null ? [] : split(total, chosen.map((tr) => BigInt(tr.monto)));
  const pesos = chosen.reduce((x, tr) => x + BigInt(tr.monto), 0n);
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
      {cobro !== null && <p class="texto-suave">{t('lista.transf.alias', { dato: mostrarDato(cobro.medio, cobro.dato) })}</p>}
      {list.transferencias.length === 0 ? (
        <p class="texto-suave">{t('lista.transf.vacio')}</p>
      ) : (
        <ul class="lista-aportes">
          {list.transferencias.map((tr) => (
            <TransferRow
              key={tr.codigo}
              listId={list.id}
              currency={currency}
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
          <p class="texto-suave">{chosen.length === 0 ? t('lista.tanda.texto') : t(chosen.length === 1 ? 'lista.tanda.elegida1' : 'lista.tanda.elegidas', { n: String(chosen.length), pesos: formatMinor(pesos, currency, lang) })}</p>
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
                      <span class="mono">{tr.codigo}</span> <span>{formatMinor(BigInt(tr.monto), currency, lang)}</span> → <strong>{formatSats(shares[i] as bigint, lang)}</strong>
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

/**
 * Datos de cobro de una lista en el panel (handoff 21/10, «listas por país»): la clave se busca en
 * este navegador, o en la cuenta (envuelta con la clave maestra: se abre con la passkey), o se
 * pide el link completo. Con la clave se ve el link para compartir y el dato. «Volver a cargar»
 * genera una clave nueva: el link ya compartido sigue sirviendo para bitcoin, no para el dato.
 */
function ListCobro({ list, master, onUnlock, onCobro, onDone }: { list: OwnedList; master: string | null; onUnlock: () => Promise<string | null>; onCobro: (c: Cobro | null) => void; onDone: () => void }) {
  const { t } = useI18n();
  const [key, setKey] = useState<string | null>(() => localListKey.get(list.id));
  const [cobro, setCobro] = useState<Cobro | null>(null);
  const [pasted, setPasted] = useState('');
  const [pasteFailed, setPasteFailed] = useState(false);
  const [editing, setEditing] = useState(list.alias !== null && list.cobro === null);
  const [draft, setDraft] = useState<CobroDraft>(() => emptyCobro((list.pais as Pais | null) ?? 'AR'));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const unwrapWith = async (m: string) => {
    if (list.claveCifrada === null) return null;
    return (await wrapKeyFor(masterRootFromMnemonic(m).privateKey as Uint8Array)).unwrap(list.claveCifrada, list.id);
  };
  // Con la clave maestra en memoria, la clave guardada en la cuenta se abre sola.
  useEffect(() => {
    if (key !== null || master === null) return;
    void unwrapWith(master).then((k) => {
      if (k === null) return;
      localListKey.set(list.id, k);
      setKey(k);
    });
  }, [master]);
  useEffect(() => {
    if (key === null || list.cobro === null) return setCobro(list.alias === null ? null : { medio: 'alias', dato: list.alias, titular: list.aliasTitular ?? '' });
    void openCobro(key, list.id, list.cobro).then(setCobro);
  }, [key, list.cobro]);
  useEffect(() => onCobro(cobro), [cobro]);

  const save = async () => {
    const checked = checkCobro(draft);
    if (!checked.ok) return;
    setBusy(true);
    setFailed(false);
    try {
      const k = newListKey();
      const m = master ?? (await onUnlock().catch(() => null));
      const clave = m === null ? null : await (await wrapKeyFor(masterRootFromMnemonic(m).privateKey as Uint8Array)).wrap(k, list.id);
      await listApi.setCobro(list.id, { pais: draft.pais, moneda: checked.moneda, cobro: await sealCobro(k, list.id, checked.cobro), clave });
      localListKey.set(list.id, k);
      setKey(k);
      setEditing(false);
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <form
        class="caja formulario lista-cobro"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {list.alias !== null && list.cobro === null && <Notice>{t('lista.panel.recargarViejo')}</Notice>}
        <CobroFields value={draft} onChange={setDraft} />
        {(list.cobro !== null || list.alias !== null) && <small class="texto-suave">{t('lista.panel.recargarAviso')}</small>}
        {failed && <Notice kind="error">{t('regalar.error')}</Notice>}
        <Button type="submit" disabled={busy || !checkCobro(draft).ok}>
          {t('lista.panel.guardarDatos')}
        </Button>
        {list.cobro !== null && (
          <button type="button" class="boton-texto" onClick={() => setEditing(false)}>
            {t('lista.panel.cancelar')}
          </button>
        )}
      </form>
    );
  }
  if (list.cobro === null) return null;
  if (key === null) {
    return (
      <div class="caja lista-cobro">
        {list.claveCifrada !== null && (
          <Button kind="contorno" disabled={busy} onClick={() => void onUnlock().then(async (m) => {
            const k = m === null ? null : await unwrapWith(m);
            if (k === null) return;
            localListKey.set(list.id, k);
            setKey(k);
          })}>
            {t('lista.panel.verLinkCompleto')}
          </Button>
        )}
        <form
          class="formulario"
          onSubmit={(e) => {
            e.preventDefault();
            const k = pasted.trim().split('#')[1] ?? '';
            setPasteFailed(false);
            if (!LIST_KEY.test(k)) return setPasteFailed(true);
            void openCobro(k, list.id, list.cobro as string).then((c) => {
              if (c === null) return setPasteFailed(true);
              localListKey.set(list.id, k);
              setKey(k);
            });
          }}
        >
          <label class="campo">
            <span>{t('lista.panel.sinClave')}</span>
            <input type="url" placeholder={t('lista.panel.pegarLink')} value={pasted} onInput={(e) => setPasted((e.currentTarget as HTMLInputElement).value)} />
          </label>
          {pasteFailed && <small class="error-campo">{t('lista.panel.linkNoAbre')}</small>}
          <Button kind="contorno" type="submit" disabled={pasted.trim() === ''}>
            {t('lista.panel.usarLink')}
          </Button>
        </form>
        <button type="button" class="boton-texto" onClick={() => setEditing(true)}>
          {t('lista.panel.recargar')}
        </button>
      </div>
    );
  }
  const full = listUrl(list.id, key);
  return (
    <div class="caja lista-cobro">
      <p>{t('lista.panel.linkCompleto')}</p>
      <p class="mono enlace-regalo" translate={false}>
        {full}
      </p>
      <Button kind="contorno" onClick={() => void navigator.clipboard.writeText(full).then(() => setCopied(true), () => undefined)}>
        {copied ? t('regalar.pagar.copiado') : t('lista.copiar')}
      </Button>
      {cobro !== null && (
        <p class="texto-suave">
          {t(`lista.medio.${cobro.medio}` as Key)}: {mostrarDato(cobro.medio, cobro.dato)} · {cobro.titular} · {list.moneda}
        </p>
      )}
      <button type="button" class="boton-texto" onClick={() => setEditing(true)}>
        {t('lista.panel.recargar')}
      </button>
    </div>
  );
}

/** Transferencias de una lista: sus datos de cobro (con la clave) y la tanda. */
function ListMoney({ list, master, onUnlock, onDone }: { list: OwnedList; master: string | null; onUnlock: () => Promise<string | null>; onDone: () => void }) {
  const [cobro, setCobro] = useState<Cobro | null>(null);
  return (
    <>
      <ListCobro list={list} master={master} onUnlock={onUnlock} onCobro={setCobro} onDone={onDone} />
      <Transfers list={list} cobro={cobro} onDone={onDone} />
    </>
  );
}

export function MyLists({ network, master = null, onUnlock = async () => null }: { network: Network | null; master?: string | null; onUnlock?: () => Promise<string | null> }) {
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
              {l.estado !== 'activa' && (
                <div class="caja lista-pausada">
                  <Notice kind={l.estado === 'pausada' ? 'error' : 'info'}>{t(l.estado === 'pausada' ? 'lista.panel.pausada' : l.estado === 'en_revision' ? 'lista.panel.enRevision' : 'lista.panel.baja')}</Notice>
                  {l.denuncias.map((d) => (
                    <p class="texto-suave" key={d.creada}>
                      {t('lista.panel.motivo', { motivo: d.motivo })}
                    </p>
                  ))}
                  {l.puedeReactivar && (
                    <>
                      <small class="texto-suave">{t('lista.panel.reactivarTexto')}</small>
                      <Button kind="contorno" onClick={() => void listApi.reactivate(l.id).then(load)}>
                        {t('lista.panel.reactivar')}
                      </Button>
                    </>
                  )}
                </div>
              )}
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
              {l.moneda !== null && <ListMoney list={l} master={master} onUnlock={onUnlock} onDone={() => void load()} />}
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
