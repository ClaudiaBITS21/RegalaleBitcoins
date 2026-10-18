// Agregar el sitio a la pantalla de inicio. Sin service worker: Chrome ya no lo pide para instalar
// y así la web instalada se comporta igual que en el navegador (nada queda guardado de versiones viejas).

/** Cómo se agrega el sitio al inicio en este navegador, si no hay diálogo nativo. */
export type InstallWay = 'ios-safari' | 'ios-otro' | 'android' | 'escritorio';

/** Lo deduce del user agent; `maxTouchPoints` distingue un iPad (que se presenta como Mac). */
export function installWay(ua: string, maxTouchPoints: number): InstallWay {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (ios) {
    // Safari trae "Version/… Safari/"; Chrome, Firefox, Edge, Opera, Google y las apps (Instagram,
    // Facebook…) se identifican aparte o no traen "Safari/".
    const otro = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|Ddg\/|YaBrowser|FBAN|FBAV|Instagram|Line\//.test(ua);
    return !otro && /Version\/[\d.]+.*Safari\//.test(ua) ? 'ios-safari' : 'ios-otro';
  }
  return /Android/.test(ua) ? 'android' : 'escritorio';
}

/** ¿Ya corre como app instalada (abierta desde el ícono)? */
export function isStandalone(): boolean {
  const modos = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'];
  if (modos.some((m) => window.matchMedia?.(`(display-mode: ${m})`).matches === true)) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let pending: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/** Escucha desde el arranque: Chrome avisa que se puede instalar apenas carga la página. */
export function listenForInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Sin el cartel automático de Chrome: el diálogo se abre solo si la persona toca el botón.
    e.preventDefault();
    pending = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    pending = null;
    notify();
  });
}

export function installState(): { readonly canPrompt: boolean; readonly installed: boolean } {
  return { canPrompt: pending !== null, installed };
}

/** Avisa cuando cambia `installState()`; devuelve la función para dejar de escuchar. */
export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Abre el diálogo nativo de instalación. Falso si este navegador no lo ofrece (o ya se usó). */
export async function promptInstall(): Promise<boolean> {
  const e = pending;
  if (e === null) return false;
  // Cada aviso sirve una sola vez; si la persona lo cierra, Chrome manda otro más adelante.
  pending = null;
  notify();
  await e.prompt();
  if ((await e.userChoice).outcome === 'accepted') installed = true;
  notify();
  return true;
}
