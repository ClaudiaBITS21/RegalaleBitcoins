import { type ComponentChildren, createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { type Key, LANG_NAMES, translate, UI_LANGS, type UiLang } from './i18n/index.ts';

export interface I18n {
  readonly lang: UiLang;
  readonly setLang: (lang: UiLang) => void;
  readonly t: (key: Key, vars?: Readonly<Record<string, string | number>>) => string;
}

export const I18nContext = createContext<I18n>({ lang: 'es', setLang: () => {}, t: (key, vars) => translate('es', key, vars) });
export const useI18n = (): I18n => useContext(I18nContext);

/** La marca como texto: "regalale" en tinta y "bitcoins" en el color de acento. */
export function Wordmark({ onOrange = false }: { onOrange?: boolean }) {
  return (
    <span class={`marca-texto${onOrange ? ' sobre-naranja' : ''}`}>
      regalale<span>bitcoins</span>
    </span>
  );
}

function LangPill() {
  const { t, lang, setLang } = useI18n();
  return (
    <label class="idioma-pill">
      <span class="solo-lector">{t('idioma')}</span>
      <select value={lang} onChange={(e) => setLang((e.currentTarget as HTMLSelectElement).value as UiLang)}>
        {UI_LANGS.map((l) => (
          <option value={l} key={l} aria-label={LANG_NAMES[l]}>
            {l.toUpperCase()}
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
      <div class="menu-item">
        <strong>
          {t('menu.lista')} <span class="etiqueta-pronto">{t('menu.pronto')}</span>
        </strong>
        <span>{t('menu.lista.d')}</span>
      </div>
      <div class="menu-item">
        <strong>
          {t('menu.mis')} <span class="etiqueta-pronto">{t('menu.pronto')}</span>
        </strong>
        <span>{t('menu.mis.d')}</span>
      </div>
    </>
  );
}

/** Encabezado del sitio: marca, menú (Regalar / Recibir / 21 razones) e idioma. */
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
        <a class="link-nav" href="/#razones">
          {t('menu.razones')}
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
            <p class="menu-titulo">{t('menu.recibir')}</p>
            <ReceiveItems />
            <a class="menu-link" href="/#razones" onClick={() => setMobileOpen(false)}>
              {t('razones.titulo')}
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
    </footer>
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
