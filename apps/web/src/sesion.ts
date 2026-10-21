import { useEffect, useState } from 'preact/hooks';

// ¿Hay una cuenta abierta en este navegador? Para el ícono de «Mis regalos» de la cabecera
// (Rodolfo, 21/10). Se pregunta una vez por carga de página; entrar o salir lo avisa al momento.

let known: boolean | null = null;
let pending: Promise<boolean> | null = null;
const listeners = new Set<(open: boolean) => void>();

function ask(): Promise<boolean> {
  pending ??= fetch('/api/cuenta/sesion', { credentials: 'same-origin' })
    .then(async (r) => (r.ok ? ((await r.json()) as { abierta?: unknown }).abierta === true : false))
    .catch(() => false)
    .then((open) => {
      known ??= open;
      return known;
    });
  return pending;
}

/** Entró o salió de la cuenta: la cabecera se actualiza sin recargar. */
export function setSignedIn(open: boolean): void {
  known = open;
  for (const l of listeners) l(open);
}

export function useSignedIn(): boolean {
  const [open, setOpen] = useState(known ?? false);
  useEffect(() => {
    listeners.add(setOpen);
    if (known === null) void ask().then(setOpen);
    return () => {
      listeners.delete(setOpen);
    };
  }, []);
  return open;
}
