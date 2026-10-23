import { useEffect, useState } from 'preact/hooks';
import { type AdminDelivery, api } from '../api.ts';
import { occasionLabel } from '../content/occasions.ts';
import { Notice, useI18n } from '../ui.tsx';
import { errorText, ORIGENES, UNIDADES } from './AdminCobro.tsx';

// Entregas especiales (Claudia, 23/10): lo que se dio a mano desde el admin y los créditos de
// cupones y campañas, en una lista. No incluye lo gratis ni las compras con pago.

export function AdminEntregasPanel() {
  const { lang } = useI18n();
  const [rows, setRows] = useState<AdminDelivery[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  useEffect(() => {
    api
      .adminDeliveries()
      .then((d) => setRows(d.entregas))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  const f = filtro.trim().toLowerCase();
  const visibles = rows?.filter((r) => f === '' || r.email.includes(f) || (r.motivo ?? '').toLowerCase().includes(f) || (r.referencia ?? '').toLowerCase().includes(f)) ?? [];
  return (
    <section class="admin-bloque">
      <div class="admin-cabecera-seccion">
        <h2>Entregas especiales</h2>
        <input class="admin-buscar" type="search" placeholder="Buscar por mail, motivo o código" value={filtro} onInput={(e) => setFiltro((e.currentTarget as HTMLInputElement).value)} />
      </div>
      <p class="texto-suave">Créditos dados a mano desde el admin y los que dieron los cupones. No incluye lo gratis ni las compras.</p>
      {error !== null && <Notice kind="error">{error}</Notice>}
      {rows === null ? (
        error === null && <p class="texto-suave cargando">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p class="texto-suave">Nada para mostrar.</p>
      ) : (
        <div class="admin-tabla-scroll">
          <table class="admin-tabla admin-tabla-izq">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cuenta</th>
                <th>Qué</th>
                <th>Cómo</th>
                <th>Motivo o código</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r, i) => (
                <tr key={i}>
                  <td>{new Date(r.fecha).toLocaleString(lang)}</td>
                  <td>{r.email}</td>
                  <td>
                    {r.cantidad > 0 ? '+' : ''}
                    {r.cantidad} {UNIDADES[r.unidad] ?? r.unidad}
                    {r.ocasion !== null && ` (${occasionLabel(r.ocasion, 'es')})`}
                  </td>
                  <td>{r.origen === 'codigo' ? 'Cupón' : (ORIGENES[r.origen] ?? r.origen)}</td>
                  <td class="admin-celda-larga">{r.motivo ?? (r.referencia !== null ? <code>{r.referencia}</code> : '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
