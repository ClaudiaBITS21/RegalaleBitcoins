import { useEffect, useState } from 'preact/hooks';
import { type AdminSummary, ApiFailure, api } from '../api.ts';
import { ALLOW_MAINNET } from '../config.ts';
import { occasionLabel } from '../content/occasions.ts';
import { formatSats, formatUsd, satsToUsd } from '../format.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from '../ui.tsx';
import { AdminAdminsPanel } from './AdminAdmins.tsx';
import { AdminCobroPanel } from './AdminCobro.tsx';
import { AdminCuentasPanel } from './AdminCuentas.tsx';
import { AdminCuponesPanel } from './AdminCupones.tsx';
import { AdminDenunciasPanel } from './AdminDenuncias.tsx';
import { AdminEntregasPanel } from './AdminEntregas.tsx';

// Panel interno de administración (/admin). Solo para los admins. Textos solo en castellano: es
// una herramienta interna, no parte del sitio público. Desde el 23/10 (Claudia) va en secciones
// (resumen, cuentas, entregas, cupones, cobro, denuncias, admins), a lo ancho en la compu y con
// listas en vez de bloques de texto. El resumen sigue siendo de números agregados; las cuentas y
// las entregas muestran el mail de cada cuenta.

const SECCIONES = [
  ['resumen', 'Resumen'],
  ['cuentas', 'Cuentas'],
  ['entregas', 'Entregas'],
  ['cupones', 'Cupones'],
  ['cobro', 'Cobro y precios'],
  ['denuncias', 'Denuncias'],
  ['admins', 'Admins'],
] as const;
type Seccion = (typeof SECCIONES)[number][0];
const seccionDeUrl = (): Seccion => {
  const h = window.location.hash.slice(1);
  return SECCIONES.some(([k]) => k === h) ? (h as Seccion) : 'resumen';
};

const STATE_LABELS: Readonly<Record<string, string>> = {
  esperando: 'Esperando pago',
  en_la_red: 'Pago en camino',
  activo: 'Listos para abrir',
  reclamo_programado: 'Reclamo programado',
  reclamado: 'Reclamados',
  recuperado: 'Recuperados por quien regaló',
  retirado: 'Retirados fuera de la web',
  sin_dato: 'Sin dato de la cadena',
};

const STYLE_LABELS: Readonly<Record<string, string>> = {
  ilustracion: 'Ilustración',
  mano: 'Dibujo a mano',
  elegante: 'Elegante',
  propia: 'Con IA / imagen propia',
  realista: 'Realista',
};
const WEEKDAYS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Tabla de motivos: cuántos se crean, se pagan y se abren por ocasión. */
function Motives({ data, n, pct, usd }: { data: AdminSummary; n: (x: number) => string; pct: (a: number, b: number) => string; usd: (x: number) => string }) {
  return (
    <section class="admin-bloque">
      <h2>Motivos de regalo</h2>
      {data.motivos.length === 0 ? (
        <p class="texto-suave">Todavía nada.</p>
      ) : (
        <div class="admin-tabla-scroll">
          <table class="admin-tabla">
            <thead>
              <tr>
                <th>Ocasión</th>
                <th>Creados</th>
                <th>Pagados</th>
                <th>Abiertos</th>
                <th>% abiertos</th>
                <th>Monto prom.</th>
              </tr>
            </thead>
            <tbody>
              {data.motivos.map((m) => (
                <tr key={m.ocasion}>
                  <td>{occasionLabel(m.ocasion, 'es')}</td>
                  <td>{n(m.creados)}</td>
                  <td>{n(m.pagados)}</td>
                  <td>{n(m.abiertos)}</td>
                  <td>{pct(m.abiertos, m.pagados)}</td>
                  <td>{m.usdPromedio === null ? '—' : usd(m.usdPromedio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.regalos.parcial && <small class="texto-suave">Pagados y abiertos: sobre los {n(data.regalos.muestra)} regalos más recientes.</small>}
    </section>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail?: string | undefined }) {
  return (
    <div class="admin-tile">
      <span class="admin-tile-label">{label}</span>
      <strong class="admin-tile-value">{value}</strong>
      {detail !== undefined && <span class="admin-tile-detail">{detail}</span>}
    </div>
  );
}

/** Barras horizontales simples para un conteo por categoría. */
function Bars({ title, data, label = (k) => k }: { title: string; data: Record<string, number>; label?: (k: string) => string }) {
  const entries = Object.entries(data);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return (
    <section class="admin-bloque">
      <h2>{title}</h2>
      {entries.length === 0 ? (
        <p class="texto-suave">Todavía nada.</p>
      ) : (
        <ul class="admin-barras">
          {entries.map(([k, n]) => (
            <li key={k}>
              <span class="admin-barra-nombre">{label(k)}</span>
              <span class="admin-barra">
                <span class="admin-barra-relleno" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span class="admin-barra-n">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Últimos 30 días: regalos creados por día (columnas). */
function Days({ data }: { data: AdminSummary['porDia'] }) {
  const days: string[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    days.push(d.toISOString().slice(0, 10));
  }
  const max = Math.max(1, ...days.map((d) => data.creados[d] ?? 0));
  return (
    <section class="admin-bloque">
      <h2>Regalos creados, últimos 30 días</h2>
      <div class="admin-dias" role="img" aria-label="Regalos creados por día">
        {days.map((d) => (
          <span key={d} class="admin-dia" title={`${d}: ${data.creados[d] ?? 0} creados, ${data.reclamados[d] ?? 0} reclamados`}>
            <span class="admin-dia-barra" style={{ height: `${((data.creados[d] ?? 0) / max) * 100}%` }} />
          </span>
        ))}
      </div>
    </section>
  );
}

export function AdminPage() {
  const { lang } = useI18n();
  const [seccion, setSeccion] = useState<Seccion>(seccionDeUrl);
  useEffect(() => {
    const onHash = () => setSeccion(seccionDeUrl());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [data, setData] = useState<AdminSummary | null>(null);
  const [error, setError] = useState<'sesion' | 'prohibido' | 'red' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (fresh = false) => {
    setBusy(true);
    try {
      setData(await api.adminSummary(fresh));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiFailure && e.status === 401 ? 'sesion' : e instanceof ApiFailure && e.status === 404 ? 'prohibido' : 'red');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const n = (x: number) => new Intl.NumberFormat(lang).format(x);
  const sats = (s: string) => {
    const v = BigInt(s);
    return data?.usdPorBtc == null ? formatSats(v, lang) : `${formatSats(v, lang)} (≈ ${formatUsd(satsToUsd(v, data.usdPorBtc), lang)})`;
  };
  const pct = (a: number, b: number) => (b === 0 ? '—' : new Intl.NumberFormat(lang, { style: 'percent' }).format(a / b));

  let body;
  if (error === 'sesion') {
    body = (
      <div class="paso">
        <StepTitle>Admin</StepTitle>
        <p>Entrá con tu passkey en "Regalos que hice" y volvé a esta página.</p>
        <Button onClick={() => window.location.assign('/panel')}>Ir a entrar</Button>
      </div>
    );
  } else if (error === 'prohibido') {
    body = <p class="texto-suave">Esta página no existe.</p>;
  } else if (data === null) {
    body = error === 'red' ? <Notice kind="error">No se pudo cargar el resumen.</Notice> : <p class="texto-suave cargando">Cargando…</p>;
  } else {
    const paid = data.regalos.muestra - (data.regalos.porEstado.esperando ?? 0) - (data.regalos.porEstado.sin_dato ?? 0);
    const opened = (data.regalos.porEstado.reclamado ?? 0) + (data.regalos.porEstado.reclamo_programado ?? 0);
    const resumen = (
      <>
        <p class="texto-suave">
          Actualizado {new Date(data.generado).toLocaleString(lang)}.{' '}
          <button type="button" class="boton-texto" disabled={busy} onClick={() => void load(true)}>
            Actualizar ahora
          </button>
        </p>
        <div class="admin-tiles">
          <Tile label="Cuentas" value={n(data.usuarios.total)} detail={`+${n(data.usuarios.ultimos7)} en 7 días · +${n(data.usuarios.ultimos30)} en 30`} />
          <Tile label="Cuentas que regalaron" value={n(data.usuarios.conRegalos)} detail={`${n(data.usuarios.conBoveda)} con passkey y bóveda`} />
          <Tile label="Regalos creados" value={n(data.regalos.total)} detail={`+${n(data.regalos.ultimos7)} en 7 días · ${n(data.regalos.conCuenta)} con cuenta`} />
          <Tile label="Pagados" value={n(paid)} detail={`${pct(paid, data.regalos.muestra)} de los creados`} />
          <Tile label="Abiertos (reclamados)" value={n(opened)} detail={`${pct(opened, paid)} de los pagados`} />
          <Tile label="Recibido en regalos" value={sats(data.sats.recibidos)} detail={`Todavía en regalos: ${sats(data.sats.enRegalos)}`} />
        </div>
        {data.regalos.parcial && <Notice>Estados y montos de los {n(data.regalos.muestra)} regalos más recientes.</Notice>}
        <Days data={data.porDia} />
        <div class="admin-grilla">
        <Bars title="Embudo" data={{ 'Creados': data.regalos.muestra, 'Pagados': paid, 'Abiertos': opened }} />
        {/* De dónde llegan las cuentas nuevas (12 semanas): solo contadores, sin relación con ninguna cuenta. */}
        {data.altas !== undefined && Object.keys(data.altas.porPais).length > 0 && (
          <Bars title="Cuentas nuevas por país (aprox., 12 semanas)" data={data.altas.porPais} label={(k) => (k === 'INT' ? 'Otro país' : k)} />
        )}
        {data.altas !== undefined && Object.keys(data.altas.porOrigen).length > 0 && (
          <Bars title="Cuentas nuevas por origen (12 semanas)" data={data.altas.porOrigen} label={(k) => (k === 'directo' ? 'Directo / sin dato' : k === 'cupon' ? 'Link de cupón o invitación' : k.startsWith('utm:') ? `Campaña «${k.slice(4)}»` : k)} />
        )}
        <Motives data={data} n={n} pct={pct} usd={(x) => formatUsd(x, lang)} />
        {Object.keys(data.ocasionesLibres).length > 0 && <Bars title="Ocasiones escritas a mano (usadas por 3 o más)" data={data.ocasionesLibres} />}
        <div>
          <Bars title="Montos (en dólares al crear el regalo)" data={data.montosUsd.rangos} label={(k) => `US$ ${k}`} />
          <p class="texto-suave">
            Promedio {data.montosUsd.promedio === null ? '—' : formatUsd(data.montosUsd.promedio, lang)} · mediana{' '}
            {data.montosUsd.mediana === null ? '—' : formatUsd(data.montosUsd.mediana, lang)}
          </p>
        </div>
        <Bars title="Estado de los regalos" data={data.regalos.porEstado} label={(k) => STATE_LABELS[k] ?? k} />
        <div>
          <Bars title="Tiempo hasta que lo abren" data={data.tiempoHastaAbrir.rangos} />
          {data.tiempoHastaAbrir.medianaHoras !== null && <p class="texto-suave">Mediana: {n(data.tiempoHastaAbrir.medianaHoras)} h desde que se creó.</p>}
        </div>
        <Bars title="Estilo de tarjeta" data={data.porEstilo} label={(k) => STYLE_LABELS[k] ?? k} />
        <Bars title="Día de la semana (hora de Argentina)" data={data.porDiaSemana} label={(k) => WEEKDAYS[Number(k)] ?? k} />
        <Bars title="Hora del día (Argentina)" data={data.porHora} label={(k) => `${k.padStart(2, '0')} h`} />
        <Bars title="Idioma de quien recibe" data={data.porIdioma} label={(k) => k.toUpperCase()} />
        <Bars title="Moneda elegida" data={data.porMoneda} />
        <Bars title="Regalos por cuenta (quién vuelve a regalar)" data={data.regalosPorCuenta} label={(k) => `${k} regalo${k === '1' ? '' : 's'}`} />
        <section class="admin-bloque">
          <h2>La tarjeta y el reclamo</h2>
          <ul class="admin-lista">
            <li>Con mensaje: {pct(data.tarjeta.conMensaje, data.regalos.total)}{data.tarjeta.largoMensaje !== null && ` (≈ ${n(data.tarjeta.largoMensaje)} caracteres)`}</li>
            <li>Con nombre de quien regala: {pct(data.tarjeta.conRemitente, data.regalos.total)}</li>
            <li>Reclamados por quien recibe: {n(data.reclamos.reclamados)} · recuperados por quien regaló: {n(data.reclamos.recuperados)}</li>
            <li>Reclamos esperando que baje la comisión: {n(data.reclamos.programadosEsperando)}</li>
          </ul>
        </section>
        </div>
        <p class="texto-suave admin-privacidad">
          El resumen es solo de números agregados: no muestra mails, nombres, mensajes ni direcciones. Los textos escritos a mano aparecen solo si los usaron 3 personas o más.
        </p>
      </>
    );
    body = (
      <div class="admin">
        <div class="admin-cabecera">
          <StepTitle>Admin · {data.red}</StepTitle>
          <a class="boton boton-primario" href="/cupones">
            Crear cupones
          </a>
        </div>
        <nav class="admin-secciones" aria-label="Secciones del admin">
          {SECCIONES.map(([k, label]) => (
            <a key={k} href={`#${k}`} class={k === seccion ? 'activa' : undefined} aria-current={k === seccion ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        {seccion === 'resumen' && resumen}
        {seccion === 'cuentas' && <AdminCuentasPanel />}
        {seccion === 'entregas' && <AdminEntregasPanel />}
        {seccion === 'cupones' && <AdminCuponesPanel />}
        {seccion === 'cobro' && <AdminCobroPanel />}
        {seccion === 'denuncias' && <AdminDenunciasPanel />}
        {seccion === 'admins' && <AdminAdminsPanel />}
      </div>
    );
  }
  return (
    <Layout wide testnet={data === null ? !ALLOW_MAINNET : data.red !== 'mainnet'}>
      {body}
    </Layout>
  );
}
