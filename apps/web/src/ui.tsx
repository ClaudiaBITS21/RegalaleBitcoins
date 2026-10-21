import { type ComponentChildren, createContext, Fragment } from 'preact';
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

type Fondo = 'claro' | 'naranja' | 'negro';

/** Colores de la caja según el fondo: sobre naranja va blanca con la ₿ naranja; sobre negro, naranja con la ₿ blanca. */
const CAJA: Readonly<Record<Fondo, { caja: string; borde: string; sombra: string; b: string }>> = {
  claro: { caja: '#FF8A1F', borde: '#1A1530', sombra: '#1A1530', b: '#1A1530' },
  naranja: { caja: '#FFFFFF', borde: '#1A1530', sombra: '#1A1530', b: '#FF8A1F' },
  negro: { caja: '#FF8A1F', borde: '#000000', sombra: '#B3470A', b: '#FFFFFF' },
};

/** El ícono de la marca: una caja de regalo con moño y la ₿ del favicon. */
export function GiftMark({ fondo = 'claro' }: { fondo?: Fondo }) {
  const c = CAJA[fondo];
  return (
    <svg class="marca-caja" viewBox="38 34 148 160" aria-hidden="true">
      <g transform="rotate(-10 112 128)">
        <path d="M108 78c-14-30-46-34-46-14 0 12 24 17 46 14zM108 78c14-30 46-34 46-14 0 12-24 17-46 14z" fill={c.caja} stroke={c.borde} stroke-width="5" stroke-linejoin="round" />
        <rect x="64" y="86" width="104" height="96" rx="16" fill={c.sombra} />
        <rect x="56" y="78" width="104" height="96" rx="16" fill={c.caja} stroke={c.borde} stroke-width="5" />
        <g transform="translate(108 126) scale(1.75) translate(-33 -36)">
          <path
            d="M27 22v28M27 22h9.5a7 7 0 0 1 0 14H27M27 36h11a7 7 0 0 1 0 14H27M30.5 17.5V22M36.5 17.5V22M30.5 50v4.5M36.5 50v4.5"
            fill="none"
            stroke={c.b}
            stroke-width="5.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </g>
      </g>
    </svg>
  );
}

/**
 * La marca: la caja y "REGALALE" (600) "BITCOIN" (800). En mayúsculas el acento no se escribe,
 * así se lee igual como regalale, regálale, regalá o regala. Los lectores de pantalla oyen el nombre, no las letras.
 */
export function Wordmark({ onOrange = false }: { onOrange?: boolean }) {
  return (
    <span class={`marca-texto${onOrange ? ' sobre-naranja' : ''}`}>
      <span class="solo-lector">Regalale Bitcoin</span>
      <GiftMark fondo={onOrange ? 'naranja' : 'claro'} />
      <span class="marca-palabras" aria-hidden="true">
        REGALALE<span class="marca-bitcoin">BITCOIN</span>
      </span>
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
  // Cerrado muestra solo el idioma (ES); vos o tú se ven al desplegarlo. El select nativo queda
  // encima, transparente, para que la lista sea la del sistema.
  return (
    <label class="idioma-pill">
      <span class="solo-lector">{t('idioma')}</span>
      <span class="idioma-visible" aria-hidden="true">
        {lang.toUpperCase()}
      </span>
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

/**
 * El nombre de la marca dentro de un texto: «Regalale Bitcoin» separado y en naranja (handoff del
 * 19/10). Sin itálica ni negrita: un solo énfasis, el color.
 */
export function ConMarca({ text }: { text: string }) {
  // Con vos «Regalale Bitcoin», con tú «Regálale Bitcoin» (el acento sigue al trato).
  return (
    <>
      {text.split(/(Reg[aá]lale Bitcoin)/).map((p, i) =>
        i % 2 === 1 ? (
          <span class="nombre-marca" key={i}>
            {p}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

interface ItemMenu {
  readonly href: string;
  readonly label: Key;
  /** Bajada debajo del título (en los ítems de «Recibir»). */
  readonly desc?: Key;
  readonly destacado?: boolean;
}
interface GrupoMenu {
  readonly id: string;
  readonly label: Key;
  readonly items: readonly ItemMenu[];
  /** En compu va como botón con marco (sin relleno), al lado de [Regalar] que va con fondo. */
  readonly conMarco?: boolean;
  /** El panel se abre alineado a la derecha del botón (el último grupo, para no salirse). */
  readonly alDerecha?: boolean;
}

// Grupos del menú (handoff 2026-10-19, «marca y menú», con los cambios de Rodolfo del 19/10:
// «Recibir» agrupa Abrir un regalo, las listas y Mis regalos). Solo lo que ya existe: Paso a paso,
// Preguntas frecuentes, Precios y Mi plan se suman cuando estén. Regla: un tema nuevo entra en un
// grupo existente; arriba, como máximo, 4 links y 2 botones. «Seguridad» pasó al pie, en negrita
// (Rodolfo, 21/10).
const GRUPOS: readonly GrupoMenu[] = [
  {
    id: 'recibir',
    label: 'menu.recibir',
    conMarco: true,
    items: [
      { href: '/abrir', label: 'menu.abrirRegalo', desc: 'menu.abrirRegalo.d', destacado: true },
      { href: '/listas/nueva', label: 'menu.lista', desc: 'menu.lista.d' },
      { href: '/panel', label: 'menu.misRegalos', desc: 'menu.misRegalos.d' },
    ],
  },
  {
    id: 'porque',
    label: 'menu.porQueBitcoin',
    alDerecha: true,
    items: [
      { href: '/por-que', label: 'menu.razones' },
      { href: '/comparativa', label: 'menu.comparativa' },
      { href: '/por-que#historia', label: 'menu.historia' },
    ],
  },
];

/** Un ítem: link simple o, si tiene bajada, título y bajada (como en «Recibir»). */
function ItemDeMenu({ item, onClick }: { item: ItemMenu; onClick?: () => void }) {
  const { t } = useI18n();
  return item.desc === undefined ? (
    <a class="menu-link" href={item.href} onClick={onClick}>
      {t(item.label)}
    </a>
  ) : (
    <a class={`menu-item${item.destacado === true ? ' destacado' : ''}`} href={item.href} onClick={onClick}>
      <strong>{t(item.label)}</strong>
      <span>{t(item.desc)}</span>
    </a>
  );
}

function Desplegable({ grupo, abierto, onToggle }: { grupo: GrupoMenu; abierto: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  return (
    <div class="desplegable">
      <button type="button" class={`link-nav${grupo.conMarco === true ? ' link-nav-marco' : ''}`} aria-expanded={abierto} aria-haspopup="true" onClick={onToggle}>
        {t(grupo.label)}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d={abierto ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
        </svg>
      </button>
      {abierto && (
        <div class={`panel-menu panel-grupo${grupo.alDerecha === true ? ' panel-grupo-derecha' : ''}`}>
          {grupo.items.map((i) => (
            <ItemDeMenu item={i} key={i.href} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Encabezado del sitio: marca, menú agrupado, idioma, «Abrir un regalo» y [Regalar]. */
export function SiteHeader({ onOrange = false }: { onOrange?: boolean }) {
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null);
  const mobileRef = useDismiss(mobileOpen, () => setMobileOpen(false));
  const navRef = useDismiss(grupoAbierto !== null, () => setGrupoAbierto(null));
  const toggle = (id: string) => setGrupoAbierto((g) => (g === id ? null : id));
  return (
    <header class={`cabecera${onOrange ? ' cabecera-naranja' : ''}`}>
      <a class="marca" href="/">
        <Wordmark onOrange={onOrange} />
      </a>
      {/* Orden en compu (Rodolfo, 19/10): [Regalar] primero, después los menús y el idioma al final. */}
      <nav class="nav-compu" aria-label={t('menu.abrir')} ref={navRef}>
        <a class="boton-nav" href="/regalar">
          {t('menu.regalar')}
        </a>
        {/* Un grupo con una sola opción no es desplegable: va directo (Rodolfo, 20/10). */}
        {GRUPOS.map((g) => {
          const solo = g.items.length === 1 ? g.items[0] : undefined;
          return solo !== undefined ? (
            <a class="link-nav" href={solo.href} key={g.id}>
              {t(solo.label)}
            </a>
          ) : (
            <Desplegable grupo={g} abierto={grupoAbierto === g.id} onToggle={() => toggle(g.id)} key={g.id} />
          );
        })}
        <a class="link-nav" href="/precios">
          {t('menu.precios')}
        </a>
        <LangPill />
      </nav>
      <div class="nav-movil" ref={mobileRef}>
        <a class="boton-nav boton-nav-movil" href="/regalar">
          {t('menu.regalar')}
        </a>
        <button type="button" class="boton-hamburguesa" aria-expanded={mobileOpen} aria-label={t(mobileOpen ? 'menu.cerrar' : 'menu.abrir')} onClick={() => setMobileOpen(!mobileOpen)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
            <path d={mobileOpen ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} />
          </svg>
        </button>
        {mobileOpen && (
          <div class="panel-menu panel-movil">
            {GRUPOS.map((g) => (
              <div class="menu-seccion" key={g.id}>
                {g.items.length > 1 && <p class="menu-titulo">{t(g.label)}</p>}
                {g.items.map((i) => (
                  <ItemDeMenu item={i} key={i.href} onClick={() => setMobileOpen(false)} />
                ))}
              </div>
            ))}
            <div class="menu-seccion">
              <a class="menu-link" href="/precios" onClick={() => setMobileOpen(false)}>
                {t('menu.precios')}
              </a>
            </div>
            <div class="menu-idioma">
              <LangPill />
            </div>
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
      {/* El pie queda para las políticas (Rodolfo, 20/10). Términos, Cómo operamos y Contacto se
          suman cuando estén escritas. */}
      <nav class="pie-links" aria-label={t('pie.politicas')}>
        <a href="/sin-custodia">{t('menu.seguridad')}</a>
        <a href="/mediakit">{t('pie.mediakit')}</a>
        <a href="/privacidad">{t('pie.privacidad')}</a>
      </nav>
      <InstallButton />
      {/* Pie legal. El botón de arrepentimiento tiene que poder abrirse desde la página de inicio
          (Res. 424/2020), además de estar al final de Precios; la leyenda de Defensa del
          Consumidor es la de la Res. 38/2017. */}
      <small class="pie-legal">
        <span>© {new Date().getFullYear()} Regalale Bitcoin</span>
        <a href="/arrepentimiento">{t('pie.arrepentimiento')}</a>
        <a href="https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario" target="_blank" rel="noopener noreferrer">
          {t('pie.consumidor')}
        </a>
      </small>
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
