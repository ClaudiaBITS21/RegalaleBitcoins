import type { Trato, UiLang } from '../i18n/index.ts';

// Comparativa (handoff 2026-10-19, «comparativa»). El castellano con vos es copia exacta de
// docs/contenido/comparativa.es.json (fuente de verdad; un test lo controla). Con tú y pt, en e it
// son traducciones de ese texto. En los textos, *…* o _…_ es el nombre de la marca y **…**, negrita.

export type Valor = 'si' | 'no' | 'parcial';
export const COLUMNAS = ['gift_cards', 'vouchers_ln', 'tarjetas_fisicas', 'hacerlo_vos'] as const;
export type Columna = (typeof COLUMNAS)[number];
export const FILAS = [
  'sin_custodia',
  'on_chain',
  'solo_bitcoin',
  'sin_kyc',
  'sin_comisiones',
  'mensaje',
  'diseno_ocasion',
  'tarjeta',
  'listas',
  'sin_billetera',
  'guia',
  'ves_si_abrio',
  'no_se_pierde',
  'cancelar',
  'no_vence',
] as const;
export type Fila = (typeof FILAS)[number];

/** Qué tiene cada alternativa. Regalale Bitcoin, todo sí. */
export const VALORES: Readonly<Record<Fila, Readonly<Record<Columna, Valor>>>> = {
  sin_custodia: { gift_cards: 'no', vouchers_ln: 'parcial', tarjetas_fisicas: 'si', hacerlo_vos: 'si' },
  on_chain: { gift_cards: 'no', vouchers_ln: 'no', tarjetas_fisicas: 'si', hacerlo_vos: 'si' },
  solo_bitcoin: { gift_cards: 'parcial', vouchers_ln: 'si', tarjetas_fisicas: 'si', hacerlo_vos: 'si' },
  sin_kyc: { gift_cards: 'no', vouchers_ln: 'si', tarjetas_fisicas: 'si', hacerlo_vos: 'si' },
  sin_comisiones: { gift_cards: 'parcial', vouchers_ln: 'no', tarjetas_fisicas: 'si', hacerlo_vos: 'si' },
  mensaje: { gift_cards: 'si', vouchers_ln: 'no', tarjetas_fisicas: 'no', hacerlo_vos: 'parcial' },
  diseno_ocasion: { gift_cards: 'no', vouchers_ln: 'no', tarjetas_fisicas: 'no', hacerlo_vos: 'parcial' },
  tarjeta: { gift_cards: 'si', vouchers_ln: 'si', tarjetas_fisicas: 'si', hacerlo_vos: 'parcial' },
  listas: { gift_cards: 'no', vouchers_ln: 'no', tarjetas_fisicas: 'no', hacerlo_vos: 'no' },
  sin_billetera: { gift_cards: 'si', vouchers_ln: 'si', tarjetas_fisicas: 'si', hacerlo_vos: 'parcial' },
  guia: { gift_cards: 'si', vouchers_ln: 'no', tarjetas_fisicas: 'no', hacerlo_vos: 'no' },
  ves_si_abrio: { gift_cards: 'no', vouchers_ln: 'si', tarjetas_fisicas: 'parcial', hacerlo_vos: 'parcial' },
  no_se_pierde: { gift_cards: 'no', vouchers_ln: 'si', tarjetas_fisicas: 'no', hacerlo_vos: 'parcial' },
  cancelar: { gift_cards: 'no', vouchers_ln: 'si', tarjetas_fisicas: 'no', hacerlo_vos: 'no' },
  no_vence: { gift_cards: 'si', vouchers_ln: 'no', tarjetas_fisicas: 'parcial', hacerlo_vos: 'si' },
};

/** Párrafos del bloque «¿Y si se lo mando yo directo?» que van en cada columna. */
export const DIRECTO_COLUMNAS = { izquierda: [0, 1], derecha: [2, 3, 4] } as const;

export const RELEVADO = '2026-10';

export interface TextosComparativa {
  readonly kicker: string;
  readonly titulo: string;
  readonly bajada: string;
  readonly criterios: string;
  readonly valores: Readonly<Record<Valor, string>>;
  readonly columnas: Readonly<Record<Columna, readonly [titulo: string, bajada: string]>>;
  readonly filas: Readonly<Record<Fila, readonly [titulo: string, bajada: string]>>;
  readonly directoTitulo: string;
  readonly parrafos: readonly string[];
  readonly cta: string;
  readonly pie: string;
}

const es: TextosComparativa = {
  kicker: 'Comparativa',
  titulo: '¿En qué se diferencia *Regalale Bitcoin*?',
  bajada: 'Hay muchas formas de regalar bitcoin, pero ninguna tan cómoda y humanizada como *Regalale Bitcoin*.',
  criterios: 'Lo ideal en un regalo',
  valores: { si: 'Sí', no: 'No', parcial: 'Parcial o varía según el servicio' },
  columnas: {
    gift_cards: ['Gift cards custodiadas', 'Con cuenta en una plataforma'],
    vouchers_ln: ['Vouchers LN', 'Código o QR Lightning'],
    tarjetas_fisicas: ['Tarjetas físicas', 'NFC o USB'],
    hacerlo_vos: ['Hacerlo vos', 'Paper wallet o envío directo'],
  },
  filas: {
    sin_custodia: ['Sin custodia', 'El bitcoin es de quien lo recibe, sin riesgo del emisor hasta el canje.'],
    on_chain: ['On-chain', 'Queda en la red de Bitcoin, no en una base de datos interna o paralela.'],
    solo_bitcoin: ['Solo bitcoin', 'Sin altcoins, stablecoins ni shitcoins.'],
    sin_kyc: ['Sin KYC', 'Solo tu mail para seguir tus regalos. Sin documentos, y quien recibe no necesita nada.'],
    sin_comisiones: ['Sin comisiones', 'Llega el total (salvo el fee on-chain).'],
    mensaje: ['Mensaje personal', 'El regalo llega con un mensaje y una tarjeta ad hoc.'],
    diseno_ocasion: ['Diseño según la ocasión', 'Cumpleaños, bautismo, Navidad y más.'],
    tarjeta: ['Tarjeta física o imprimible', 'Para darlo en mano.'],
    listas: ['Listas de regalo', 'Varios invitados aportan a un mismo regalo.'],
    sin_billetera: ['Sirve aunque no tenga billetera', 'No necesitás pedirle una dirección antes.'],
    guia: ['Guía para el que no sabe', 'Paso a paso para abrirlo por primera vez.'],
    ves_si_abrio: ['Ves si lo abrió', 'Podés ver si reclamaron el regalo.'],
    no_se_pierde: ['Si no lo abre, no se pierde', 'Mientras una de las partes tenga los datos originales.'],
    cancelar: ['Lo podés cancelar', 'Mientras no lo haya abierto.'],
    no_vence: ['No vence', 'Se puede reclamar sin ningún tipo de vencimiento.'],
  },
  directoTitulo: '¿Y si se lo mando yo directo?',
  parrafos: [
    'Claro que sí, y es lo que todos hacíamos hasta hoy: le hacemos bajar una billetera, se lo damos en un papel o se lo mandamos cuando todavía no está listo para recibirlo.',
    'Pero todos sabemos cómo termina: el que lo recibe se olvida, o no era el momento para prestar atención, y la verdad es que no se siente como un regalo sino como una transferencia y un peso.',
    '**_Regalale Bitcoin_ propone algo distinto, más parecido a un regalo de verdad.**',
    'Si todavía no tiene billetera o no está listo, no pasa nada: el regalo llega con una tarjeta y un mensaje tuyo, con una guía para acompañarlo cuando quiera abrirlo y con recordatorios para vos si aún no lo abrió.',
    'Y cuando decida abrirlo, va a ser porque está listo, y le va a poner cabeza propia a entender cómo guardarlo. Si no, sigue ahí para siempre, o hasta que vos decidas lo contrario.',
  ],
  cta: 'Regalá bitcoin de verdad',
  pie: 'Relevamiento propio con información pública, octubre de 2026. Los servicios cambian: si ves un dato desactualizado, escribinos a hola@regalalebitcoin.com y lo corregimos.',
};

const esTu: TextosComparativa = {
  kicker: 'Comparativa',
  titulo: '¿En qué se diferencia *Regálale Bitcoin*?',
  bajada: 'Hay muchas formas de regalar bitcoin, pero ninguna tan cómoda y humanizada como *Regálale Bitcoin*.',
  criterios: 'Lo ideal en un regalo',
  valores: { si: 'Sí', no: 'No', parcial: 'Parcial o varía según el servicio' },
  columnas: {
    gift_cards: ['Gift cards custodiadas', 'Con cuenta en una plataforma'],
    vouchers_ln: ['Vouchers LN', 'Código o QR Lightning'],
    tarjetas_fisicas: ['Tarjetas físicas', 'NFC o USB'],
    hacerlo_vos: ['Hacerlo tú', 'Paper wallet o envío directo'],
  },
  filas: {
    sin_custodia: ['Sin custodia', 'El bitcoin es de quien lo recibe, sin riesgo del emisor hasta el canje.'],
    on_chain: ['On-chain', 'Queda en la red de Bitcoin, no en una base de datos interna o paralela.'],
    solo_bitcoin: ['Solo bitcoin', 'Sin altcoins, stablecoins ni shitcoins.'],
    sin_kyc: ['Sin KYC', 'Solo tu mail para seguir tus regalos. Sin documentos, y quien recibe no necesita nada.'],
    sin_comisiones: ['Sin comisiones', 'Llega el total (salvo el fee on-chain).'],
    mensaje: ['Mensaje personal', 'El regalo llega con un mensaje y una tarjeta ad hoc.'],
    diseno_ocasion: ['Diseño según la ocasión', 'Cumpleaños, bautismo, Navidad y más.'],
    tarjeta: ['Tarjeta física o imprimible', 'Para darlo en mano.'],
    listas: ['Listas de regalo', 'Varios invitados aportan a un mismo regalo.'],
    sin_billetera: ['Sirve aunque no tenga billetera', 'No necesitas pedirle una dirección antes.'],
    guia: ['Guía para el que no sabe', 'Paso a paso para abrirlo por primera vez.'],
    ves_si_abrio: ['Ves si lo abrió', 'Puedes ver si reclamaron el regalo.'],
    no_se_pierde: ['Si no lo abre, no se pierde', 'Mientras una de las partes tenga los datos originales.'],
    cancelar: ['Lo puedes cancelar', 'Mientras no lo haya abierto.'],
    no_vence: ['No vence', 'Se puede reclamar sin ningún tipo de vencimiento.'],
  },
  directoTitulo: '¿Y si se lo mando yo directo?',
  parrafos: [
    'Claro que sí, y es lo que todos hacíamos hasta hoy: le hacemos bajar una billetera, se lo damos en un papel o se lo mandamos cuando todavía no está listo para recibirlo.',
    'Pero todos sabemos cómo termina: el que lo recibe se olvida, o no era el momento para prestar atención, y la verdad es que no se siente como un regalo sino como una transferencia y un peso.',
    '**_Regálale Bitcoin_ propone algo distinto, más parecido a un regalo de verdad.**',
    'Si todavía no tiene billetera o no está listo, no pasa nada: el regalo llega con una tarjeta y un mensaje tuyo, con una guía para acompañarlo cuando quiera abrirlo y con recordatorios para ti si aún no lo abrió.',
    'Y cuando decida abrirlo, va a ser porque está listo, y le va a poner cabeza propia a entender cómo guardarlo. Si no, sigue ahí para siempre, o hasta que tú decidas lo contrario.',
  ],
  cta: 'Regala bitcoin de verdad',
  pie: 'Relevamiento propio con información pública, octubre de 2026. Los servicios cambian: si ves un dato desactualizado, escríbenos a hola@regalalebitcoin.com y lo corregimos.',
};

const pt: TextosComparativa = {
  kicker: 'Comparativo',
  titulo: 'O que diferencia o *Regalale Bitcoin*?',
  bajada: 'Há muitas formas de presentear bitcoin, mas nenhuma tão prática e humana quanto o *Regalale Bitcoin*.',
  criterios: 'O ideal em um presente',
  valores: { si: 'Sim', no: 'Não', parcial: 'Parcial ou varia conforme o serviço' },
  columnas: {
    gift_cards: ['Gift cards custodiados', 'Com conta em uma plataforma'],
    vouchers_ln: ['Vouchers LN', 'Código ou QR Lightning'],
    tarjetas_fisicas: ['Cartões físicos', 'NFC ou USB'],
    hacerlo_vos: ['Fazer você mesmo', 'Paper wallet ou envio direto'],
  },
  filas: {
    sin_custodia: ['Sem custódia', 'O bitcoin é de quem recebe, sem risco do emissor até o resgate.'],
    on_chain: ['On-chain', 'Fica na rede Bitcoin, não em um banco de dados interno ou paralelo.'],
    solo_bitcoin: ['Só bitcoin', 'Sem altcoins, stablecoins nem shitcoins.'],
    sin_kyc: [
      'Sem KYC',
      'Só o seu e-mail para acompanhar seus presentes. Sem documentos, e quem recebe não precisa de nada.',
    ],
    sin_comisiones: ['Sem comissões', 'Chega o total (salvo a taxa on-chain).'],
    mensaje: ['Mensagem pessoal', 'O presente chega com uma mensagem e um cartão feito para ele.'],
    diseno_ocasion: ['Design conforme a ocasião', 'Aniversário, batizado, Natal e muito mais.'],
    tarjeta: ['Cartão físico ou para imprimir', 'Para entregar em mãos.'],
    listas: ['Listas de presentes', 'Vários convidados contribuem para um mesmo presente.'],
    sin_billetera: ['Funciona mesmo sem carteira', 'Você não precisa pedir um endereço antes.'],
    guia: ['Guia para quem não sabe', 'Passo a passo para abrir pela primeira vez.'],
    ves_si_abrio: ['Você vê se abriu', 'Dá para ver se o presente foi resgatado.'],
    no_se_pierde: ['Se não abrir, não se perde', 'Enquanto uma das partes tiver os dados originais.'],
    cancelar: ['Dá para cancelar', 'Enquanto não tiver sido aberto.'],
    no_vence: ['Não vence', 'Pode ser resgatado sem nenhum tipo de prazo.'],
  },
  directoTitulo: 'E se eu mandar direto?',
  parrafos: [
    'Claro que sim, e é o que todos fazíamos até hoje: pedimos para baixar uma carteira, damos em um papel ou mandamos quando a pessoa ainda não está pronta para receber.',
    'Mas todos sabemos como termina: quem recebe esquece, ou não era o momento de prestar atenção, e a verdade é que não parece um presente, e sim uma transferência e um peso.',
    '**O _Regalale Bitcoin_ propõe algo diferente, mais parecido com um presente de verdade.**',
    'Se ainda não tem carteira ou não está pronto, tudo bem: o presente chega com um cartão e uma mensagem sua, com um guia para acompanhar quando quiser abrir e com lembretes para você se ainda não tiver sido aberto.',
    'E quando decidir abrir, vai ser porque está pronto, e vai pensar por conta própria em como guardar. Se não, continua lá para sempre, ou até você decidir o contrário.',
  ],
  cta: 'Presenteie bitcoin de verdade',
  pie: 'Levantamento próprio com informações públicas, outubro de 2026. Os serviços mudam: se você vir um dado desatualizado, escreva para hola@regalalebitcoin.com e nós corrigimos.',
};

const en: TextosComparativa = {
  kicker: 'Comparison',
  titulo: 'What makes *Regalale Bitcoin* different?',
  bajada: 'There are many ways to give bitcoin, but none as easy and human as *Regalale Bitcoin*.',
  criterios: 'What a gift should have',
  valores: { si: 'Yes', no: 'No', parcial: 'Partly, or depends on the service' },
  columnas: {
    gift_cards: ['Custodial gift cards', 'With an account on a platform'],
    vouchers_ln: ['LN vouchers', 'Lightning code or QR'],
    tarjetas_fisicas: ['Physical cards', 'NFC or USB'],
    hacerlo_vos: ['Do it yourself', 'Paper wallet or direct transfer'],
  },
  filas: {
    sin_custodia: ['Non-custodial', 'The bitcoin belongs to the recipient, with no issuer risk until it’s claimed.'],
    on_chain: ['On-chain', 'It lives on the Bitcoin network, not in an internal or parallel database.'],
    solo_bitcoin: ['Bitcoin only', 'No altcoins, stablecoins or shitcoins.'],
    sin_kyc: ['No KYC', 'Just your email to keep track of your gifts. No ID, and the recipient needs nothing.'],
    sin_comisiones: ['No fees', 'The full amount arrives (except the on-chain fee).'],
    mensaje: ['Personal message', 'The gift comes with a message and a card made for it.'],
    diseno_ocasion: ['Designed for the occasion', 'Birthdays, baptisms, Christmas and more.'],
    tarjeta: ['Physical or printable card', 'To hand it over in person.'],
    listas: ['Gift lists', 'Several guests chip in to the same gift.'],
    sin_billetera: ['Works even without a wallet', 'No need to ask them for an address first.'],
    guia: ['Guide for beginners', 'Step by step to open it for the first time.'],
    ves_si_abrio: ['You see if it was opened', 'You can see whether the gift was claimed.'],
    no_se_pierde: ['If unopened, it isn’t lost', 'As long as one of the parties keeps the original details.'],
    cancelar: ['You can cancel it', 'As long as it hasn’t been opened.'],
    no_vence: ['Never expires', 'It can be claimed with no expiry of any kind.'],
  },
  directoTitulo: 'What if I just send it directly?',
  parrafos: [
    'Of course you can, and it’s what we all did until now: we get them to download a wallet, give it to them on paper, or send it before they’re ready to receive it.',
    'But we all know how it ends: the recipient forgets, or it wasn’t the moment to pay attention, and honestly it doesn’t feel like a gift but like a transfer and a chore.',
    '**_Regalale Bitcoin_ offers something different, closer to a real gift.**',
    'If they don’t have a wallet yet or aren’t ready, no problem: the gift arrives with a card and a message from you, with a guide to help them whenever they want to open it, and with reminders for you if it hasn’t been opened yet.',
    'And when they decide to open it, it’ll be because they’re ready, and they’ll take the time to understand how to keep it. If not, it stays there forever, or until you decide otherwise.',
  ],
  cta: 'Give real bitcoin',
  pie: 'Our own survey of public information, October 2026. Services change: if you see outdated information, write to hola@regalalebitcoin.com and we’ll fix it.',
};

const it: TextosComparativa = {
  kicker: 'Confronto',
  titulo: 'Cosa rende diverso *Regalale Bitcoin*?',
  bajada: 'Ci sono tanti modi di regalare bitcoin, ma nessuno così comodo e umano come *Regalale Bitcoin*.',
  criterios: 'L’ideale in un regalo',
  valores: { si: 'Sì', no: 'No', parcial: 'In parte o dipende dal servizio' },
  columnas: {
    gift_cards: ['Gift card custodite', 'Con un account su una piattaforma'],
    vouchers_ln: ['Voucher LN', 'Codice o QR Lightning'],
    tarjetas_fisicas: ['Carte fisiche', 'NFC o USB'],
    hacerlo_vos: ['Fai da te', 'Paper wallet o invio diretto'],
  },
  filas: {
    sin_custodia: ['Senza custodia', 'Il bitcoin è di chi lo riceve, senza rischio dell’emittente fino al riscatto.'],
    on_chain: ['On-chain', 'Resta sulla rete Bitcoin, non in un database interno o parallelo.'],
    solo_bitcoin: ['Solo bitcoin', 'Niente altcoin, stablecoin né shitcoin.'],
    sin_kyc: [
      'Senza KYC',
      'Solo la tua email per seguire i tuoi regali. Nessun documento, e chi riceve non ha bisogno di niente.',
    ],
    sin_comisiones: ['Senza commissioni', 'Arriva tutto (salvo la fee on-chain).'],
    mensaje: ['Messaggio personale', 'Il regalo arriva con un messaggio e un biglietto fatto apposta.'],
    diseno_ocasion: ['Grafica per l’occasione', 'Compleanno, battesimo, Natale e altro.'],
    tarjeta: ['Biglietto fisico o da stampare', 'Per consegnarlo a mano.'],
    listas: ['Liste regalo', 'Più invitati contribuiscono allo stesso regalo.'],
    sin_billetera: ['Funziona anche senza portafoglio', 'Non devi chiedergli prima un indirizzo.'],
    guia: ['Guida per chi non sa', 'Passo passo per aprirlo la prima volta.'],
    ves_si_abrio: ['Vedi se l’ha aperto', 'Puoi vedere se il regalo è stato riscattato.'],
    no_se_pierde: ['Se non lo apre, non si perde', 'Finché una delle parti ha i dati originali.'],
    cancelar: ['Puoi annullarlo', 'Finché non è stato aperto.'],
    no_vence: ['Non scade', 'Si può riscattare senza alcuna scadenza.'],
  },
  directoTitulo: 'E se glielo mando direttamente?',
  parrafos: [
    'Certo che sì, ed è quello che facevamo tutti finora: gli facciamo scaricare un portafoglio, glielo diamo su un foglio o glielo mandiamo quando non è ancora pronto a riceverlo.',
    'Ma sappiamo tutti come va a finire: chi lo riceve se ne dimentica, o non era il momento di prestare attenzione, e in fondo non sembra un regalo ma un bonifico e un peso.',
    '**_Regalale Bitcoin_ propone qualcosa di diverso, più simile a un regalo vero.**',
    'Se non ha ancora un portafoglio o non è pronto, nessun problema: il regalo arriva con un biglietto e un tuo messaggio, con una guida per accompagnarlo quando vorrà aprirlo e con promemoria per te se non l’ha ancora aperto.',
    'E quando deciderà di aprirlo, sarà perché è pronto, e ci metterà la testa per capire come conservarlo. Altrimenti resta lì per sempre, o finché non decidi tu il contrario.',
  ],
  cta: 'Regala bitcoin vero',
  pie: 'Ricerca nostra su informazioni pubbliche, ottobre 2026. I servizi cambiano: se vedi un dato non aggiornato, scrivici a hola@regalalebitcoin.com e lo correggiamo.',
};

export const COMPARATIVA: Readonly<Record<UiLang, TextosComparativa>> = { es, pt, en, it };

/** Los textos en el idioma y el trato de quien lee. */
export function comparativaFor(lang: UiLang, trato: Trato): TextosComparativa {
  return lang === 'es' && trato === 'tu' ? esTu : COMPARATIVA[lang];
}

export { esTu as COMPARATIVA_TU };
