import type { Trato, UiLang } from '../i18n/index.ts';
import { esTu } from './razones-tu.ts';

// Las 21 razones. El castellano es copia exacta de docs/contenido/razones.es.json (fuente
// de verdad; un test lo controla). pt, en e it son traducciones de ese texto.

export type Reason = readonly [title: string, detail: string];

const es: readonly Reason[] = [
  ['Es original.', 'Seguro que nadie más en la mesa regala lo mismo.'],
  ['No hay que adivinar el talle, el color ni el gusto.', 'Ni guardar el ticket de cambio.'],
  ['No ocupa lugar y no se rompe.', 'Entra en el celular o en un papelito, y dura más que cualquier juguete.'],
  ['Se ajusta a tu bolsillo.', 'No hace falta regalar un bitcoin entero: se divide en 100 millones de partes, así que podés regalar desde muy poquito.'],
  ['Sirve para cualquier edad.', 'Desde un bautismo hasta los 90 años del abuelo.'],
  ['Es personal.', 'Tu mensaje, su nombre y una imagen hecha para la ocasión.'],
  ['Lleva un mensaje.', 'Es una invitación a pensar en el ahorro y en el largo plazo.'],
  ['Es el mismo regalo para todos, pero cada uno lo vive distinto.', 'A uno le despierta curiosidad, otro lo guarda y otro arranca a investigar.'],
  ['Va a disparar una linda charla, seguro.', 'Alguien pregunta qué es, y la sobremesa ya está armada.'],
  ['Une generaciones.', 'El nieto le explica al abuelo, o el abuelo sorprende al nieto sabiendo más.'],
  ['Llega aunque estés lejos.', 'Sin envío, sin aduana y sin cambio de moneda: el mismo regalo vale para tu sobrino en Brasil y para tu abuela en Italia.'],
  ['Se arma en dos minutos.', 'Desde el celular, también la noche anterior, y sin que se note que fue de último momento.'],
  ['No hace falta una computadora para recibirlo.', 'Lo imprimís en una tarjeta, se lo das en mano y lo reclama cuando quiera.'],
  ['Viene con instrucciones.', 'Una guía paso a paso para crear su billetera y reclamarlo. Y sin pilas.'],
  ['Se puede regalar entre varios.', 'Cada uno pone lo que puede y le llega todo junto.'],
  ['Sabés si lo reclamó.', 'Ves cuándo lo hizo, sin tener que preguntar.'],
  ['Si no lo quiere, vos lo recuperás o él lo canjea por dinero.', 'No hay regalo que quede tirado.'],
  ['Es de quien lo recibe, de verdad.', 'Queda en su propia billetera: ni nosotros ni nadie se lo puede congelar ni quitar.'],
  ['No es un vale, es bitcoin de verdad.', 'Un vale tiene fecha, un catálogo y una empresa detrás que lo tiene que honrar. Esto ya es bitcoin desde el primer día, no vence y lo usa como quiera.'],
  ['Funciona desde 2009 y nunca cerró.', 'Ni un feriado, ni un domingo, ni un 25 de diciembre.'],
  ['Nunca va a haber más de 21 millones.', 'Le estás regalando un pedacito de algo que nadie puede fabricar.'],
];

const pt: readonly Reason[] = [
  ['É original.', 'Com certeza ninguém mais na mesa vai dar o mesmo presente.'],
  ['Não precisa adivinhar tamanho, cor nem gosto.', 'Nem guardar a nota para trocar.'],
  ['Não ocupa espaço e não quebra.', 'Cabe no celular ou num papelzinho, e dura mais que qualquer brinquedo.'],
  ['Cabe no seu bolso.', 'Não precisa dar um bitcoin inteiro: ele se divide em 100 milhões de partes, então dá para presentear a partir de bem pouquinho.'],
  ['Serve para qualquer idade.', 'De um batizado aos 90 anos do avô.'],
  ['É pessoal.', 'Sua mensagem, o nome da pessoa e uma imagem feita para a ocasião.'],
  ['Leva uma mensagem.', 'É um convite a pensar em poupança e no longo prazo.'],
  ['É o mesmo presente para todos, mas cada um vive de um jeito.', 'Em um desperta curiosidade, outro guarda e outro começa a pesquisar.'],
  ['Vai render uma boa conversa, com certeza.', 'Alguém pergunta o que é, e a conversa depois do almoço está garantida.'],
  ['Une gerações.', 'O neto explica para o avô, ou o avô surpreende o neto sabendo mais.'],
  ['Chega mesmo se você estiver longe.', 'Sem frete, sem alfândega e sem câmbio: o mesmo presente vale para o seu sobrinho no Brasil e para a sua avó na Itália.'],
  ['Fica pronto em dois minutos.', 'Pelo celular, até na noite anterior, e sem parecer coisa de última hora.'],
  ['Não precisa de computador para receber.', 'Você imprime num cartão, entrega em mãos e a pessoa resgata quando quiser.'],
  ['Vem com instruções.', 'Um guia passo a passo para criar a carteira e resgatar. E sem pilhas.'],
  ['Dá para presentear em grupo.', 'Cada um coloca o que pode e chega tudo junto.'],
  ['Você sabe se foi resgatado.', 'Vê quando aconteceu, sem precisar perguntar.'],
  ['Se a pessoa não quiser, você recupera ou ela troca por dinheiro.', 'Nenhum presente fica esquecido.'],
  ['É de quem recebe, de verdade.', 'Fica na carteira dela: nem nós nem ninguém pode congelar ou tirar.'],
  ['Não é um vale-presente, é bitcoin de verdade.', 'Um vale-presente tem validade, um catálogo e uma empresa por trás que precisa honrá-lo. Isto já é bitcoin desde o primeiro dia, não vence e a pessoa usa como quiser.'],
  ['Funciona desde 2009 e nunca fechou.', 'Nem num feriado, nem num domingo, nem num 25 de dezembro.'],
  ['Nunca vai existir mais de 21 milhões.', 'Você está dando um pedacinho de algo que ninguém pode fabricar.'],
];

const en: readonly Reason[] = [
  ["It's original.", 'Nobody else at the table will give the same thing.'],
  ['No guessing sizes, colors or taste.', 'And no gift receipt to keep.'],
  ["It takes no space and doesn't break.", 'It fits in a phone or on a slip of paper, and outlasts any toy.'],
  ['It fits your budget.', "You don't need to give a whole bitcoin: it splits into 100 million parts, so you can give just a little."],
  ['It works for any age.', "From a baptism to grandpa's 90th birthday."],
  ["It's personal.", 'Your message, their name and an image made for the occasion.'],
  ['It carries a message.', "It's an invitation to think about saving and the long term."],
  ["It's the same gift for everyone, yet each person lives it differently.", 'One gets curious, another saves it, another starts digging in.'],
  ["It'll spark a great conversation, guaranteed.", 'Someone asks what it is, and the after-dinner chat is set.'],
  ['It brings generations together.', 'The grandkid explains it to grandpa, or grandpa surprises them knowing more.'],
  ["It arrives even if you're far away.", 'No shipping, no customs, no currency exchange: the same gift works for your nephew in Brazil and your grandma in Italy.'],
  ['It takes two minutes.', "From your phone, even the night before, and nobody can tell it was last-minute."],
  ["You don't need a computer to receive it.", 'Print it on a card, hand it over, and they claim it whenever they want.'],
  ['It comes with instructions.', 'A step-by-step guide to set up their wallet and claim it. No batteries required.'],
  ['Several people can give it together.', 'Each one chips in what they can and it all arrives together.'],
  ["You know when it's claimed.", 'You see when it happened, without having to ask.'],
  ["If they don't want it, you get it back or they swap it for cash.", 'No gift goes to waste.'],
  ['It truly belongs to whoever receives it.', 'It stays in their own wallet: neither we nor anyone else can freeze it or take it.'],
  ["It's not a gift card, it's real bitcoin.", 'A gift card has an expiry date, a catalog and a company behind it that has to honor it. This is bitcoin from day one: it never expires and they use it however they want.'],
  ["It's run since 2009 and never closed.", 'Not on a holiday, not on a Sunday, not on December 25th.'],
  ['There will never be more than 21 million.', "You're giving a little piece of something nobody can make more of."],
];

const it: readonly Reason[] = [
  ['È originale.', 'Di sicuro nessun altro a tavola regala la stessa cosa.'],
  ['Non devi indovinare taglia, colore o gusti.', 'Né conservare lo scontrino per il cambio.'],
  ['Non occupa spazio e non si rompe.', 'Sta nel telefono o su un foglietto, e dura più di qualsiasi giocattolo.'],
  ['Si adatta al tuo budget.', 'Non serve regalare un bitcoin intero: si divide in 100 milioni di parti, quindi puoi regalarne anche pochissimo.'],
  ['Va bene a ogni età.', 'Da un battesimo ai 90 anni del nonno.'],
  ['È personale.', 'Il tuo messaggio, il suo nome e un’immagine fatta per l’occasione.'],
  ['Porta un messaggio.', 'È un invito a pensare al risparmio e al lungo periodo.'],
  ['È lo stesso regalo per tutti, ma ognuno lo vive a modo suo.', 'A uno fa venire curiosità, un altro lo conserva e un altro inizia a informarsi.'],
  ['Farà nascere una bella chiacchierata, garantito.', 'Qualcuno chiede cos’è, e il dopocena è servito.'],
  ['Unisce le generazioni.', 'Il nipote lo spiega al nonno, o il nonno sorprende il nipote sapendone di più.'],
  ['Arriva anche se sei lontano.', 'Niente spedizione, dogana o cambio valuta: lo stesso regalo vale per tuo nipote in Brasile e per tua nonna in Italia.'],
  ['Si prepara in due minuti.', 'Dal telefono, anche la sera prima, e senza che si noti che è dell’ultimo minuto.'],
  ['Non serve un computer per riceverlo.', 'Lo stampi su un biglietto, lo consegni a mano e lo riscatta quando vuole.'],
  ['Arriva con le istruzioni.', 'Una guida passo passo per creare il portafoglio e riscattarlo. E senza pile.'],
  ['Si può regalare in tanti.', 'Ognuno mette quello che può e arriva tutto insieme.'],
  ['Sai se l’ha riscattato.', 'Vedi quando è successo, senza dover chiedere.'],
  ['Se non lo vuole, lo recuperi tu o lo cambia in denaro.', 'Nessun regalo resta dimenticato.'],
  ['È davvero di chi lo riceve.', 'Resta nel suo portafoglio: né noi né nessun altro può congelarlo o toglierlo.'],
  ['Non è un buono, è bitcoin vero.', 'Un buono ha una scadenza, un catalogo e un’azienda dietro che deve onorarlo. Questo è bitcoin dal primo giorno, non scade e lo usa come vuole.'],
  ['Funziona dal 2009 e non ha mai chiuso.', 'Né un festivo, né una domenica, né un 25 dicembre.'],
  ['Non ce ne saranno mai più di 21 milioni.', 'Stai regalando un pezzetto di qualcosa che nessuno può fabbricare.'],
];

export const REASONS: Readonly<Record<UiLang, readonly Reason[]>> = { es, pt, en, it };

/** Las razones en el idioma y el trato de quien lee. */
export function reasonsFor(lang: UiLang, trato: Trato): readonly Reason[] {
  return lang === 'es' && trato === 'tu' ? esTu : REASONS[lang];
}

/** Colores de las monedas del abanico (rotan). */
export const COIN_COLORS = ['#ffd23f', '#ff8a1f', '#ff7fa6', '#7fd3ee', '#a8e07f'] as const;
