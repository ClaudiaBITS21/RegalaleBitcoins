import { useEffect, useState } from 'preact/hooks';
import { ApiFailure, api } from '../api.ts';
import { occasionLabel } from '../content/occasions.ts';
import { Button, Notice } from '../ui.tsx';

// Denuncias de listas (handoff 21/10, «listas por país», sección 6). Herramienta interna: solo en
// castellano. Se ve cada lista denunciada con el mail de su dueño y cada denuncia (motivo y mail
// de quien la hizo); los datos de cobro no se ven (van cifrados). Reactivar o dar de baja pide la
// passkey y queda en registro_admin.

type Reports = Awaited<ReturnType<typeof api.adminReports>>;

const ESTADO: Readonly<Record<string, string>> = { activa: 'Activa', pausada: 'Pausada (el dueño puede reactivarla una vez)', en_revision: 'En revisión', baja: 'Dada de baja' };

const errorText = (e: unknown): string =>
  e instanceof ApiFailure && e.code === 'passkey_requerida' ? 'Hace falta entrar con tu passkey (no alcanza el link por mail).' : 'No se pudo completar.';

export function AdminDenunciasPanel() {
  const [data, setData] = useState<Reports | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setData(await api.adminReports());
    } catch (e) {
      setError(errorText(e));
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const act = async (id: string, accion: 'reactivar' | 'baja') => {
    setBusy(true);
    setError(null);
    try {
      await api.adminReportAction(id, accion);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="admin-bloque admin-denuncias">
      <h2>Denuncias</h2>
      {error !== null && <Notice kind="error">{error}</Notice>}
      {data !== null && data.listas.length === 0 && <p class="texto-suave">No hay listas denunciadas.</p>}
      {data?.listas.map((l) => (
        <article class="caja admin-denuncia" key={l.id}>
          <strong>{l.titulo}</strong>
          <span class="texto-suave">
            {occasionLabel(l.ocasion, 'es')} · creada el {new Date(l.creada).toLocaleDateString('es-AR')} · dueño {l.dueno}
          </span>
          <span>
            <strong>{ESTADO[l.estado] ?? l.estado}</strong>
            {l.reactivada !== null && ` · ya la reactivó el ${new Date(l.reactivada).toLocaleDateString('es-AR')}`}
          </span>
          <ul class="admin-lista">
            {l.denuncias.map((d) => (
              <li key={`${d.email}${d.creada}`}>
                «{d.motivo}» <span class="texto-suave">— {d.email}, {new Date(d.creada).toLocaleString('es-AR')}</span>
              </li>
            ))}
          </ul>
          <div class="botones-copiar">
            {l.estado !== 'activa' && (
              <Button kind="contorno" disabled={busy} onClick={() => void act(l.id, 'reactivar')}>
                Reactivar
              </Button>
            )}
            {l.estado !== 'baja' && (
              <Button kind="contorno" disabled={busy} onClick={() => void act(l.id, 'baja')}>
                Dar de baja
              </Button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
