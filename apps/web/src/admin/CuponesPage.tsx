import { useEffect, useState } from 'preact/hooks';
import { signIn } from '../account.ts';
import { ApiFailure, api, type AdminCoupon, type AdminCouponBatch } from '../api.ts';
import { PRODUCT_NAME } from '../comprar.tsx';
import { occasionLabel } from '../content/occasions.ts';
import { formatSats } from '../format.ts';
import { translate } from '../i18n/index.ts';

// Cupones (handoff 2026-10-21, «cupones»): página aparte, instalable en el celular como «Cupones»
// (cupones.html con su propio manifest). Solo admins. Herramienta interna: solo en castellano. El
// diseño sigue el prototipo de Cowork: tickets en 2 columnas o una lista, filtros, compartir,
// copiar, pausar. Crear, pausar o reactivar pide la passkey (el servidor lo exige).
// Además (Claudia, 21/10): cupones para un mail y lotes (N códigos sueltos o uno por cada mail de
// un CSV), cada código con su link de invitación; el lote se baja como CSV para mandarlo.

type Filtro = 'vigentes' | 'pausados' | 'terminados' | 'todos';
type Vista = 'cupones' | 'lista';

const PLANES = ['pack10', 'pack10_lista', 'anual', 'fundador'] as const;
const OCASIONES = ['', 'navidad', 'reyes', 'dianino', 'cumple', 'bautismo', 'casamiento', 'babyshower', 'diamadre', 'diapadre'] as const;
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VISTA_KEY = 'cupones-vista';
/** En todo texto, la dirección del sitio es siempre esta (CLAUDE.md). */
const SITIO = 'https://regalalebitcoin.com';
const linkInvitacion = (codigo: string) => `${SITIO}/invitacion/${codigo}`;

/** Celda de CSV: entre comillas si hace falta y sin fórmulas (una celda que empieza con = + - @). */
const celda = (v: string) => {
  const s = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function bajarCsv(nombre: string, filas: ReadonlyArray<{ codigo: string; email: string | null; usado?: boolean }>) {
  const lineas = ['email,codigo,link,usado', ...filas.map((f) => [f.email ?? '', f.codigo, linkInvitacion(f.codigo), f.usado === true ? 'si' : 'no'].map(celda).join(','))];
  const url = URL.createObjectURL(new Blob([`${lineas.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `cupones-${nombre.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'lote'}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Los mails de un CSV o de un texto pegado: cualquier cosa con forma de mail, sin repetir. */
export function mailsDe(texto: string): string[] {
  const encontrados = texto.toLowerCase().match(/[^\s@,;<>"'()]+@[^\s@,;<>"'()]+\.[a-z]{2,}/g) ?? [];
  return [...new Set(encontrados)];
}

function estadoLote(l: AdminCouponBatch): { clave: Exclude<Filtro, 'todos'>; texto: string; activo?: true } {
  const now = Date.now();
  if (l.hasta !== null && new Date(l.hasta).getTime() <= now) return { clave: 'terminados', texto: 'Vencido' };
  if (l.usados >= l.total) return { clave: 'terminados', texto: 'Agotado' };
  if (l.activos === 0) return { clave: 'pausados', texto: 'Pausado' };
  if (l.desde !== null && new Date(l.desde).getTime() > now) return { clave: 'vigentes', texto: `Empieza el ${fechaCorta(l.desde)}` };
  return { clave: 'vigentes', texto: 'Activo', activo: true };
}

const nombrePlan = (id: string) => {
  const key = PRODUCT_NAME[id];
  return key === undefined ? id : translate('es', key);
};
const nombreOcasion = (id: string) => occasionLabel(id, 'es');
const listaY = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
const fechaCorta = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}${d.getFullYear() !== new Date().getFullYear() ? `/${String(d.getFullYear()).slice(2)}` : ''}`;
};
const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoy = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
/** El último día cuenta entero: «hasta el 6/1» vence al empezar el 7/1. */
const finDelDia = (dia: string) => {
  const d = new Date(`${dia}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d;
};
/** «Hasta» se guarda exclusivo (el día siguiente a las 0): se muestra el día anterior. */
const ultimoDia = (iso: string) => new Date(new Date(iso).getTime() - 1).toISOString();

function estado(c: AdminCoupon): { clave: Exclude<Filtro, 'todos'>; texto: string; activo?: true } {
  const now = Date.now();
  if (c.hasta !== null && new Date(c.hasta).getTime() <= now) return { clave: 'terminados', texto: 'Vencido' };
  if (c.usados >= c.maxUsos) return { clave: 'terminados', texto: 'Agotado' };
  if (!c.activo) return { clave: 'pausados', texto: 'Pausado' };
  if (new Date(c.desde).getTime() > now) return { clave: 'vigentes', texto: `Empieza el ${fechaCorta(c.desde)}` };
  return { clave: 'vigentes', texto: 'Activo', activo: true };
}

interface Borrador {
  readonly descuento: number | null;
  readonly productos: readonly string[];
  readonly da: { readonly unidad: 'regalo' | 'lista_otras'; readonly cantidad: number; readonly ocasion: string | null } | null;
}

function queDa(c: Borrador): string {
  const partes: string[] = [];
  if (c.descuento !== null) {
    const pl = c.productos.length > 0 ? listaY(c.productos.map(nombrePlan)) : 'todos los planes';
    partes.push(c.descuento === 100 ? `${pl} gratis` : `${c.descuento} % de descuento en ${pl}`);
  }
  if (c.da !== null) {
    const n = c.da.cantidad;
    const base = c.da.unidad === 'regalo' ? (n === 1 ? '1 regalo gratis' : `${n} regalos gratis`) : n === 1 ? '1 lista gratis' : `${n} listas gratis`;
    partes.push(c.da.ocasion === null ? base : `${base} para ${nombreOcasion(c.da.ocasion)}`);
  }
  const t = partes.join(' más ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function textoCompartir(c: AdminCoupon): string {
  if (c.email !== null) return `Te regalo un código para Regalale Bitcoin: ${queDa(c).charAt(0).toLowerCase()}${queDa(c).slice(1)}. Entrá acá para usarlo: ${linkInvitacion(c.codigo)}`;
  const donde = c.descuento !== null ? 'al comprar un plan en regalalebitcoin.com/precios' : 'en regalalebitcoin.com, en «Mi plan», opción «Tengo un código»';
  const que = queDa(c);
  const vale = c.hasta === null ? '' : ` Vale hasta el ${fechaCorta(ultimoDia(c.hasta))}.`;
  return `Usá el código ${c.codigo} ${donde}: ${que.charAt(0).toLowerCase()}${que.slice(1)}.${vale}`;
}

const claseTipo = (c: AdminCoupon) => (c.descuento !== null && c.da !== null ? 't-combo' : c.descuento !== null ? 't-plan' : c.da?.unidad === 'regalo' ? 't-regalo' : 't-lista');

const errorTexto = (e: unknown): string => {
  if (!(e instanceof ApiFailure)) return 'No se pudo completar.';
  if (e.code === 'cupon_existente') return 'Ya existe un cupón con ese código. Elegí otro.';
  if (e.code === 'passkey_requerida') return 'Hace falta confirmar con tu passkey.';
  if (e.code === 'pedido_invalido') return 'Revisá los datos del cupón.';
  if (e.code === 'lote_invalido') return 'Revisá el lote: nombre, prefijo (hasta 12 letras o números) y de 1 a 2000 cupones.';
  return 'No se pudo completar.';
};

/** Hace la acción; si el servidor pide passkey (sesión abierta por link), la pide y reintenta. */
async function conPasskey<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof ApiFailure && e.code === 'passkey_requerida')) throw e;
    await signIn();
    return fn();
  }
}

export function CuponesPage() {
  const [cupones, setCupones] = useState<AdminCoupon[] | null>(null);
  const [lotes, setLotes] = useState<AdminCouponBatch[]>([]);
  const [acceso, setAcceso] = useState<'cargando' | 'afuera' | 'sinPermiso' | 'adentro'>('cargando');
  const [filtro, setFiltro] = useState<Filtro>('vigentes');
  const [vista, setVista] = useState<Vista>(() => {
    try {
      return localStorage.getItem(VISTA_KEY) === 'lista' ? 'lista' : 'cupones';
    } catch {
      return 'cupones';
    }
  });
  const [hoja, setHoja] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Cupones · Regalale Bitcoin';
  }, []);

  const cargar = async () => {
    try {
      const r = await api.adminCoupons();
      setCupones(r.cupones);
      setLotes(r.lotes);
      setAcceso('adentro');
    } catch (e) {
      setAcceso(e instanceof ApiFailure && e.status === 401 ? 'afuera' : e instanceof ApiFailure && e.status === 404 ? 'sinPermiso' : 'adentro');
      if (!(e instanceof ApiFailure && (e.status === 401 || e.status === 404))) setError('No se pudieron cargar los cupones.');
    }
  };
  useEffect(() => {
    void cargar();
  }, []);

  const avisar = (m: string) => {
    setAviso(m);
    window.setTimeout(() => setAviso((a) => (a === m ? null : a)), 2200);
  };
  const copiar = (t: string, m: string) => navigator.clipboard.writeText(t).then(() => avisar(m), () => avisar('No se pudo copiar'));
  const compartir = (c: AdminCoupon) => {
    const text = textoCompartir(c);
    if (typeof navigator.share === 'function') navigator.share({ text }).catch(() => undefined);
    else void copiar(text, 'Texto copiado para compartir');
  };
  const pausar = async (c: AdminCoupon) => {
    try {
      await conPasskey(() => api.adminCouponActive(c.codigo, !c.activo));
      await cargar();
      avisar(c.activo ? 'Cupón pausado' : 'Cupón reactivado');
    } catch (e) {
      setError(errorTexto(e));
    }
  };
  const csvLote = async (l: AdminCouponBatch) => {
    try {
      bajarCsv(l.nombre, (await api.adminBatch(l.id)).cupones);
    } catch (e) {
      setError(errorTexto(e));
    }
  };
  const pausarLote = async (l: AdminCouponBatch) => {
    const pausar = l.activos > 0;
    try {
      await conPasskey(() => api.adminBatchActive(l.id, !pausar));
      await cargar();
      avisar(pausar ? 'Lote pausado' : 'Lote reactivado');
    } catch (e) {
      setError(errorTexto(e));
    }
  };
  const cambiarVista = (v: Vista) => {
    setVista(v);
    try {
      localStorage.setItem(VISTA_KEY, v);
    } catch {
      // Sin almacenamiento: la vista vale para esta visita.
    }
  };

  if (acceso === 'cargando') return <p class="cupones-vacio">…</p>;
  if (acceso === 'afuera' || acceso === 'sinPermiso') {
    return (
      <div class="cupones-app">
        <Cabecera />
        <main class="cupones-main">
          <p class="cupones-vacio">{acceso === 'afuera' ? 'Entrá con tu passkey para ver los cupones.' : 'Esta cuenta no es admin.'}</p>
          {acceso === 'afuera' && (
            <button
              type="button"
              class="cupones-principal"
              onClick={() => {
                signIn().then(() => cargar(), () => setError('No se pudo entrar.'));
              }}
            >
              Entrar con mi passkey
            </button>
          )}
          {error !== null && <p class="cupones-error">{error}</p>}
        </main>
      </div>
    );
  }

  const visibles = (cupones ?? []).filter((c) => filtro === 'todos' || estado(c).clave === filtro);
  const lotesVisibles = lotes.filter((l) => filtro === 'todos' || estadoLote(l).clave === filtro);
  return (
    <div class="cupones-app">
      <Cabecera onNuevo={() => setHoja(true)} />
      <main class="cupones-main">
        {error !== null && <p class="cupones-error">{error}</p>}
        <div class="cupones-filtros" role="group" aria-label="Filtrar cupones">
          {(
            [
              ['vigentes', 'Vigentes'],
              ['pausados', 'Pausados'],
              ['terminados', 'Vencidos o agotados'],
              ['todos', 'Todos'],
            ] as const
          ).map(([f, nombre]) => (
            <button key={f} type="button" class="cupones-filtro" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
              {nombre}
            </button>
          ))}
        </div>
        <div class="cupones-vista-barra">
          <span class="cupones-ayuda" aria-live="polite">
            {visibles.length === 1 ? '1 cupón' : `${visibles.length} cupones`}
            {lotesVisibles.length > 0 && (lotesVisibles.length === 1 ? ' · 1 lote' : ` · ${lotesVisibles.length} lotes`)}
          </span>
          <div class="cupones-vista" role="group" aria-label="Ver como">
            <button type="button" aria-pressed={vista === 'cupones'} onClick={() => cambiarVista('cupones')}>
              Cupones
            </button>
            <button type="button" aria-pressed={vista === 'lista'} onClick={() => cambiarVista('lista')}>
              Lista
            </button>
          </div>
        </div>
        {visibles.length === 0 && lotesVisibles.length > 0 ? null : visibles.length === 0 ? (
          <p class="cupones-vacio">{filtro === 'vigentes' ? 'No hay cupones vigentes. Creá uno con «Nuevo cupón».' : 'No hay cupones en esta lista.'}</p>
        ) : (
          <div class={`cupones-lista ${vista === 'lista' ? 'renglones' : 'grilla'}`}>
            {visibles.map((c) =>
              vista === 'lista' ? (
                <Renglon key={c.codigo} c={c} onCompartir={compartir} onCopiar={(t) => copiar(t, 'Código copiado')} onPausar={pausar} />
              ) : (
                <Ticket key={c.codigo} c={c} onCompartir={compartir} onCopiar={(t) => copiar(t, 'Código copiado')} onPausar={pausar} />
              ),
            )}
          </div>
        )}
        {lotesVisibles.length > 0 && (
          <>
            <h2 class="cupones-seccion">Lotes</h2>
            <div class="cupones-lista renglones">
              {lotesVisibles.map((l) => (
                <Lote key={l.id} l={l} onCsv={csvLote} onPausar={pausarLote} />
              ))}
            </div>
          </>
        )}
      </main>
      {hoja && (
        <Hoja
          existentes={(cupones ?? []).map((c) => c.codigo)}
          onCerrar={() => setHoja(false)}
          onCreado={async (codigo) => {
            setHoja(false);
            await cargar();
            setFiltro('todos');
            avisar(`Cupón ${codigo} creado`);
          }}
          onLote={async (nombre, creados) => {
            setHoja(false);
            bajarCsv(nombre, creados);
            await cargar();
            setFiltro('todos');
            avisar(`Lote «${nombre}» creado: ${creados.length} cupones. Bajó el CSV con los links.`);
          }}
        />
      )}
      {aviso !== null && (
        <div class="cupones-toast" role="status">
          {aviso}
        </div>
      )}
    </div>
  );
}

function Cabecera({ onNuevo }: { onNuevo?: () => void }) {
  return (
    <header class="cupones-cabecera">
      <h1>
        Cupones<small>Regalale Bitcoin</small>
      </h1>
      {onNuevo !== undefined && (
        <button type="button" class="cupones-nuevo" onClick={onNuevo}>
          Nuevo cupón
        </button>
      )}
    </header>
  );
}

interface Acciones {
  readonly c: AdminCoupon;
  readonly onCompartir: (c: AdminCoupon) => void;
  readonly onCopiar: (codigo: string) => void;
  readonly onPausar: (c: AdminCoupon) => void;
}

function BotonesAcciones({ c, onCompartir, onCopiar, onPausar, corto }: Acciones & { corto: boolean }) {
  const e = estado(c);
  return (
    <div class="cupones-acciones">
      <button type="button" class="cupones-accion" onClick={() => onCompartir(c)}>
        Compartir
      </button>
      <button type="button" class="cupones-accion" onClick={() => onCopiar(c.codigo)}>
        {corto ? 'Copiar' : 'Copiar código'}
      </button>
      {e.clave !== 'terminados' && (
        <button type="button" class="cupones-accion" onClick={() => onPausar(c)}>
          {c.activo ? 'Pausar' : 'Reactivar'}
        </button>
      )}
    </div>
  );
}

/** Cuántos lo usaron, en qué planes y cuántos sats se dejaron de cobrar. */
function Usos({ c }: { c: AdminCoupon }) {
  const planes = Object.entries(c.porProducto).map(([p, n]) => `${nombrePlan(p)} ${n}`);
  return (
    <>
      <span>
        {c.usados} de {c.maxUsos} {c.maxUsos === 1 ? 'persona lo usó' : 'personas lo usaron'}
        {c.reservados > 0 && ` · ${c.reservados} en pago`}
      </span>
      {(planes.length > 0 || c.satsResignados !== '0') && (
        <span>
          {planes.length > 0 && `${planes.join(', ')} · `}
          {formatSats(BigInt(c.satsResignados), 'es')} resignados
        </span>
      )}
    </>
  );
}

function Ticket(props: Acciones) {
  const { c } = props;
  const e = estado(c);
  const pct = Math.min(100, Math.round((c.usados / c.maxUsos) * 100));
  const nombreU = c.da === null ? '' : c.da.unidad === 'regalo' ? (c.da.cantidad === 1 ? 'regalo' : 'regalos') : c.da.cantidad === 1 ? 'lista' : 'listas';
  const valor = c.descuento !== null ? (c.descuento === 100 ? 'Gratis' : `${c.descuento}%`) : `+${c.da?.cantidad ?? 0}`;
  const sub = c.descuento !== null ? (c.descuento === 100 ? 'plan' : 'off') : nombreU;
  return (
    <article class={`cupones-ticket ${claseTipo(c)}${e.activo ? '' : ' apagado'}`}>
      <div class="ticket-talon">
        <div class="ticket-valor">
          <span>{valor}</span>
          <small>{sub}</small>
        </div>
        {c.descuento !== null && c.da !== null && <span class="ticket-extra">{`+${c.da.cantidad} ${nombreU}`}</span>}
      </div>
      <div class="ticket-cuerpo">
        <div class="ticket-codigo">
          {c.codigo}
          <span class={`cupones-estado${e.activo ? ' activo' : ''}`}>{e.texto}</span>
        </div>
        <div class="ticket-que">{queDa(c)}</div>
        <div class="ticket-meta">
          {c.email !== null && <span class="ticket-mail">Para {c.email}</span>}
          <span>{c.hasta === null ? `Desde el ${fechaCorta(c.desde)}` : `Del ${fechaCorta(c.desde)} al ${fechaCorta(ultimoDia(c.hasta))}`}</span>
          <Usos c={c} />
        </div>
        <div class="cupones-barra" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      <BotonesAcciones {...props} corto />
    </article>
  );
}

function Renglon(props: Acciones) {
  const { c } = props;
  const e = estado(c);
  const [abierto, setAbierto] = useState(false);
  return (
    <article class={`cupones-renglon ${claseTipo(c)}${e.activo ? '' : ' apagado'}`}>
      <button type="button" class="renglon-cab" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        <span class="r-marca" aria-hidden="true" />
        <span class="r-cuerpo">
          <span>
            <b>{c.codigo}</b>
            <span class={`cupones-estado${e.activo ? ' activo' : ''}`}>{e.texto}</span>
          </span>
          <small>
            {queDa(c)}
            {c.hasta !== null && `, hasta el ${fechaCorta(ultimoDia(c.hasta))}`}
          </small>
        </span>
        <span class="r-usos" aria-label={`${c.usados} de ${c.maxUsos} personas`}>
          {c.usados}/{c.maxUsos}
        </span>
      </button>
      {abierto && (
        <>
          <div class="ticket-meta renglon-meta">
            {c.email !== null && <span class="ticket-mail">Para {c.email}</span>}
            <Usos c={c} />
            {c.nota !== '' && <span class="ticket-nota">{c.nota}</span>}
          </div>
          <BotonesAcciones {...props} corto={false} />
        </>
      )}
    </article>
  );
}

function Lote({ l, onCsv, onPausar }: { l: AdminCouponBatch; onCsv: (l: AdminCouponBatch) => void; onPausar: (l: AdminCouponBatch) => void }) {
  const e = estadoLote(l);
  const [abierto, setAbierto] = useState(false);
  const tipo = l.descuento !== null && l.da !== null ? 't-combo' : l.descuento !== null ? 't-plan' : l.da?.unidad === 'regalo' ? 't-regalo' : 't-lista';
  return (
    <article class={`cupones-renglon ${tipo}${e.activo ? '' : ' apagado'}`}>
      <button type="button" class="renglon-cab" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        <span class="r-marca" aria-hidden="true" />
        <span class="r-cuerpo">
          <span>
            <b>{l.nombre}</b>
            <span class={`cupones-estado${e.activo ? ' activo' : ''}`}>{e.texto}</span>
          </span>
          <small>
            {queDa(l)}
            {l.hasta !== null && `, hasta el ${fechaCorta(ultimoDia(l.hasta))}`}
          </small>
        </span>
        <span class="r-usos" aria-label={`${l.usados} de ${l.total} cupones usados`}>
          {l.usados}/{l.total}
        </span>
      </button>
      {abierto && (
        <>
          <div class="ticket-meta renglon-meta">
            <span>
              {l.total} {l.total === 1 ? 'cupón' : 'cupones'} de un solo uso
              {l.conMail > 0 ? `, ${l.conMail === l.total ? 'cada uno para un mail' : `${l.conMail} con mail`}` : ', sueltos'}
            </span>
            <span>
              Creado el {fechaCorta(l.creado)} por {l.creadoPor}
            </span>
            {l.nota !== '' && <span class="ticket-nota">{l.nota}</span>}
          </div>
          <div class="cupones-acciones">
            <button type="button" class="cupones-accion" onClick={() => onCsv(l)}>
              Bajar CSV con links
            </button>
            {e.clave !== 'terminados' && (
              <button type="button" class="cupones-accion" onClick={() => onPausar(l)}>
                {l.activos > 0 ? 'Pausar el lote' : 'Reactivar el lote'}
              </button>
            )}
          </div>
        </>
      )}
    </article>
  );
}

type Para = 'todos' | 'mail' | 'lote';

function Hoja({
  existentes,
  onCerrar,
  onCreado,
  onLote,
}: {
  existentes: string[];
  onCerrar: () => void;
  onCreado: (codigo: string) => Promise<void>;
  onLote: (nombre: string, creados: Array<{ codigo: string; email: string | null }>) => Promise<void>;
}) {
  const [para, setPara] = useState<Para>('todos');
  const [email, setEmail] = useState('');
  const [nombreLote, setNombreLote] = useState('');
  const [prefijo, setPrefijo] = useState('');
  const [conMails, setConMails] = useState(true);
  const [csv, setCsv] = useState('');
  const [cantidadLote, setCantidadLote] = useState(50);
  const [codigo, setCodigo] = useState('');
  const [conDescuento, setConDescuento] = useState(true);
  const [conCreditos, setConCreditos] = useState(false);
  const [planes, setPlanes] = useState<string[]>([]);
  const [pct, setPct] = useState(21);
  const [unidad, setUnidad] = useState<'regalo' | 'lista_otras'>('regalo');
  const [cantidad, setCantidad] = useState(5);
  const [ocasion, setOcasion] = useState('');
  const [desde, setDesde] = useState(isoDia(hoy()));
  const [hasta, setHasta] = useState(() => {
    const d = hoy();
    d.setMonth(d.getMonth() + 1);
    return isoDia(d);
  });
  const [usos, setUsos] = useState(100);
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const borrador: Borrador = {
    descuento: conDescuento ? pct : null,
    productos: PLANES.filter((p) => planes.includes(p)),
    da: conCreditos ? { unidad, cantidad, ocasion: ocasion === '' ? null : ocasion } : null,
  };
  const generar = () => {
    const a = crypto.getRandomValues(new Uint32Array(8));
    setCodigo(Array.from(a, (n) => ALFABETO[n % ALFABETO.length]).join(''));
  };
  const rapida = (fn: () => [Date, Date]) => {
    const [a, b] = fn();
    setDesde(isoDia(a));
    setHasta(isoDia(b));
  };
  const mails = mailsDe(csv);
  const leerArchivo = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (file === undefined) return;
    if (file.size > 2_000_000) return setError('El archivo es muy grande (hasta 2 MB).');
    void file.text().then(setCsv);
  };
  const validar = (): string => {
    const c = codigo.trim().toUpperCase();
    if (para === 'lote') {
      if (nombreLote.trim() === '') return 'Poné un nombre para el lote.';
      if (!/^[A-Z0-9]{0,12}$/.test(prefijo.trim().toUpperCase())) return 'El prefijo va sin espacios: hasta 12 letras o números.';
      if (conMails && mails.length === 0) return 'No encontramos mails: subí el CSV o pegá la lista.';
      if (conMails && mails.length > 2000) return `Son ${mails.length} mails: el máximo por lote es 2000.`;
      if (!conMails && !(cantidadLote >= 1 && cantidadLote <= 2000)) return 'La cantidad de cupones va de 1 a 2000.';
    } else {
      if (!/^[A-Z0-9]{4,20}$/.test(c)) return 'El código tiene que tener de 4 a 20 letras o números, sin espacios.';
      if (existentes.includes(c)) return `Ya existe un cupón ${c}. Elegí otro código.`;
      if (para === 'mail' && mailsDe(email).length !== 1) return 'Escribí un mail.';
    }
    if (!conDescuento && !conCreditos) return 'Marcá qué da el cupón: descuento, regalos o listas, o las dos cosas.';
    if (conDescuento && !(pct >= 1 && pct <= 100)) return 'El descuento va de 1 % a 100 %.';
    if (conCreditos && !(cantidad >= 1 && cantidad <= 100)) return 'La cantidad va de 1 a 100.';
    if (desde === '' || hasta === '') return 'Completá desde y hasta.';
    if (hasta < desde) return 'La fecha de fin es anterior a la de inicio.';
    if (finDelDia(hasta) <= new Date()) return 'La fecha de fin ya pasó.';
    if (para === 'todos' && !(usos >= 1)) return 'Poné al menos 1 persona.';
    return '';
  };
  const crear = async () => {
    const err = validar();
    if (err !== '') return setError(err);
    setBusy(true);
    setError('');
    const c = codigo.trim().toUpperCase();
    const condiciones = {
      descuento: borrador.descuento,
      productos: [...borrador.productos],
      da: borrador.da,
      desde: new Date(`${desde}T00:00:00`).toISOString(),
      hasta: finDelDia(hasta).toISOString(),
      nota,
    };
    try {
      if (para === 'lote') {
        const lote = { ...condiciones, nombre: nombreLote.trim(), prefijo: prefijo.trim().toUpperCase() };
        const r = await conPasskey(() => api.adminCreateBatch(conMails ? { ...lote, emails: mails } : { ...lote, cantidad: cantidadLote }));
        await onLote(lote.nombre, r.cupones);
        return;
      }
      await conPasskey(() => api.adminCreateCoupon({ ...condiciones, codigo: c, maxUsos: para === 'mail' ? 1 : usos, ...(para === 'mail' ? { email: mailsDe(email)[0] as string } : {}) }));
      await onCreado(c);
    } catch (e) {
      setError(errorTexto(e));
    } finally {
      setBusy(false);
    }
  };
  const que = `${queDa(borrador).charAt(0).toLowerCase()}${queDa(borrador).slice(1)}`;
  const n = conMails ? mails.length : cantidadLote;
  const resumen =
    para === 'lote'
      ? [`Lote «${nombreLote.trim() || 'sin nombre'}»: ${n === 1 ? '1 cupón' : `${n} cupones`} de un solo uso${conMails ? ', uno por mail' : ''}, cada uno con su link de invitación: ${que}`]
      : [`${codigo.trim().toUpperCase() || 'Tu código'}: ${que}`];
  if (desde !== '' && hasta !== '') resumen.push(`del ${fechaCorta(`${desde}T00:00:00`)} al ${fechaCorta(`${hasta}T00:00:00`)}`);
  if (para === 'mail') resumen.push(`solo para ${email.trim() || 'ese mail'}, una vez`);
  else if (para === 'todos' && usos >= 1) resumen.push(`para ${usos === 1 ? '1 persona' : `hasta ${usos} personas`}`);

  return (
    <>
      <div class="cupones-velo" onClick={onCerrar} />
      <section class="cupones-hoja" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo">
        <h2 id="hoja-titulo">Nuevo cupón</h2>
        <div class="cupones-grupo">
          <span class="cupones-titulo">¿Para quién?</span>
          <div class="cupones-segmento tres" role="group" aria-label="¿Para quién?">
            {(
              [
                ['todos', 'Cualquiera'],
                ['mail', 'Un mail'],
                ['lote', 'Lote'],
              ] as const
            ).map(([p, nombre]) => (
              <button key={p} type="button" aria-pressed={para === p} onClick={() => setPara(p)}>
                {nombre}
              </button>
            ))}
          </div>
          <span class="cupones-ayuda">
            {para === 'todos'
              ? 'Un código para compartir: lo usa quien lo tenga, una vez por cuenta.'
              : para === 'mail'
                ? 'Solo lo puede usar la cuenta con ese mail, una vez. Si todavía no tiene cuenta, sirve cuando la cree.'
                : 'Muchos cupones de un solo uso, cada uno con su link de invitación. Al crearlo baja un CSV con mail, código y link.'}
          </span>
        </div>
        {para === 'mail' && (
          <div class="cupones-grupo">
            <label for="cupon-mail">Mail</label>
            <input id="cupon-mail" type="text" inputMode="email" autocomplete="off" spellcheck={false} placeholder="nombre@ejemplo.com" value={email} onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} />
          </div>
        )}
        {para === 'lote' && (
          <>
            <div class="cupones-grupo">
              <label for="lote-nombre">Nombre del lote</label>
              <input id="lote-nombre" type="text" maxLength={80} placeholder="Amigos del meetup" value={nombreLote} onInput={(e) => setNombreLote((e.currentTarget as HTMLInputElement).value)} />
            </div>
            <div class="cupones-grupo">
              <label for="lote-prefijo">Prefijo de los códigos (opcional)</label>
              <input
                id="lote-prefijo"
                type="text"
                class="cupones-codigo-campo"
                maxLength={12}
                autocomplete="off"
                autocapitalize="characters"
                spellcheck={false}
                placeholder="MEETUP"
                value={prefijo}
                onInput={(e) => setPrefijo((e.currentTarget as HTMLInputElement).value)}
              />
              <span class="cupones-ayuda">Cada código es el prefijo más 8 letras o números al azar, por ejemplo {prefijo.trim().toUpperCase() || 'MEETUP'}K7Q2HX9M.</span>
            </div>
            <div class="cupones-grupo">
              <span class="cupones-titulo">Códigos</span>
              <div class="cupones-segmento" role="group" aria-label="Códigos">
                <button type="button" aria-pressed={conMails} onClick={() => setConMails(true)}>
                  Uno por mail (CSV)
                </button>
                <button type="button" aria-pressed={!conMails} onClick={() => setConMails(false)}>
                  Sueltos
                </button>
              </div>
            </div>
            {conMails ? (
              <div class="cupones-grupo">
                <label for="lote-csv">Mails</label>
                <input type="file" accept=".csv,.txt,text/csv,text/plain" aria-label="Subir CSV" onChange={(e) => leerArchivo(e.currentTarget as HTMLInputElement)} />
                <textarea id="lote-csv" rows={4} placeholder="O pegá los mails acá, uno por renglón o separados por comas" value={csv} onInput={(e) => setCsv((e.currentTarget as HTMLTextAreaElement).value)} />
                <span class="cupones-ayuda">
                  {mails.length === 0 ? 'Del CSV se toma todo lo que tenga forma de mail; lo demás se ignora.' : `${mails.length === 1 ? '1 mail' : `${mails.length} mails`} sin repetir. Pueden ser de personas que todavía no tienen cuenta: el código queda esperando ese mail.`}
                </span>
              </div>
            ) : (
              <div class="cupones-grupo">
                <label for="lote-cantidad">Cuántos cupones</label>
                <input id="lote-cantidad" type="number" min={1} max={2000} inputMode="numeric" value={cantidadLote} onInput={(e) => setCantidadLote(Math.floor(Number((e.currentTarget as HTMLInputElement).value)))} />
              </div>
            )}
          </>
        )}
        {para !== 'lote' && (
        <div class="cupones-grupo">
          <label for="cupon-codigo">Código</label>
          <div class="cupones-fila">
            <input
              id="cupon-codigo"
              type="text"
              class="cupones-codigo-campo"
              maxLength={20}
              autocomplete="off"
              autocapitalize="characters"
              spellcheck={false}
              placeholder="NAVIDAD21"
              value={codigo}
              onInput={(e) => setCodigo((e.currentTarget as HTMLInputElement).value)}
            />
            <button type="button" class="cupones-boton2" onClick={generar}>
              Generar
            </button>
          </div>
          <span class="cupones-ayuda">Letras y números, de 4 a 20. Mayúsculas o minúsculas da igual.</span>
        </div>
        )}
        <div class="cupones-grupo">
          <span class="cupones-titulo">¿Qué da?</span>
          <div class="cupones-segmento" role="group" aria-label="¿Qué da?">
            <button type="button" aria-pressed={conDescuento} onClick={() => setConDescuento(!conDescuento)}>
              Descuento en planes
            </button>
            <button type="button" aria-pressed={conCreditos} onClick={() => setConCreditos(!conCreditos)}>
              Regalos o listas gratis
            </button>
          </div>
          <span class="cupones-ayuda">Podés marcar uno o los dos.</span>
        </div>
        {conDescuento && (
          <>
            <div class="cupones-grupo">
              <span class="cupones-titulo">Planes</span>
              <div class="cupones-chips" role="group" aria-label="Planes">
                {PLANES.map((p) => (
                  <button key={p} type="button" class="cupones-chip" aria-pressed={planes.includes(p)} onClick={() => setPlanes(planes.includes(p) ? planes.filter((x) => x !== p) : [...planes, p])}>
                    {nombrePlan(p)}
                  </button>
                ))}
              </div>
              <span class="cupones-ayuda">Si no marcás ninguno, vale para todos.</span>
            </div>
            <div class="cupones-grupo">
              <label for="cupon-pct">Descuento</label>
              <div class="cupones-porcentaje">
                <input id="cupon-pct" type="range" min={1} max={100} value={pct} onInput={(e) => setPct(Number((e.currentTarget as HTMLInputElement).value))} />
                <output for="cupon-pct">{pct}%</output>
              </div>
              <div class="cupones-chips">
                {[10, 21, 50, 100].map((n) => (
                  <button key={n} type="button" class="cupones-chip" aria-pressed={pct === n} onClick={() => setPct(n)}>
                    {n}%
                  </button>
                ))}
              </div>
              <span class="cupones-ayuda">Con 100 % el plan sale gratis y se acredita sin pago.</span>
            </div>
          </>
        )}
        {conCreditos && (
          <>
            <div class="cupones-grupo">
              <span class="cupones-titulo">Qué regala</span>
              <div class="cupones-segmento" role="group" aria-label="Qué regala">
                <button type="button" aria-pressed={unidad === 'regalo'} onClick={() => setUnidad('regalo')}>
                  Regalos
                </button>
                <button type="button" aria-pressed={unidad === 'lista_otras'} onClick={() => setUnidad('lista_otras')}>
                  Listas
                </button>
              </div>
            </div>
            <div class="cupones-grupo">
              <span class="cupones-titulo">Cada persona recibe</span>
              <div class="cupones-contador" role="group" aria-label="Cada persona recibe">
                <button type="button" aria-label="Uno menos" onClick={() => setCantidad(Math.max(1, cantidad - 1))}>
                  −
                </button>
                <input type="number" min={1} max={100} value={cantidad} aria-label="Cantidad" onInput={(e) => setCantidad(Math.floor(Number((e.currentTarget as HTMLInputElement).value)))} />
                <button type="button" aria-label="Uno más" onClick={() => setCantidad(Math.min(100, cantidad + 1))}>
                  +
                </button>
              </div>
              <span class="cupones-ayuda">Se suman como créditos a la cuenta de quien lo usa y no vencen. Si el cupón también tiene descuento, se suman cuando se confirma la compra.</span>
            </div>
            <div class="cupones-grupo">
              <span class="cupones-titulo">Para qué ocasión</span>
              <div class="cupones-chips" role="group" aria-label="Para qué ocasión">
                {OCASIONES.map((o) => (
                  <button key={o} type="button" class="cupones-chip" aria-pressed={ocasion === o} onClick={() => setOcasion(o)}>
                    {o === '' ? 'Cualquiera' : nombreOcasion(o)}
                  </button>
                ))}
              </div>
              <span class="cupones-ayuda">Con una ocasión elegida, esos créditos solo sirven para regalos o listas de esa ocasión.</span>
            </div>
          </>
        )}
        <div class="cupones-grupo">
          <span class="cupones-titulo">Vigencia</span>
          <div class="cupones-fila">
            <label class="cupones-ayuda">
              Desde
              <input type="date" value={desde} onInput={(e) => setDesde((e.currentTarget as HTMLInputElement).value)} />
            </label>
            <label class="cupones-ayuda">
              Hasta
              <input type="date" value={hasta} onInput={(e) => setHasta((e.currentTarget as HTMLInputElement).value)} />
            </label>
          </div>
          <div class="cupones-chips">
            <button
              type="button"
              class="cupones-chip"
              onClick={() =>
                rapida(() => {
                  const b = hoy();
                  b.setMonth(b.getMonth() + 1);
                  return [hoy(), b];
                })
              }
            >
              Un mes
            </button>
            <button
              type="button"
              class="cupones-chip"
              onClick={() =>
                rapida(() => {
                  const h = hoy();
                  const y = h.getMonth() === 0 && h.getDate() <= 6 ? h.getFullYear() - 1 : h.getFullYear();
                  const a = new Date(y, 11, 1);
                  return [a < h ? h : a, new Date(y + 1, 0, 6)];
                })
              }
            >
              Navidad y Reyes
            </button>
            <button type="button" class="cupones-chip" onClick={() => rapida(() => [hoy(), new Date(hoy().getFullYear(), 11, 31)])}>
              Hasta fin de año
            </button>
          </div>
        </div>
        {para === 'todos' && (
        <div class="cupones-grupo">
          <label for="cupon-usos">Cuántas personas pueden usarlo</label>
          <input id="cupon-usos" type="number" min={1} max={100000} inputMode="numeric" value={usos} onInput={(e) => setUsos(Math.floor(Number((e.currentTarget as HTMLInputElement).value)))} />
          <span class="cupones-ayuda">Cada cuenta lo puede usar una sola vez.</span>
        </div>
        )}
        <div class="cupones-grupo">
          <label for="cupon-nota">Nota interna</label>
          <textarea id="cupon-nota" maxLength={140} placeholder="Para qué es, dónde se repartió…" value={nota} onInput={(e) => setNota((e.currentTarget as HTMLTextAreaElement).value)} />
        </div>
        <div class="cupones-resumen" aria-live="polite">
          {resumen.join(', ')}.
        </div>
        <div class="cupones-error" role="alert">
          {error}
        </div>
        <button type="button" class="cupones-principal" disabled={busy} onClick={() => void crear()}>
          {busy ? 'Confirmá con tu passkey…' : para === 'lote' ? 'Crear lote y bajar CSV' : 'Crear cupón'}
        </button>
      </section>
    </>
  );
}
