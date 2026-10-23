import { Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { type AdminCoupon, type AdminCouponBatch, api } from '../api.ts';
import { formatSats } from '../format.ts';
import { Notice, useI18n } from '../ui.tsx';
import { errorText } from './AdminCobro.tsx';
import { estado, estadoLote, fechaCorta, linkInvitacion, nombrePlan, queDa, ultimoDia } from './CuponesPage.tsx';

// Cupones en el admin (Claudia, 23/10): todos los cupones y lotes en una lista; tocar uno abre su
// detalle. Crearlos, pausarlos y compartirlos se hace en la app de cupones (/cupones).

export function AdminCuponesPanel() {
  const { lang } = useI18n();
  const [data, setData] = useState<{ cupones: AdminCoupon[]; lotes: AdminCouponBatch[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  useEffect(() => {
    api
      .adminCoupons()
      .then(setData)
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  const f = filtro.trim().toLowerCase();
  const cupones = data?.cupones.filter((c) => f === '' || c.codigo.toLowerCase().includes(f) || (c.email ?? '').includes(f) || c.nota.toLowerCase().includes(f)) ?? [];
  const vigencia = (desde: string | null, hasta: string | null) =>
    hasta === null ? (desde === null ? 'Sin vencimiento' : `Desde el ${fechaCorta(desde)}`) : `Hasta el ${fechaCorta(ultimoDia(hasta))}`;

  return (
    <section class="admin-bloque">
      <div class="admin-cabecera-seccion">
        <h2>Cupones{data !== null && <span class="admin-contador"> · {data.cupones.length}</span>}</h2>
        <input class="admin-buscar" type="search" placeholder="Buscar por código, mail o nota" value={filtro} onInput={(e) => setFiltro((e.currentTarget as HTMLInputElement).value)} />
        <a class="boton boton-primario" href="/cupones">
          Crear cupones
        </a>
      </div>
      {error !== null && <Notice kind="error">{error}</Notice>}
      {data === null ? (
        error === null && <p class="texto-suave cargando">Cargando…</p>
      ) : (
        <>
          {cupones.length === 0 ? (
            <p class="texto-suave">No hay cupones{f !== '' && ' con esa búsqueda'}.</p>
          ) : (
            <div class="admin-tabla-scroll">
              <table class="admin-tabla admin-tabla-izq admin-tabla-filas">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Qué da</th>
                    <th>Para</th>
                    <th>Usos</th>
                    <th>Vigencia</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cupones.map((c) => {
                    const e = estado(c);
                    const open = abierto === c.codigo;
                    return (
                      <Fragment key={c.codigo}>
                        <tr class={`admin-fila${open ? ' abierta' : ''}`} onClick={() => setAbierto(open ? null : c.codigo)}>
                          <td>
                            <button type="button" class="admin-fila-boton" aria-expanded={open}>
                              <code>{c.codigo}</code>
                            </button>
                          </td>
                          <td>{queDa(c)}</td>
                          <td>{c.email ?? 'Cualquiera'}</td>
                          <td>
                            {c.usados} / {c.maxUsos}
                          </td>
                          <td>{vigencia(c.desde, c.hasta)}</td>
                          <td>
                            <span class={`admin-estado ${e.clave}`}>{e.texto}</span>
                          </td>
                        </tr>
                        {open && (
                          <tr class="admin-detalle">
                            <td colSpan={6}>
                              <dl class="admin-datos">
                                <div>
                                  <dt>Nota</dt>
                                  <dd>{c.nota === '' ? '—' : c.nota}</dd>
                                </div>
                                <div>
                                  <dt>Creado</dt>
                                  <dd>
                                    {new Date(c.creado).toLocaleString(lang)} por {c.creadoPor}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Usos</dt>
                                  <dd>
                                    {c.usados} de {c.maxUsos}
                                    {c.reservados > 0 && ` · ${c.reservados} esperando el pago`}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Compras con el cupón</dt>
                                  <dd>
                                    {Object.keys(c.porProducto).length === 0
                                      ? '—'
                                      : Object.entries(c.porProducto)
                                          .map(([p, n]) => `${nombrePlan(p)} ${n}`)
                                          .join(', ')}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Descuento resignado</dt>
                                  <dd>{formatSats(BigInt(c.satsResignados), lang)}</dd>
                                </div>
                                <div>
                                  <dt>Link de invitación</dt>
                                  <dd>
                                    <code>{linkInvitacion(c.codigo)}</code>
                                  </dd>
                                </div>
                              </dl>
                              <p>
                                <a href="/cupones">Pausar, compartir o copiar en la app de cupones →</a>
                              </p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h3>Lotes</h3>
          {data.lotes.length === 0 ? (
            <p class="texto-suave">No hay lotes.</p>
          ) : (
            <div class="admin-tabla-scroll">
              <table class="admin-tabla admin-tabla-izq">
                <thead>
                  <tr>
                    <th>Lote</th>
                    <th>Qué da</th>
                    <th>Códigos</th>
                    <th>Con mail</th>
                    <th>Usados</th>
                    <th>Vigencia</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lotes.map((l) => {
                    const e = estadoLote(l);
                    return (
                      <tr key={l.id}>
                        <td>{l.nombre}</td>
                        <td>{queDa(l)}</td>
                        <td>{l.total}</td>
                        <td>{l.conMail}</td>
                        <td>{l.usados}</td>
                        <td>{vigencia(l.desde, l.hasta)}</td>
                        <td>
                          <span class={`admin-estado ${e.clave}`}>{e.texto}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
