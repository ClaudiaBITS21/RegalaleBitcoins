import { useEffect, useState } from 'preact/hooks';
import { type AdminSummary, ApiFailure, api } from '../api.ts';
import { ALLOW_MAINNET } from '../config.ts';
import { occasionLabel } from '../content/occasions.ts';
import { formatSats, formatUsd, satsToUsd } from '../format.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from '../ui.tsx';

// Panel interno de administración (/admin). Solo para los mails de ADMIN_EMAILS; muestra
// números agregados, nunca datos de las personas ni de los regalos. Textos solo en castellano:
// es una herramienta interna, no parte del sitio público.

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
    body = (
      <div class="admin">
        <StepTitle>Admin · {data.red}</StepTitle>
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
        <Bars title="Estado de los regalos" data={data.regalos.porEstado} label={(k) => STATE_LABELS[k] ?? k} />
        <Bars title="Ocasiones" data={data.porOcasion} label={(k) => occasionLabel(k, 'es')} />
        <Bars title="Idioma de quien recibe" data={data.porIdioma} label={(k) => k.toUpperCase()} />
        <Bars title="Moneda elegida" data={data.porMoneda} />
      </div>
    );
  }
  return <Layout testnet={data === null ? !ALLOW_MAINNET : data.red !== 'mainnet'}>{body}</Layout>;
}
