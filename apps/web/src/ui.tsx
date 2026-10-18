import { type ComponentChildren, createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { type Key, LANG_NAMES, translate, type Trato, UI_LANGS, type UiLang } from './i18n/index.ts';
import { installState, installWay, isStandalone, onInstallChange, promptInstall } from './pwa.ts';

export interface I18n {
  readonly lang: UiLang;
  /** En castellano: vos (Argentina, Uruguay, Paraguay) o tú (el resto). */
  readonly trato: Trato;
  readonly setLang: (lang: UiLang, trato?: Trato) => void;
  readonly t: (key: Key, vars?: Readonly<Record<string, string | number>>) => string;
}

export const I18nContext = createContext<I18n>({ lang: 'es', trato: 'vos', setLang: () => {}, t: (key, vars) => translate('es', key, vars) });
export const useI18n = (): I18n => useContext(I18nContext);

/** La marca como texto: "regalale" en tinta y "bitcoins" en el color de acento. */
export function Wordmark({ onOrange = false }: { onOrange?: boolean }) {
  return (
    <span class={`marca-texto${onOrange ? ' sobre-naranja' : ''}`}>
      regalale<span>bitcoins</span>
    </span>
  );
}

/** Opciones del selector: el castellano va dos veces, con vos y con tú. */
interface LangOption {
  readonly value: string;
  readonly label: string;
  readonly name: string;
  readonly lang: UiLang;
  readonly trato: Trato;
}
const LANG_OPTIONS: readonly LangOption[] = UI_LANGS.flatMap((l): LangOption[] =>
  l === 'es'
    ? [
        { value: 'es', label: 'ES (vos)', name: 'Español (vos)', lang: l, trato: 'vos' },
        { value: 'es-tu', label: 'ES (tú)', name: 'Español (tú)', lang: l, trato: 'tu' },
      ]
    : [{ value: l, label: l.toUpperCase(), name: LANG_NAMES[l], lang: l, trato: 'vos' }],
);

function LangPill() {
  const { t, lang, trato, setLang } = useI18n();
  const value = lang === 'es' && trato === 'tu' ? 'es-tu' : lang;
  return (
    <label class="idioma-pill">
      <span class="solo-lector">{t('idioma')}</span>
      <select
        value={value}
        onChange={(e) => {
          const o = LANG_OPTIONS.find((x) => x.value === (e.currentTarget as HTMLSelectElement).value);
          // Al pasar a otro idioma se conserva el trato, para volver al castellano de antes.
          if (o !== undefined) setLang(o.lang, o.lang === 'es' ? o.trato : trato);
        }}
      >
        {LANG_OPTIONS.map((o) => (
          <option value={o.value} key={o.value} aria-label={o.name}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Cierra un menú al tocar afuera o con Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return ref;
}

function ReceiveItems() {
  const { t } = useI18n();
  return (
    <>
      <a class="menu-item destacado" href="/abrir">
        <strong>{t('menu.abrirRegalo')}</strong>
        <span>{t('menu.abrirRegalo.d')}</span>
      </a>
      <a class="menu-item" href="/listas/nueva">
        <strong>{t('menu.lista')}</strong>
        <span>{t('menu.lista.d')}</span>
      </a>
      <div class="menu-item">
        <strong>
          {t('menu.mis')} <span class="etiqueta-pronto">{t('menu.pronto')}</span>
        </strong>
        <span>{t('menu.mis.d')}</span>
      </div>
    </>
  );
}

/** Encabezado del sitio: marca, menú (Regalar / Recibir / 21 razones / Sin custodia) e idioma. */
export function SiteHeader({ onOrange = false }: { onOrange?: boolean }) {
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const mobileRef = useDismiss(mobileOpen, () => setMobileOpen(false));
  const receiveRef = useDismiss(receiveOpen, () => setReceiveOpen(false));
  return (
    <header class={`cabecera${onOrange ? ' cabecera-naranja' : ''}`}>
      <a class="marca" href="/">
        <Wordmark onOrange={onOrange} />
      </a>
      <nav class="nav-compu" aria-label={t('menu.abrir')}>
        <a class="boton-nav" href="/regalar">
          {t('menu.regalar')}
        </a>
        <div class="desplegable" ref={receiveRef}>
          <button type="button" class="link-nav" aria-expanded={receiveOpen} aria-haspopup="true" onClick={() => setReceiveOpen(!receiveOpen)}>
            {t('menu.recibir')}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d={receiveOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
            </svg>
          </button>
          {receiveOpen && (
            <div class="panel-menu panel-recibir">
              <ReceiveItems />
            </div>
          )}
        </div>
        <a class="link-nav" href="/panel">
          {t('menu.hechos')}
        </a>
        <a class="link-nav" href="/por-que">
          {t('menu.razones')}
        </a>
        <a class="link-nav custodia-link-nav" href="/sin-custodia">
          {t('custodia.menu')}
        </a>
        <LangPill />
      </nav>
      <div class="nav-movil" ref={mobileRef}>
        <LangPill />
        <button type="button" class="boton-hamburguesa" aria-expanded={mobileOpen} aria-label={t(mobileOpen ? 'menu.cerrar' : 'menu.abrir')} onClick={() => setMobileOpen(!mobileOpen)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
            <path d={mobileOpen ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} />
          </svg>
        </button>
        {mobileOpen && (
          <div class="panel-menu panel-movil">
            <a class="boton boton-primario" href="/regalar">
              {t('menu.regalar')}
            </a>
            <a class="menu-link" href="/panel">
              {t('menu.hechos')}
            </a>
            <p class="menu-titulo">{t('menu.recibir')}</p>
            <ReceiveItems />
            <a class="menu-link" href="/por-que" onClick={() => setMobileOpen(false)}>
              {t('razones.titulo')}
            </a>
            <a class="menu-link" href="/sin-custodia" onClick={() => setMobileOpen(false)}>
              {t('custodia.pie')}
            </a>
          </div>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer class="pie">
      <Wordmark />
      <span>{t('pie.custodia')}</span>
      <span>{t('pie')}</span>
      <a class="custodia-link-pie" href="/sin-custodia">
        {t('custodia.pie')}
      </a>
      <InstallButton />
    </footer>
  );
}

const IconoCompartir = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3v12M8 7l4-4 4 4M7 11H5v10h14V11h-2" />
  </svg>
);
const IconoAgregar = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);
const IconoMenu = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);

/** "Agregar a mi inicio": diálogo nativo donde existe (Chrome, Edge, Samsung) y, si no, los pasos a mano. */
function InstallButton() {
  const { t } = useI18n();
  const [state, setState] = useState(installState);
  const [standalone] = useState(isStandalone);
  const [way] = useState(() => installWay(navigator.userAgent, navigator.maxTouchPoints ?? 0));
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => onInstallChange(() => setState(installState())), []);
  useEffect(() => {
    const d = dialog.current;
    if (d === null) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Ya instalada, o en una compu cuyo navegador no instala: no hay nada que ofrecer.
  if (standalone || state.installed || (way === 'escritorio' && !state.canPrompt)) return null;

  const onClick = async () => {
    setCopied(false);
    if (!(await promptInstall())) setOpen(true);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/`);
      setCopied(true);
    } catch {
      // Sin portapapeles: queda la dirección escrita en el texto.
    }
  };
  const pasos =
    way === 'android'
      ? [
          { icono: <IconoMenu />, texto: t('instalar.android.1') },
          { icono: <IconoAgregar />, texto: t('instalar.android.2') },
        ]
      : [
          { icono: <IconoCompartir />, texto: t('instalar.ios.1') },
          { icono: <IconoAgregar />, texto: t('instalar.ios.2') },
        ];
  return (
    <>
      <button type="button" class="instalar-pie" onClick={() => void onClick()}>
        {t('instalar.boton')}
      </button>
      <dialog
        class="instalar-dialogo"
        ref={dialog}
        aria-labelledby="instalar-titulo"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // Tocar afuera de la tarjeta (en el fondo oscuro) también la cierra.
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <h2 id="instalar-titulo">{t('instalar.titulo')}</h2>
        <p>{t('instalar.bajada')}</p>
        {way === 'ios-otro' && (
          <div class="instalar-otro">
            <p>{t('instalar.iosotro')}</p>
            <button type="button" class="boton-chico" onClick={() => void copy()}>
              {t(copied ? 'instalar.copiado' : 'instalar.copiar')}
            </button>
          </div>
        )}
        <ol class="instalar-pasos">
          {pasos.map((p) => (
            <li key={p.texto}>
              <span class="instalar-icono">{p.icono}</span>
              <span>{p.texto}</span>
            </li>
          ))}
          <li>
            <img class="instalar-icono" src="/icon-192.png" alt="" width="40" height="40" />
            <span>{t('instalar.final')}</span>
          </li>
        </ol>
        <button type="button" class="boton boton-primario" onClick={() => setOpen(false)}>
          {t('instalar.listo')}
        </button>
      </dialog>
    </>
  );
}

export function Layout({ children, testnet, onBack }: { children: ComponentChildren; testnet: boolean; onBack?: (() => void) | undefined }) {
  const { t } = useI18n();
  return (
    <div class="pagina">
      {testnet && (
        <p class="aviso-red" role="note">
          {t('red.prueba')}
        </p>
      )}
      <SiteHeader />
      {onBack !== undefined && (
        <div class="barra-volver">
          <button type="button" class="boton-texto" onClick={onBack}>
            ← {t('atras')}
          </button>
        </div>
      )}
      <main class="contenido">{children}</main>
      <SiteFooter />
    </div>
  );
}

/** Título de cada pantalla: recibe el foco al aparecer, para lectores de pantalla y teclado. */
export function StepTitle({ children }: { children: ComponentChildren }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h2 class="titulo-paso" tabIndex={-1} ref={ref}>
      {children}
    </h2>
  );
}

type ButtonKind = 'primario' | 'acento' | 'contorno';

export function Button({
  kind = 'primario',
  children,
  disabled = false,
  onClick,
  type = 'button',
}: {
  kind?: ButtonKind;
  children: ComponentChildren;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button type={type} class={`boton boton-${kind}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'ok' | 'error'; children: ComponentChildren }) {
  return (
    <p class={`aviso aviso-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
