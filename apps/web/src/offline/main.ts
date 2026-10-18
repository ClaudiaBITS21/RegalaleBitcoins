import {
  decodeGiftFragment,
  deriveGift,
  getNetwork,
  giftMnemonicFromEntropy,
  isValidMasterMnemonic,
  type Lang,
  LANGS,
  masterRootFromMnemonic,
  normalizeWord,
  openGiftWallet,
  passphraseFromWords,
} from '@regalale/core';
import { browserTrato } from '../i18n/trato.ts';

// Herramienta sin conexión (un solo archivo HTML, sin servidor ni internet). Hace lo mismo que la
// sección 6 de docs/derivacion.md: con el link y las 4 palabras da las 12 palabras y la contraseña
// para importar el regalo en Sparrow o Electrum; con el código de recuperación (12 palabras) lista
// los regalos que hiciste con su dirección. No manda nada a ningún lado: no tiene red.

type T = Record<string, string>;
const TEXTS: Record<'es' | 'pt' | 'en' | 'it', T> = {
  es: {
    titulo: 'Herramienta sin conexión',
    intro: 'Abre un regalo o recupera los tuyos sin depender de la web. Desconectá internet antes de escribir palabras: esta página no necesita red.',
    enLinea: 'Tenés internet conectado. Para más seguridad, desconectalo antes de escribir palabras.',
    red: 'Red',
    abrir: 'Abrir un regalo',
    recuperar: 'Recuperar mis regalos',
    link: 'Link del regalo (o lo que va después del #)',
    idiomaPalabras: 'Idioma de las 4 palabras',
    palabra: 'Palabra',
    calcular: 'Calcular',
    resultado: 'Importalo en Sparrow o Electrum: elegí "importar semilla BIP39", escribí las 12 palabras, activá "passphrase" y escribí la contraseña tal cual, y elegí segwit nativo (BIP84).',
    doce: '12 palabras (en inglés)',
    contrasena: 'Contraseña (passphrase)',
    direccion: 'Primera dirección: tiene que coincidir con la del regalo',
    codigo: 'Tu código de recuperación (12 palabras en inglés)',
    cuantos: 'Cuántos regalos revisar',
    idiomas: 'Idioma de quien recibió',
    listar: 'Listar mis regalos',
    listaTexto: 'Buscá estas direcciones en tu billetera o en un explorador (desde otro dispositivo). En la que tenga saldo, tocá "ver" e importá esas 12 palabras con su contraseña.',
    ver: 'ver',
    errLink: 'El link no es válido o está incompleto.',
    errPalabra: 'Alguna palabra no está en la lista de ese idioma.',
    errCodigo: 'El código de recuperación no es válido: revisá las 12 palabras.',
    huella: 'Huella de este archivo: compárala con la publicada en regalalebitcoin.com/sin-custodia y en GitHub.',
  },
  pt: {
    titulo: 'Ferramenta offline',
    intro: 'Abre um presente ou recupera os seus sem depender do site. Desconecte a internet antes de digitar palavras: esta página não precisa de rede.',
    enLinea: 'Você está com internet. Para mais segurança, desconecte antes de digitar palavras.',
    red: 'Rede',
    abrir: 'Abrir um presente',
    recuperar: 'Recuperar meus presentes',
    link: 'Link do presente (ou o que vem depois do #)',
    idiomaPalabras: 'Idioma das 4 palavras',
    palabra: 'Palavra',
    calcular: 'Calcular',
    resultado: 'Importe no Sparrow ou Electrum: escolha "importar semente BIP39", digite as 12 palavras, ative "passphrase" e digite a senha exatamente assim, e escolha segwit nativo (BIP84).',
    doce: '12 palavras (em inglês)',
    contrasena: 'Senha (passphrase)',
    direccion: 'Primeiro endereço: tem que coincidir com o do presente',
    codigo: 'Seu código de recuperação (12 palavras em inglês)',
    cuantos: 'Quantos presentes verificar',
    idiomas: 'Idioma de quem recebeu',
    listar: 'Listar meus presentes',
    listaTexto: 'Procure estes endereços na sua carteira ou num explorador (de outro aparelho). No que tiver saldo, toque em "ver" e importe essas 12 palavras com a senha.',
    ver: 'ver',
    errLink: 'O link não é válido ou está incompleto.',
    errPalabra: 'Alguma palavra não está na lista desse idioma.',
    errCodigo: 'O código de recuperação não é válido: revise as 12 palavras.',
    huella: 'Impressão digital deste arquivo: compare com a publicada em regalalebitcoin.com/sin-custodia e no GitHub.',
  },
  en: {
    titulo: 'Offline tool',
    intro: 'Opens a gift or recovers yours without relying on the website. Disconnect from the internet before typing words: this page needs no network.',
    enLinea: 'You’re online. For extra safety, disconnect before typing words.',
    red: 'Network',
    abrir: 'Open a gift',
    recuperar: 'Recover my gifts',
    link: 'Gift link (or what comes after the #)',
    idiomaPalabras: 'Language of the 4 words',
    palabra: 'Word',
    calcular: 'Calculate',
    resultado: 'Import it into Sparrow or Electrum: choose "import BIP39 seed", type the 12 words, enable "passphrase" and type it exactly, and choose native segwit (BIP84).',
    doce: '12 words (English)',
    contrasena: 'Passphrase',
    direccion: 'First address: it must match the gift’s',
    codigo: 'Your recovery code (12 English words)',
    cuantos: 'How many gifts to check',
    idiomas: 'Recipient’s language',
    listar: 'List my gifts',
    listaTexto: 'Look these addresses up in your wallet or a block explorer (from another device). For the one with a balance, tap "view" and import those 12 words with their passphrase.',
    ver: 'view',
    errLink: 'The link is invalid or incomplete.',
    errPalabra: 'A word isn’t in that language’s list.',
    errCodigo: 'The recovery code is invalid: check the 12 words.',
    huella: 'This file’s fingerprint: compare it with the one published at regalalebitcoin.com/sin-custodia and on GitHub.',
  },
  it: {
    titulo: 'Strumento offline',
    intro: 'Apre un regalo o recupera i tuoi senza dipendere dal sito. Disconnetti internet prima di scrivere parole: questa pagina non ha bisogno di rete.',
    enLinea: 'Sei connesso a internet. Per maggiore sicurezza, disconnettiti prima di scrivere parole.',
    red: 'Rete',
    abrir: 'Apri un regalo',
    recuperar: 'Recupera i miei regali',
    link: 'Link del regalo (o quello che viene dopo il #)',
    idiomaPalabras: 'Lingua delle 4 parole',
    palabra: 'Parola',
    calcular: 'Calcola',
    resultado: 'Importalo in Sparrow o Electrum: scegli "importa seed BIP39", scrivi le 12 parole, attiva "passphrase" e scrivila così com’è, e scegli segwit nativo (BIP84).',
    doce: '12 parole (in inglese)',
    contrasena: 'Passphrase',
    direccion: 'Primo indirizzo: deve coincidere con quello del regalo',
    codigo: 'Il tuo codice di recupero (12 parole in inglese)',
    cuantos: 'Quanti regali controllare',
    idiomas: 'Lingua di chi l’ha ricevuto',
    listar: 'Elenca i miei regali',
    listaTexto: 'Cerca questi indirizzi nel tuo portafoglio o in un explorer (da un altro dispositivo). In quello con saldo, tocca "vedi" e importa quelle 12 parole con la passphrase.',
    ver: 'vedi',
    errLink: 'Il link non è valido o è incompleto.',
    errPalabra: 'Una parola non è nella lista di quella lingua.',
    errCodigo: 'Il codice di recupero non è valido: controlla le 12 parole.',
    huella: 'Impronta di questo file: confrontala con quella pubblicata su regalalebitcoin.com/sin-custodia e su GitHub.',
  },
};
/** Castellano con tú (docs: CLAUDE.md, "vos y tú"): solo lo que cambia respecto del voseo. */
const TU: T = {
  intro: 'Abre un regalo o recupera los tuyos sin depender de la web. Desconecta internet antes de escribir palabras: esta página no necesita red.',
  enLinea: 'Tienes internet conectado. Para más seguridad, desconéctalo antes de escribir palabras.',
  resultado: 'Impórtalo en Sparrow o Electrum: elige "importar semilla BIP39", escribe las 12 palabras, activa "passphrase" y escribe la contraseña tal cual, y elige segwit nativo (BIP84).',
  listaTexto: 'Busca estas direcciones en tu billetera o en un explorador (desde otro dispositivo). En la que tenga saldo, toca "ver" e importa esas 12 palabras con su contraseña.',
  errCodigo: 'El código de recuperación no es válido: revisa las 12 palabras.',
};
const LANG_NAMES: Record<Lang, string> = { es: 'Español', pt: 'Português', en: 'English', it: 'Italiano' };
type Ui = 'es' | 'es-tu' | 'pt' | 'en' | 'it';
const UI_NAMES: Record<Ui, string> = { es: 'ES (vos)', 'es-tu': 'ES (tú)', pt: 'Português', en: 'English', it: 'Italiano' };

const nav = (navigator.language || 'es').slice(0, 2);
let ui: Ui = nav === 'es' ? (browserTrato() === 'tu' ? 'es-tu' : 'es') : nav === 'pt' || nav === 'en' || nav === 'it' ? nav : 'es';
const t = (k: string) => (ui === 'es-tu' ? (TU[k] ?? TEXTS.es[k]) : TEXTS[ui][k]) ?? k;

/** Crea un elemento con texto y atributos (sin innerHTML). */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<Record<string, string>> = {}, ...children: Array<Node | string>): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) e.setAttribute(k, v);
  for (const c of children) e.append(c);
  return e;
}
function select(options: ReadonlyArray<[string, string]>, value: string): HTMLSelectElement {
  const s = el('select');
  for (const [v, label] of options) s.append(el('option', { value: v, ...(v === value ? { selected: '' } : {}) }, label));
  return s;
}
const field = (label: string, input: HTMLElement) => el('label', { class: 'campo' }, el('span', {}, label), input);
const out = (label: string, value: string) => el('div', { class: 'dato' }, el('span', {}, label), el('code', {}, value));

function render(): void {
  const root = document.getElementById('app') as HTMLElement;
  root.replaceChildren();
  document.documentElement.lang = ui === 'es-tu' ? 'es' : ui;
  const uiSel = select((Object.keys(UI_NAMES) as Ui[]).map((l) => [l, UI_NAMES[l]]), ui);
  uiSel.addEventListener('change', () => {
    ui = uiSel.value as Ui;
    render();
  });
  const netSel = select([['mainnet', 'Bitcoin (mainnet)'], ['signet', 'Signet (prueba)']], 'mainnet');
  const net = () => getNetwork(netSel.value as 'mainnet' | 'signet', { allowMainnet: true });

  root.append(
    el('header', {}, el('h1', {}, `regalalebitcoin.com · ${t('titulo')}`), uiSel),
    el('p', {}, t('intro')),
  );
  if (navigator.onLine) root.append(el('p', { class: 'aviso' }, t('enLinea')));
  root.append(field(t('red'), netSel));

  // Abrir un regalo: link + 4 palabras → 12 palabras + contraseña + dirección.
  const link = el('input', { type: 'text', autocomplete: 'off', spellcheck: 'false' });
  const wordsLang = select(LANGS.map((l) => [l, LANG_NAMES[l]]), 'es');
  const words = [0, 1, 2, 3].map(() => el('input', { type: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' }));
  const openOut = el('div', { class: 'salida' });
  const openBtn = el('button', { type: 'button' }, t('calcular'));
  openBtn.addEventListener('click', () => {
    openOut.replaceChildren();
    let entropy: Uint8Array;
    try {
      const raw = link.value.trim();
      entropy = decodeGiftFragment(raw.includes('#') ? raw.slice(raw.indexOf('#') + 1) : raw);
    } catch {
      openOut.append(el('p', { class: 'error' }, t('errLink')));
      return;
    }
    const lang = wordsLang.value as Lang;
    const normalized = words.map((w) => normalizeWord(w.value, lang));
    if (normalized.some((w) => w === null)) {
      openOut.append(el('p', { class: 'error' }, t('errPalabra')));
      return;
    }
    const wallet = openGiftWallet(entropy, normalized as string[], lang, net());
    openOut.append(
      out(t('doce'), giftMnemonicFromEntropy(entropy)),
      out(t('contrasena'), passphraseFromWords(normalized as string[], lang)),
      out(t('direccion'), wallet.address),
      out('Path', wallet.path),
      el('p', {}, t('resultado')),
    );
    wallet.wipe();
  });
  root.append(
    el(
      'section',
      {},
      el('h2', {}, t('abrir')),
      field(t('link'), link),
      field(t('idiomaPalabras'), wordsLang),
      el('div', { class: 'palabras' }, ...words.map((w, i) => field(`${t('palabra')} ${i + 1}`, w))),
      openBtn,
      openOut,
    ),
  );

  // Recuperar: código de recuperación → regalos 0..N con su dirección por idioma.
  const code = el('textarea', { rows: '3', autocomplete: 'off', spellcheck: 'false' });
  const count = el('input', { type: 'number', min: '1', max: '200', value: '20' });
  const recLang = select([['todos', '—'], ...LANGS.map((l): [string, string] => [l, LANG_NAMES[l]])], 'todos');
  const recOut = el('div', { class: 'salida' });
  const recBtn = el('button', { type: 'button' }, t('listar'));
  recBtn.addEventListener('click', () => {
    recOut.replaceChildren();
    if (!isValidMasterMnemonic(code.value)) {
      recOut.append(el('p', { class: 'error' }, t('errCodigo')));
      return;
    }
    const rootKey = masterRootFromMnemonic(code.value);
    const n = Math.max(1, Math.min(200, Number(count.value) || 20));
    const langs = recLang.value === 'todos' ? LANGS : [recLang.value as Lang];
    const list = el('ol', { class: 'regalos', start: '0' });
    for (let i = 0; i < n; i++) {
      for (const lang of langs) {
        const g = deriveGift(rootKey, i, lang, net());
        const detail = el('details', {}, el('summary', {}, t('ver')), out(t('doce'), g.mnemonic), out(t('contrasena'), passphraseFromWords(g.passphraseWords, lang)));
        list.append(el('li', {}, el('span', {}, `#${i} · ${lang}`), el('code', {}, g.address), detail));
      }
    }
    recOut.append(el('p', {}, t('listaTexto')), list);
  });
  root.append(
    el('section', {}, el('h2', {}, t('recuperar')), field(t('codigo'), code), field(t('cuantos'), count), field(t('idiomas'), recLang), recBtn, recOut),
    el('footer', {}, el('p', {}, t('huella'))),
  );
}

render();
