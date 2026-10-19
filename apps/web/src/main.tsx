import '@fontsource/bricolage-grotesque/latin-600.css';
import '@fontsource/bricolage-grotesque/latin-800.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/caveat/latin-700.css';
import './styles.css';
import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { ComparisonPage } from './comparativa.tsx';
import { PricingPage } from './precios.tsx';
import { BuyPage } from './comprar.tsx';
import { RefundPage } from './arrepentimiento.tsx';
import { ClaimPage } from './claim/ClaimPage.tsx';
import { GivePage } from './give/GivePage.tsx';
import { ALLOW_MAINNET } from './config.ts';
import { Home } from './home.tsx';
import { detectLang, translate, type UiLang } from './i18n/index.ts';
import { browserTrato, type Trato } from './i18n/trato.ts';
import { OpenGiftPage } from './open.tsx';
import { AdminPage } from './admin/AdminPage.tsx';
import { ContributionPage } from './lists/ContributionPage.tsx';
import { ListPage } from './lists/ListPage.tsx';
import { NewListPage } from './lists/NewListPage.tsx';
import { PanelPage } from './panel/PanelPage.tsx';
import { listenForInstall } from './pwa.ts';
import { WhyPage } from './porque.tsx';
import { NoCustodyPage } from './sincustodia.tsx';
import { I18nContext } from './ui.tsx';

const LANG_KEY = 'idioma';

/** Franja «en desarrollo» arriba de todo (pedido de Rodolfo, 19/10). Se saca cuando ella lo diga. */
const EN_DESARROLLO = true;

function savedLang(): string | null {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

/** Idioma y trato: lo que eligió la persona ("es-tu" es castellano con tú) o lo que dice el dispositivo. */
function initialLang(): { lang: UiLang; trato: Trato } {
  const saved = savedLang();
  if (saved === 'es-tu') return { lang: 'es', trato: 'tu' };
  if (saved === 'es') return { lang: 'es', trato: 'vos' };
  return { lang: detectLang(saved, navigator.languages ?? [navigator.language]), trato: browserTrato() };
}

function App() {
  const [{ lang, trato }, setLangState] = useState(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const i18n = useMemo(
    () => ({
      lang,
      trato,
      setLang: (l: UiLang, tr: Trato = trato) => {
        setLangState({ lang: l, trato: tr });
        try {
          localStorage.setItem(LANG_KEY, l === 'es' && tr === 'tu' ? 'es-tu' : l);
        } catch {
          // Sin almacenamiento (modo privado): el idioma vale solo para esta visita.
        }
      },
      t: (key: Parameters<typeof translate>[1], vars?: Readonly<Record<string, string | number>>) => translate(lang, key, vars, trato),
    }),
    [lang, trato],
  );
  const path = window.location.pathname;
  const claim = /^\/r\/([A-Za-z0-9_-]{22})\/?$/.exec(path);
  const list = /^\/l\/([A-Za-z0-9_-]{22})\/?$/.exec(path);
  return (
    <I18nContext.Provider value={i18n}>
      {EN_DESARROLLO && (
        <p class="aviso-desarrollo" role="note">
          {i18n.t('aviso.desarrollo')}
        </p>
      )}
      {claim?.[1] !== undefined ? (
        <ClaimPage id={claim[1]} />
      ) : list?.[1] !== undefined ? (
        <ListPage id={list[1]} />
      ) : /^\/listas\/nueva\/?$/.test(path) ? (
        <NewListPage />
      ) : /^\/aporte\/?$/.test(path) ? (
        <ContributionPage />
      ) : /^\/regalar\/?$/.test(path) ? (
        <GivePage />
      ) : /^\/admin\/?$/.test(path) ? (
        <AdminPage />
      ) : /^\/panel\/?$/.test(path) ? (
        <PanelPage />
      ) : /^\/abrir\/?$/.test(path) ? (
        <OpenGiftPage />
      ) : /^\/por-que\/?$/.test(path) ? (
        <WhyPage testnet={!ALLOW_MAINNET} />
      ) : /^\/arrepentimiento\/?$/.test(path) ? (
        <RefundPage testnet={!ALLOW_MAINNET} />
      ) : /^\/comprar\/?$/.test(path) ? (
        <BuyPage testnet={!ALLOW_MAINNET} />
      ) : /^\/precios\/?$/.test(path) ? (
        <PricingPage testnet={!ALLOW_MAINNET} />
      ) : /^\/comparativa\/?$/.test(path) ? (
        <ComparisonPage testnet={!ALLOW_MAINNET} />
      ) : /^\/sin-custodia\/?$/.test(path) ? (
        <NoCustodyPage testnet={!ALLOW_MAINNET} />
      ) : (
        <Home testnet={!ALLOW_MAINNET} />
      )}
    </I18nContext.Provider>
  );
}

listenForInstall();
render(<App />, document.getElementById('app') as HTMLElement);
