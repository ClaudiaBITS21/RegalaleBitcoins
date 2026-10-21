import { useEffect, useState } from 'preact/hooks';
import { ApiFailure, api } from '../api.ts';
import { Button, Notice } from '../ui.tsx';

// Quiénes son admins (Rodolfo, 21/10). Herramienta interna: solo en castellano. Los fijos salen de
// ADMIN_EMAILS en la API y no se quitan desde acá; los demás se suman y se quitan con passkey, y
// cada cambio avisa por mail a todos los admins.

type Admins = Awaited<ReturnType<typeof api.adminAdmins>>;

const errorText = (e: unknown): string => {
  if (!(e instanceof ApiFailure)) return 'No se pudo completar.';
  if (e.code === 'passkey_requerida') return 'Hace falta entrar con tu passkey (no alcanza el link por mail).';
  if (e.code === 'ya_es_admin') return 'Ese mail ya es admin.';
  if (e.code === 'admin_fijo') return 'Ese admin es fijo (ADMIN_EMAILS en Cloud Run): no se quita desde acá.';
  if (e.code === 'pedido_invalido') return 'Ese mail no parece válido.';
  return 'No se pudo completar.';
};

export function AdminAdminsPanel() {
  const [data, setData] = useState<Admins | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setData(await api.adminAdmins());
    } catch (e) {
      setError(errorText(e));
    }
  };
  useEffect(() => {
    void load();
  }, []);

  /** true si salió bien. */
  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="admin-bloque admin-admins">
      <h2>Admins</h2>
      {error !== null && <Notice kind="error">{error}</Notice>}
      {data !== null && (
        <ul class="admin-lista">
          {data.fijos.map((e) => (
            <li key={e}>
              <strong>{e}</strong> <span class="texto-suave">· fijo</span>
            </li>
          ))}
          {data.agregados.map((a) => (
            <li key={a.email}>
              <strong>{a.email}</strong>{' '}
              <span class="texto-suave">
                · lo sumó {a.agregadoPor} el {new Date(a.creado).toLocaleDateString('es-AR')}
              </span>{' '}
              <button
                type="button"
                class="boton-texto"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`¿Quitar a ${a.email} de los admins?`)) void run(() => api.adminRemoveAdmin(a.email));
                }}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        class="formulario"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim() !== '' && !busy) void run(() => api.adminAddAdmin(email.trim())).then((ok) => ok && setEmail(''));
        }}
      >
        <label class="campo">
          <span>Sumar admin (mail)</span>
          <input type="email" autocomplete="off" value={email} onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <Button type="submit" kind="contorno" disabled={busy || email.trim() === ''}>
          Sumar
        </Button>
        <small class="texto-suave">Para entrar al panel, esa persona tiene que tener cuenta en la web con ese mail. Cada cambio avisa por mail a todos los admins.</small>
      </form>
    </section>
  );
}
