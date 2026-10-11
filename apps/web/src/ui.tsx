import { type ComponentChildren, createContext } from 'preact';
import { useContext, useEffect, useRef } from 'preact/hooks';
import { type Key, LANG_NAMES, translate, UI_LANGS, type UiLang } from './i18n/index.ts';

export interface I18n {
  readonly lang: UiLang;
  readonly setLang: (lang: UiLang) => void;
  readonly t: (key: Key, vars?: Readonly<Record<string, string | number>>) => string;
}

export const I18nContext = createContext<I18n>({ lang: 'es', setLang: () => {}, t: (key, vars) => translate('es', key, vars) });
export const useI18n = (): I18n => useContext(I18nContext);

export function Logo() {
  return (
    <svg class="logo" width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <path d="M11 9c-3-4 2-7 6 0c4-7 9-4 6 0" />
      <rect x="5" y="10" width="24" height="19" rx="3" />
      <path d="M13 14h6a3 3 0 0 1 0 6h-6v-6zM13 20h7a3 3 0 0 1 0 6h-7v-6zM15 12v2M15 26v2" />
    </svg>
  );
}

export function Layout({ children, testnet, onBack }: { children: ComponentChildren; testnet: boolean; onBack?: (() => void) | undefined }) {
  const { t, lang, setLang } = useI18n();
  return (
    <div class="pagina">
      {testnet && (
        <p class="aviso-red" role="note">
          {t('red.prueba')}
        </p>
      )}
      <header class="cabecera">
        <a class="marca" href="/">
          <Logo />
          <span>{t('marca')}</span>
        </a>
        <div class="cabecera-acciones">
          <label class="selector-idioma">
            <span class="solo-lector">{t('idioma')}</span>
            <select value={lang} onChange={(e) => setLang((e.currentTarget as HTMLSelectElement).value as UiLang)}>
              {UI_LANGS.map((l) => (
                <option value={l} key={l}>
                  {LANG_NAMES[l]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      {onBack !== undefined && (
        <div class="barra-volver">
          <button type="button" class="boton-texto" onClick={onBack}>
            ← {t('atras')}
          </button>
        </div>
      )}
      <main class="contenido">{children}</main>
      <footer class="pie">{t('pie')}</footer>
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
