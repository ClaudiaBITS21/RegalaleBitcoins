import { useEffect, useState } from 'preact/hooks';
import { type AdminAccount, type AdminCobro, type AdminProduct, ApiFailure, api } from '../api.ts';
import { formatSats, formatUsdPrice } from '../format.ts';
import { PRODUCT_NAME } from '../comprar.tsx';
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
  if (e.code === 'cuenta_inexistente') return 'No hay ninguna cuenta con ese mail: tiene que ser el mail exacto con el que se registró (por ejemplo, nombre@dominio.com).';
  return 'No se pudo completar.';
};

/** Nombre de Precios con el código interno al lado: «Hodler (anual)» (Rodolfo, 21/10). */
function useProductName(): (codigo: string) => string {
  const { t } = useI18n();
  return (codigo) => {
    const key = PRODUCT_NAME[codigo];
    return key === undefined ? codigo : `${t(key)} (${codigo})`;
  };
}

export function AdminCobroPanel() {
  const { lang } = useI18n();
  const productName = useProductName();
  const [data, setData] = useState<AdminCobro | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [llave, setLlave] = useState('');
  const [vista, setVista] = useState<{ huella: string; direcciones: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ajuste, setAjuste] = useState({ email: '', unidad: 'regalo', cantidad: '', motivo: '' });
  // Ajustes y consulta de cuentas: el resultado (o el error) se muestra al lado del formulario.
  const [cuenta, setCuenta] = useState<AdminAccount | null>(null);
  const [buscar, setBuscar] = useState('');
  const [aviso, setAviso] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
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

      <h3>Precios y qué incluye cada producto</h3>
      <p class="texto-suave">Precio en sats enteros. Regalos vacío = libres (solo planes); días vacío = para siempre (solo planes); cupo vacío = sin límite. Un plan ya comprado conserva lo que incluía.</p>
      <table class="admin-tabla">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Precio</th>
            <th>Regalos</th>
            <th>Listas</th>
            <th>Días</th>
            <th>Cupo</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.productos
            .filter((p) => p.codigo !== 'bienvenida' && p.activo)
            .map((p) => (
              <ProductRow key={`${p.codigo}-${p.precioSats}-${p.regalos}-${p.listas}-${p.dias}-${p.cupo}`} product={p} busy={busy} onError={setError} run={run} />
            ))}
        </tbody>
      </table>
      <p class="texto-suave">Quedan {data.fundadoresQuedan} lugares de Genesis.</p>

      <h3>Cuentas: qué tiene cada una</h3>
      <form
        class="admin-ajuste"
        onSubmit={(e) => {
          e.preventDefault();
          setAviso(null);
          setBusy(true);
          api
            .adminAccount(buscar.trim())
            .then(setCuenta)
            .catch((err: unknown) => (setCuenta(null), setAviso({ kind: 'error', text: errorText(err) })))
            .finally(() => setBusy(false));
        }}
      >
        <input type="email" required placeholder="mail de la cuenta" value={buscar} onInput={(e) => setBuscar((e.currentTarget as HTMLInputElement).value)} />
        <Button type="submit" kind="contorno" disabled={busy}>
          Ver la cuenta
        </Button>
      </form>

      <h3>Ajuste manual de créditos</h3>
      <form
        class="admin-ajuste"
        onSubmit={(e) => {
          e.preventDefault();
          setAviso(null);
          const cantidad = Number(ajuste.cantidad);
          if (!Number.isInteger(cantidad) || cantidad === 0) return setAviso({ kind: 'error', text: 'La cantidad tiene que ser un número entero (negativo para quitar).' });
          const email = ajuste.email.trim();
          const unidad = UNIDADES[ajuste.unidad] ?? ajuste.unidad;
          setBusy(true);
          api
            .adminAdjust({ email, unidad: ajuste.unidad, cantidad, motivo: ajuste.motivo.trim() })
            .then((r) => {
              setCuenta(r.cuenta);
              setBuscar(email);
              setAviso({ kind: 'ok', text: `Listo: ${cantidad > 0 ? '+' : ''}${cantidad} ${unidad} para ${email}. Abajo, lo que tiene ahora.` });
              setAjuste({ email: '', unidad: 'regalo', cantidad: '', motivo: '' });
            })
            .catch((err: unknown) => setAviso({ kind: 'error', text: errorText(err) }))
            .finally(() => setBusy(false));
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
      {aviso !== null && <Notice kind={aviso.kind}>{aviso.text}</Notice>}
      {cuenta !== null && <AccountCard cuenta={cuenta} lang={lang} />}

      <h3>Arrepentimientos</h3>
      {refunds.length === 0 ? (
        <p class="texto-suave">No hay pedidos.</p>
      ) : (
        <ul class="admin-lista">
          {refunds.map((r) => (
            <li key={r.codigo}>
              <strong>{r.codigo}</strong> · {productName(r.producto)} · pago <code>{r.pago}</code> · {new Date(r.fecha).toLocaleString(lang)}
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
                  <td>{productName(p.producto)}</td>
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

/** Una fila editable de producto: precio y contenido (los valores y límites pueden cambiar). */
function ProductRow({ product: p, busy, onError, run }: { product: AdminProduct; busy: boolean; onError: (e: string) => void; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const productName = useProductName();
  const opt = (n: number | null) => (n === null ? '' : String(n));
  const [precio, setPrecio] = useState(p.precioSats);
  const [regalos, setRegalos] = useState(opt(p.regalos));
  const [listas, setListas] = useState(String(p.listas));
  const [dias, setDias] = useState(opt(p.dias));
  const [cupo, setCupo] = useState(opt(p.cupo));
  // Solo enteros sin separadores: nada de parseFloat sobre lo que se tipea.
  const entero = (v: string) => (/^\d{1,9}$/.test(v.trim()) ? Number(v.trim()) : undefined);
  const nullable = (v: string) => (v.trim() === '' ? null : entero(v));
  const guardar = () => {
    const [pr, r, l, d, k] = [entero(precio), nullable(regalos), entero(listas), nullable(dias), nullable(cupo)];
    if (pr === undefined || pr <= 0 || r === undefined || l === undefined || d === undefined || d === 0 || k === undefined) return onError('Valores inválidos: números enteros, sin puntos.');
    if (p.plan === null && (r === null || d !== null)) return onError('Regalos libres y días de vigencia son solo para planes.');
    void run(async () => {
      if (String(pr) !== p.precioSats) await api.adminSetPrice(p.codigo, pr);
      await api.adminSetProduct({ producto: p.codigo, regalos: r, listas: l, dias: d, cupo: k });
    });
  };
  const campo = (value: string, set: (v: string) => void, label: string) => (
    <td>
      <input class="admin-numero" inputMode="numeric" aria-label={`${label} de ${p.codigo}`} value={value} onInput={(e) => set((e.target as HTMLInputElement).value)} size={7} />
    </td>
  );
  return (
    <tr>
      <td>
        {productName(p.codigo)}
        {p.plan !== null && ' · plan'}
      </td>
      {campo(precio, setPrecio, 'Precio en sats')}
      {campo(regalos, setRegalos, 'Regalos')}
      {campo(listas, setListas, 'Listas')}
      {campo(dias, setDias, 'Días')}
      {campo(cupo, setCupo, 'Cupo')}
      <td>
        <button type="button" class="boton-texto" disabled={busy} onClick={guardar}>
          Guardar
        </button>
      </td>
    </tr>
  );
}

const UNIDADES: Readonly<Record<string, string>> = { regalo: 'regalos', lista_cumple: 'listas de cumpleaños', lista_otras: 'listas de otra ocasión' };
const ORIGENES: Readonly<Record<string, string>> = { bienvenida: 'bienvenida', pago: 'pago', codigo: 'cupón', campana: 'campaña', admin: 'admin', plan: 'plan' };

/** Qué tiene una cuenta: si es admin, qué funciones tiene, saldo por unidad, plan y últimos movimientos. */
function AccountCard({ cuenta: c, lang }: { cuenta: AdminAccount; lang: string }) {
  const si = (v: boolean | undefined) => (v === true ? 'sí' : 'no');
  const porOcasion = (m: Readonly<Record<string, number>> | undefined) =>
    m === undefined || Object.keys(m).length === 0 ? null : Object.entries(m).map(([k, n]) => `${k}: ${n}`).join(', ');
  return (
    <div class="caja admin-cuenta">
      <p>
        <strong>{c.email}</strong>
        {c.admin && <> · Admin: todo activado y libre, sin descontar créditos</>}
      </p>
      <ul class="admin-lista">
        <li>Imagen con IA y tarjeta imprimible: {si(c.conPlan)}</li>
        <li>Salutación automática (mensajes de ejemplo): {si(c.conSaludo)}</li>
        <li>
          Regalos: {c.regalos.bienvenida} de bienvenida, {c.regalos.pagos} pagos o asignados
          {porOcasion(c.regalos.porOcasion) !== null && <> · por ocasión: {porOcasion(c.regalos.porOcasion)}</>}
        </li>
        <li>
          Listas: {c.listas.cumple} de cumpleaños, {c.listas.otras} de otra ocasión
          {porOcasion(c.listas.porOcasion) !== null && <> · por ocasión: {porOcasion(c.listas.porOcasion)}</>}
        </li>
        <li>
          Plan:{' '}
          {c.plan === null
            ? 'ninguno'
            : `${c.plan.tipo}, ${c.plan.regalosQuedan === null ? 'regalos libres' : `quedan ${c.plan.regalosQuedan} regalos`}${c.plan.hasta === null ? ', sin vencimiento' : `, hasta ${new Date(c.plan.hasta).toLocaleDateString(lang)}`}`}
        </li>
        {!c.cobroActivo && <li>El cobro está apagado: hoy todas las cuentas tienen todo.</li>}
      </ul>
      {c.movimientos.length > 0 && (
        <>
          <p class="texto-suave">Últimos movimientos</p>
          <ul class="admin-lista">
            {c.movimientos.map((m, i) => (
              <li key={i}>
                {new Date(m.fecha).toLocaleString(lang)} · {m.tipo} · {m.cantidad > 0 ? '+' : ''}
                {m.cantidad} {UNIDADES[m.unidad] ?? m.unidad} · {ORIGENES[m.origen] ?? m.origen}
                {m.motivo !== null && <> · «{m.motivo}»</>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
