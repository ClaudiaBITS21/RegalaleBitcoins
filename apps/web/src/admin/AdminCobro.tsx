import { useEffect, useState } from 'preact/hooks';
import { type AdminCobro, ApiFailure, api } from '../api.ts';
import { formatSats, formatUsdPrice } from '../format.ts';
import { Button, Notice, useI18n } from '../ui.tsx';

// Admin del cobro (handoff 2026-10-19, «cobro y créditos»). Herramienta interna: solo en
// castellano. La llave de cobro se pega acá, se comparan sus 3 primeras direcciones con la
// billetera y recién ahí se confirma. El servidor nunca devuelve la llave: solo su huella.

const ESTADOS: Readonly<Record<string, string>> = {
  pendiente: 'Esperando pago',
  visto: 'Visto, falta confirmar',
  confirmado: 'Confirmado',
  incompleto: 'Incompleto',
  vencido: 'Cotización vencida',
  devuelto: 'Devuelto',
};

const errorText = (e: unknown): string => {
  if (!(e instanceof ApiFailure)) return 'No se pudo completar.';
  if (e.code === 'passkey_requerida') return 'Hace falta entrar con tu passkey (no alcanza el link por mail).';
  if (e.code === 'llave_invalida') return 'La llave no es válida para esta red. Tiene que ser wpkh([huella/84h/0h/0h]xpub…) o una zpub.';
  if (e.code === 'cobro_no_configurado') return 'Primero cargá la llave de cobro.';
  return 'No se pudo completar.';
};

export function AdminCobroPanel() {
  const { lang } = useI18n();
  const [data, setData] = useState<AdminCobro | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [llave, setLlave] = useState('');
  const [vista, setVista] = useState<{ huella: string; direcciones: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ajuste, setAjuste] = useState({ email: '', unidad: 'regalo', cantidad: '', motivo: '' });
  const [refunds, setRefunds] = useState<Awaited<ReturnType<typeof api.adminRefunds>>['pedidos']>([]);

  const load = async () => {
    try {
      setData(await api.adminCobro());
      setRefunds((await api.adminRefunds()).pedidos);
    } catch (e) {
      setError(errorText(e));
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after?.();
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (data === null) return error === null ? null : <Notice kind="error">{error}</Notice>;
  const sats = (s: string) => formatSats(BigInt(s), lang);

  return (
    <section class="admin-bloque admin-cobro">
      <h2>Cobro</h2>
      {error !== null && <Notice kind="error">{error}</Notice>}
      <p>
        Estado: <strong>{data.cobroActivo ? 'Activo' : 'Apagado (regalar es gratis)'}</strong>{' '}
        <Button
          kind="contorno"
          disabled={busy || (!data.cobroActivo && data.llave === null)}
          onClick={() => {
            const activar = !data.cobroActivo;
            if (window.confirm(activar ? '¿Activar el cobro? Desde ahora cada regalo usa un crédito.' : '¿Apagar el cobro? Regalar vuelve a ser gratis.')) {
              void run(() => api.adminSetCharging(activar));
            }
          }}
        >
          {data.cobroActivo ? 'Apagar el cobro' : 'Activar el cobro'}
        </Button>
      </p>

      <h3>Llave de cobro</h3>
      {data.llave === null ? (
        <p class="texto-suave">Todavía no hay llave: no se puede vender.</p>
      ) : (
        <>
          <p>
            Vigente: huella <code>{data.llave.huella}</code>. Primeras direcciones:
          </p>
          <ol start={0} class="admin-direcciones">
            {data.llave.direcciones.map((d) => (
              <li key={d}>
                <code>{d}</code>
              </li>
            ))}
          </ol>
        </>
      )}
      {data.llaveNueva !== null && (
        <Notice>
          Cambio pedido: huella <code>{data.llaveNueva.huella}</code>, vigente desde {new Date(data.llaveNueva.vigenteDesde).toLocaleString(lang)}. Si no lo pediste vos, volvé a cargar la llave
          vigente.
        </Notice>
      )}
      <label class="campo">
        <span>Descriptor de la cuenta (wpkh([huella/84h/0h/0h]xpub…)) o zpub</span>
        <textarea
          rows={3}
          value={llave}
          spellcheck={false}
          autocomplete="off"
          onInput={(e) => {
            setLlave((e.currentTarget as HTMLTextAreaElement).value);
            setVista(null);
          }}
        />
      </label>
      <p>
        <Button kind="contorno" disabled={busy || llave.trim() === ''} onClick={() => void run(async () => setVista(await api.adminKeyPreview(llave.trim())))}>
          Ver las primeras direcciones
        </Button>
      </p>
      {vista !== null && (
        <div class="admin-vista-llave">
          <p>
            Huella <code>{vista.huella}</code>. Compará estas direcciones con las de tu billetera (recibir, índices 0, 1 y 2):
          </p>
          <ol start={0} class="admin-direcciones">
            {vista.direcciones.map((d) => (
              <li key={d}>
                <code>{d}</code>
              </li>
            ))}
          </ol>
          <Button
            disabled={busy}
            onClick={() =>
              void run(
                () => api.adminSetKey(llave.trim()),
                () => {
                  setLlave('');
                  setVista(null);
                },
              )
            }
          >
            Coinciden: {data.llave === null ? 'cargar la llave' : 'cambiar la llave (en 24 horas)'}
          </Button>
        </div>
      )}

      <h3>Precios</h3>
      <table class="admin-tabla">
        <tbody>
          {data.productos
            .filter((p) => p.codigo !== 'bienvenida')
            .map((p) => (
              <tr key={p.codigo}>
                <td>{p.codigo}</td>
                <td>{formatUsdPrice(p.precioUsd, lang)}</td>
                <td>
                  <button
                    type="button"
                    class="boton-texto"
                    disabled={busy}
                    onClick={() => {
                      const nuevo = window.prompt(`Precio nuevo de ${p.codigo} en dólares (usá punto para los centavos):`, String(p.precioUsd));
                      if (nuevo === null) return;
                      const v = Number(nuevo);
                      if (!Number.isFinite(v) || v < 0) return setError('Precio inválido.');
                      void run(() => api.adminSetPrice(p.codigo, v));
                    }}
                  >
                    Cambiar
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <p class="texto-suave">Quedan {data.fundadoresQuedan} lugares de fundador.</p>

      <h3>Ajuste manual de créditos</h3>
      <form
        class="admin-ajuste"
        onSubmit={(e) => {
          e.preventDefault();
          const cantidad = Number(ajuste.cantidad);
          if (!Number.isInteger(cantidad) || cantidad === 0) return setError('La cantidad tiene que ser un número entero (negativo para quitar).');
          void run(
            () => api.adminAdjust({ email: ajuste.email.trim(), unidad: ajuste.unidad, cantidad, motivo: ajuste.motivo.trim() }),
            () => setAjuste({ email: '', unidad: 'regalo', cantidad: '', motivo: '' }),
          );
        }}
      >
        <input type="email" required placeholder="mail de la cuenta" value={ajuste.email} onInput={(e) => setAjuste({ ...ajuste, email: (e.currentTarget as HTMLInputElement).value })} />
        <select value={ajuste.unidad} onChange={(e) => setAjuste({ ...ajuste, unidad: (e.currentTarget as HTMLSelectElement).value })}>
          <option value="regalo">Regalos</option>
          <option value="lista_cumple">Listas de cumpleaños</option>
          <option value="lista_otras">Listas de otra ocasión</option>
        </select>
        <input inputMode="numeric" required placeholder="cantidad (+3, -1)" value={ajuste.cantidad} onInput={(e) => setAjuste({ ...ajuste, cantidad: (e.currentTarget as HTMLInputElement).value })} />
        <input required minLength={3} maxLength={300} placeholder="motivo" value={ajuste.motivo} onInput={(e) => setAjuste({ ...ajuste, motivo: (e.currentTarget as HTMLInputElement).value })} />
        <Button type="submit" disabled={busy}>
          Registrar ajuste
        </Button>
      </form>

      <h3>Arrepentimientos</h3>
      {refunds.length === 0 ? (
        <p class="texto-suave">No hay pedidos.</p>
      ) : (
        <ul class="admin-lista">
          {refunds.map((r) => (
            <li key={r.codigo}>
              <strong>{r.codigo}</strong> · {r.producto} · pago <code>{r.pago}</code> · {new Date(r.fecha).toLocaleString(lang)}
              <br />
              Devolver {sats(r.sats)} a <code>{r.direccion}</code>
              <br />
              {r.estado === 'devuelto' ? (
                'Devuelto.'
              ) : (
                <button
                  type="button"
                  class="boton-texto"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`¿Ya mandaste ${sats(r.sats)} a ${r.direccion}? Se quitan los créditos de esa compra.`)) void run(() => api.adminRefunded(r.codigo));
                  }}
                >
                  Ya lo devolví
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>Pagos</h3>
      <p>
        {data.totales.confirmados} confirmados · {formatUsdPrice(data.totales.usd, lang)} · {sats(data.totales.sats)}
      </p>
      {data.pagos.length === 0 ? (
        <p class="texto-suave">Todavía no hay pagos.</p>
      ) : (
        <div class="admin-tabla-scroll">
          <table class="admin-tabla">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Estado</th>
                <th>Precio</th>
                <th>Recibido</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {data.pagos.map((p) => (
                <tr key={p.id}>
                  <td>
                    <code>{p.id.slice(0, 8)}</code>
                  </td>
                  <td>{p.producto}</td>
                  <td>{ESTADOS[p.estado] ?? p.estado}</td>
                  <td>{formatUsdPrice(p.precioUsd, lang)}</td>
                  <td>
                    {sats(p.satsRecibidos)} / {sats(p.sats)}
                  </td>
                  <td>{new Date(p.creado).toLocaleString(lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Registro</h3>
      <ul class="admin-lista">
        {data.registro.map((r, i) => (
          <li key={i}>
            {new Date(r.fecha).toLocaleString(lang)} · {r.email} · {r.accion}
            {r.detalle !== '' && ` · ${r.detalle}`}
          </li>
        ))}
      </ul>
    </section>
  );
}
