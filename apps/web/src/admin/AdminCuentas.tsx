import { useEffect, useState } from 'preact/hooks';
import { type AdminAccount, type AdminUser, api } from '../api.ts';
import { Button, Notice, useI18n } from '../ui.tsx';
import { AccountCard, errorText, UNIDADES } from './AdminCobro.tsx';

// Cuentas (Claudia, 23/10): todas en una lista, con buscador. Tocar una fila abre su ficha (qué
// tiene, últimos movimientos) y el ajuste manual de créditos para esa cuenta.

export function AdminCuentasPanel() {
  const { lang } = useI18n();
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ total: number; usuarios: AdminUser[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const load = (texto = q) =>
    api
      .adminUsers(texto.trim())
      .then((d) => (setData(d), setError(null)))
      .catch((e: unknown) => setError(errorText(e)));
  useEffect(() => {
    void load('');
  }, []);
  // Buscar mientras se escribe, con una pausa corta.
  useEffect(() => {
    const id = window.setTimeout(() => void load(q), 300);
    return () => window.clearTimeout(id);
  }, [q]);

  const fecha = (iso: string) => new Date(iso).toLocaleDateString(lang);
  const n = (x: number) => new Intl.NumberFormat(lang).format(x);

  return (
    <section class="admin-bloque">
      <div class="admin-cabecera-seccion">
        <h2>Cuentas{data !== null && <span class="admin-contador"> · {n(data.total)}</span>}</h2>
        <input class="admin-buscar" type="search" placeholder="Buscar por mail" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
      </div>
      {error !== null && <Notice kind="error">{error}</Notice>}
      {data === null ? (
        <p class="texto-suave cargando">Cargando…</p>
      ) : data.usuarios.length === 0 ? (
        <p class="texto-suave">No hay cuentas{q.trim() !== '' && ' con ese mail'}.</p>
      ) : (
        <div class="admin-tabla-scroll">
          <table class="admin-tabla admin-tabla-filas">
            <thead>
              <tr>
                <th>Mail</th>
                <th>Alta</th>
                <th>Passkey</th>
                <th>Regalos hechos</th>
                <th>Listas</th>
                <th>Compras</th>
                <th>Le quedan</th>
              </tr>
            </thead>
            <tbody>
              {data.usuarios.map((u) => (
                <Fila key={u.email} u={u} abierta={abierta === u.email} onToggle={() => setAbierta(abierta === u.email ? null : u.email)} fecha={fecha} n={n} onChanged={() => void load()} />
              ))}
            </tbody>
          </table>
          {data.usuarios.length < data.total && q.trim() === '' && <p class="texto-suave">Se muestran las {n(data.usuarios.length)} más recientes; buscá por mail para ver otras.</p>}
        </div>
      )}
    </section>
  );
}

function Fila({ u, abierta, onToggle, fecha, n, onChanged }: { u: AdminUser; abierta: boolean; onToggle: () => void; fecha: (iso: string) => string; n: (x: number) => string; onChanged: () => void }) {
  const quedan = [`${n(u.saldoRegalos)} regalos`, u.saldoListas !== 0 ? `${n(u.saldoListas)} listas` : null, u.plan ? 'plan vigente' : null].filter((x) => x !== null).join(' · ');
  return (
    <>
      <tr class={`admin-fila${abierta ? ' abierta' : ''}`} onClick={onToggle}>
        <td>
          <button type="button" class="admin-fila-boton" aria-expanded={abierta}>
            {u.email}
          </button>
          {u.admin && <span class="admin-etiqueta">admin</span>}
        </td>
        <td>{fecha(u.alta)}</td>
        <td>{u.passkey ? 'sí' : 'solo mail'}</td>
        <td>{n(u.regalos)}</td>
        <td>{n(u.listas)}</td>
        <td>{n(u.compras)}</td>
        <td>{u.admin ? 'todo libre' : quedan}</td>
      </tr>
      {abierta && (
        <tr class="admin-detalle">
          <td colSpan={7}>
            <Ficha email={u.email} onChanged={onChanged} />
          </td>
        </tr>
      )}
    </>
  );
}

/** La ficha de una cuenta y el ajuste manual de créditos. */
function Ficha({ email, onChanged }: { email: string; onChanged: () => void }) {
  const { lang } = useI18n();
  const [cuenta, setCuenta] = useState<AdminAccount | null>(null);
  const [ajuste, setAjuste] = useState({ unidad: 'regalo', cantidad: '', motivo: '' });
  const [aviso, setAviso] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .adminAccount(email)
      .then(setCuenta)
      .catch((e: unknown) => setAviso({ kind: 'error', text: errorText(e) }));
  }, [email]);

  return (
    <div class="admin-ficha">
      {cuenta === null ? aviso === null && <p class="texto-suave cargando">Cargando…</p> : <AccountCard cuenta={cuenta} lang={lang} />}
      <form
        class="admin-ajuste"
        onSubmit={(e) => {
          e.preventDefault();
          setAviso(null);
          const cantidad = Number(ajuste.cantidad);
          if (!Number.isInteger(cantidad) || cantidad === 0) return setAviso({ kind: 'error', text: 'La cantidad tiene que ser un número entero (negativo para quitar).' });
          setBusy(true);
          api
            .adminAdjust({ email, unidad: ajuste.unidad, cantidad, motivo: ajuste.motivo.trim() })
            .then((r) => {
              setCuenta(r.cuenta);
              setAviso({ kind: 'ok', text: `Listo: ${cantidad > 0 ? '+' : ''}${cantidad} ${UNIDADES[ajuste.unidad] ?? ajuste.unidad}.` });
              setAjuste({ unidad: 'regalo', cantidad: '', motivo: '' });
              onChanged();
            })
            .catch((err: unknown) => setAviso({ kind: 'error', text: errorText(err) }))
            .finally(() => setBusy(false));
        }}
      >
        <strong>Dar o quitar créditos</strong>
        <select value={ajuste.unidad} onChange={(e) => setAjuste({ ...ajuste, unidad: (e.currentTarget as HTMLSelectElement).value })}>
          <option value="regalo">Regalos</option>
          <option value="lista_cumple">Listas de cumpleaños</option>
          <option value="lista_otras">Listas de otra ocasión</option>
        </select>
        <input inputMode="numeric" required placeholder="cantidad (+3, -1)" value={ajuste.cantidad} onInput={(e) => setAjuste({ ...ajuste, cantidad: (e.currentTarget as HTMLInputElement).value })} />
        <input required minLength={3} maxLength={300} placeholder="motivo" value={ajuste.motivo} onInput={(e) => setAjuste({ ...ajuste, motivo: (e.currentTarget as HTMLInputElement).value })} />
        <Button type="submit" disabled={busy}>
          Registrar
        </Button>
      </form>
      {aviso !== null && <Notice kind={aviso.kind}>{aviso.text}</Notice>}
    </div>
  );
}
