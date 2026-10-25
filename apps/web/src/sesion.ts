import { useEffect, useState } from 'preact/hooks';

// ¿Hay una cuenta abierta en este navegador? Para el ícono de «Mis regalos» de la cabecera
// (Rodolfo, 21/10). Se pregunta una vez por carga de página; entrar o salir lo avisa al momento.

let known: boolean | null = null;
/** Si la cuenta abierta es de un admin (para ofrecerle ir al admin desde el ícono). */
let knownAdmin = false;
let pending: Promise<boolean> | null = null;
const listeners = new Set<(open: boolean) => void>();
const adminListeners = new Set<(admin: boolean) => void>();

function ask(): Promise<boolean> {
  pending ??= fetch('/api/cuenta/sesion', { credentials: 'same-origin' })
    .then(async (r) => (r.ok ? ((await r.json()) as { abierta?: unknown; admin?: unknown }) : {}))
    .catch(() => ({}) as { abierta?: unknown; admin?: unknown })
    .then((b) => {
      const admin = b.abierta === true && b.admin === true;
      if (admin !== knownAdmin) {
        knownAdmin = admin;
        for (const l of adminListeners) l(admin);
      }
      known ??= b.abierta === true;
      return known;
    });
  return pending;
}

/** Entró o salió de la cuenta: la cabecera se actualiza sin recargar. */
export function setSignedIn(open: boolean): void {
  known = open;
  for (const l of listeners) l(open);
  // Al entrar se vuelve a preguntar si es admin; al salir, deja de serlo.
  pending = null;
  if (open) void ask();
  else if (knownAdmin) {
    knownAdmin = false;
    for (const l of adminListeners) l(false);
  }
  // Si llegó con una invitación, el código se canjea apenas hay cuenta.
  if (open) void import('./cuponPendiente.ts').then((m) => m.redeemPendingCoupon());
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

/** Si la cuenta abierta es de un admin. */
export function useIsAdmin(): boolean {
  const [admin, setAdmin] = useState(knownAdmin);
  useEffect(() => {
    adminListeners.add(setAdmin);
    if (known === null) void ask();
    else setAdmin(knownAdmin);
    return () => {
      adminListeners.delete(setAdmin);
    };
  }, []);
  return admin;
}
