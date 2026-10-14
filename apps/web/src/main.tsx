import '@fontsource/bricolage-grotesque/latin-800.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-700.css';
import './styles.css';
import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { ClaimPage } from './claim/ClaimPage.tsx';
import { GivePage } from './give/GivePage.tsx';
import { ALLOW_MAINNET } from './config.ts';
import { Home } from './home.tsx';
import { detectLang, translate, type UiLang } from './i18n/index.ts';
import { OpenGiftPage } from './open.tsx';
import { PanelPage } from './panel/PanelPage.tsx';
import { I18nContext } from './ui.tsx';

const LANG_KEY = 'idioma';

function savedLang(): string | null {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

function App() {
  const [lang, setLangState] = useState<UiLang>(() => detectLang(savedLang(), navigator.languages ?? [navigator.language]));
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const i18n = useMemo(
    () => ({
      lang,
      setLang: (l: UiLang) => {
        setLangState(l);
        try {
          localStorage.setItem(LANG_KEY, l);
        } catch {
          // Sin almacenamiento (modo privado): el idioma vale solo para esta visita.
        }
      },
      t: (key: Parameters<typeof translate>[1], vars?: Readonly<Record<string, string | number>>) => translate(lang, key, vars),
    }),
    [lang],
  );
  const path = window.location.pathname;
  const claim = /^\/r\/([A-Za-z0-9_-]{22})\/?$/.exec(path);
  return (
    <I18nContext.Provider value={i18n}>
      {claim?.[1] !== undefined ? (
        <ClaimPage id={claim[1]} />
      ) : /^\/regalar\/?$/.test(path) ? (
        <GivePage />
      ) : /^\/panel\/?$/.test(path) ? (
        <PanelPage />
      ) : /^\/abrir\/?$/.test(path) ? (
        <OpenGiftPage />
      ) : (
        <Home testnet={!ALLOW_MAINNET} />
      )}
    </I18nContext.Provider>
  );
}

render(<App />, document.getElementById('app') as HTMLElement);
