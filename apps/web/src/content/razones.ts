import type { UiLang } from '../i18n/index.ts';

// Las 21 razones. El castellano es copia exacta de docs/contenido/razones.es.json (fuente
// de verdad; un test lo controla). pt, en e it son traducciones de ese texto.

export type Reason = readonly [title: string, detail: string];

const es: readonly Reason[] = [
  ['Es original.', 'Seguro que nadie más en la mesa regala lo mismo.'],
  ['No hay que adivinar el talle, el color ni el gusto.', 'Ni guardar el ticket de cambio.'],
  ['No ocupa lugar, no se rompe, no se vence.', 'Entra en el celular o en un papelito, y dura más que cualquier juguete.'],
  ['Se ajusta a tu bolsillo.', 'No hace falta regalar un bitcoin entero: se divide en 100 millones de partes, así que podés regalar desde muy poquito.'],
  ['Sirve para cualquier edad.', 'Desde un bautismo hasta los 90 años del abuelo.'],
  ['Es el mismo regalo para todos, pero cada uno lo vive distinto.', 'A uno le despierta curiosidad, otro lo guarda y otro arranca a investigar.'],
  ['Va a disparar una linda charla, seguro.', 'Alguien pregunta qué es, y la sobremesa ya está armada.'],
  ['Une generaciones.', 'El nieto le explica al abuelo, o el abuelo sorprende al nieto sabiendo más.'],
  ['Llega aunque estés lejos.', 'Sin envío, sin aduana y sin cambio de moneda: el mismo regalo vale para tu sobrino en Brasil y para tu abuela en Italia.'],
  ['Se arma en dos minutos.', 'Desde el celular, también la noche anterior, y sin que se note que fue de último momento.'],
  ['No hace falta una computadora para recibirlo.', 'Lo imprimís en una tarjeta, se lo das en mano y lo reclama cuando quiera.'],
  ['Se puede regalar entre varios.', 'Cada uno pone lo que puede y le llega todo junto.'],
  ['Si no lo quiere, vos lo recuperás o él lo canjea por dinero.', 'No hay regalo que quede tirado.'],
  ['Una vez que lo reclama, es suyo de verdad.', 'Pasa a su propia billetera: ni nosotros ni nadie se lo puede congelar ni quitar.'],
  ['Lleva un mensaje.', 'Es una invitación a pensar en el ahorro y en el largo plazo.'],
  ['Es personal.', 'Tu mensaje, su nombre y una imagen hecha para la ocasión.'],
  ['Viene con instrucciones.', 'Una guía paso a paso para crear su billetera y reclamarlo. Y sin pilas.'],
  ['Sabés si lo reclamó.', 'Ves cuándo lo hizo, sin tener que preguntar.'],
  ['Funciona desde 2009 y nunca cerró.', 'Ni un feriado, ni un domingo, ni un 25 de diciembre.'],
  ['Se lo podés regalar a alguien que todavía no nació.', 'Ideal para el baby shower.'],
  ['Nunca va a haber más de 21 millones.', 'Le estás regalando un pedacito de algo que nadie puede fabricar.'],
];

const pt: readonly Reason[] = [
  ['É original.', 'Com certeza ninguém mais na mesa vai dar o mesmo presente.'],
  ['Não precisa adivinhar tamanho, cor nem gosto.', 'Nem guardar a nota para trocar.'],
  ['Não ocupa espaço, não quebra, não vence.', 'Cabe no celular ou num papelzinho, e dura mais que qualquer brinquedo.'],
  ['Cabe no seu bolso.', 'Não precisa dar um bitcoin inteiro: ele se divide em 100 milhões de partes, então dá para presentear a partir de bem pouquinho.'],
  ['Serve para qualquer idade.', 'De um batizado aos 90 anos do avô.'],
  ['É o mesmo presente para todos, mas cada um vive de um jeito.', 'Em um desperta curiosidade, outro guarda e outro começa a pesquisar.'],
  ['Vai render uma boa conversa, com certeza.', 'Alguém pergunta o que é, e a conversa depois do almoço está garantida.'],
  ['Une gerações.', 'O neto explica para o avô, ou o avô surpreende o neto sabendo mais.'],
  ['Chega mesmo se você estiver longe.', 'Sem frete, sem alfândega e sem câmbio: o mesmo presente vale para o seu sobrinho no Brasil e para a sua avó na Itália.'],
  ['Fica pronto em dois minutos.', 'Pelo celular, até na noite anterior, e sem parecer coisa de última hora.'],
  ['Não precisa de computador para receber.', 'Você imprime num cartão, entrega em mãos e a pessoa resgata quando quiser.'],
  ['Dá para presentear em grupo.', 'Cada um coloca o que pode e chega tudo junto.'],
  ['Se a pessoa não quiser, você recupera ou ela troca por dinheiro.', 'Nenhum presente fica esquecido.'],
  ['Depois de resgatado, é dela de verdade.', 'Vai para a carteira dela: nem nós nem ninguém pode congelar ou tirar.'],
  ['Leva uma mensagem.', 'É um convite a pensar em poupança e no longo prazo.'],
  ['É pessoal.', 'Sua mensagem, o nome da pessoa e uma imagem feita para a ocasião.'],
  ['Vem com instruções.', 'Um guia passo a passo para criar a carteira e resgatar. E sem pilhas.'],
  ['Você sabe se foi resgatado.', 'Vê quando aconteceu, sem precisar perguntar.'],
  ['Funciona desde 2009 e nunca fechou.', 'Nem num feriado, nem num domingo, nem num 25 de dezembro.'],
  ['Dá para presentear alguém que ainda nem nasceu.', 'Perfeito para o chá de bebê.'],
  ['Nunca vai existir mais de 21 milhões.', 'Você está dando um pedacinho de algo que ninguém pode fabricar.'],
];

const en: readonly Reason[] = [
  ["It's original.", 'Nobody else at the table will give the same thing.'],
  ['No guessing sizes, colors or taste.', 'And no gift receipt to keep.'],
  ["It takes no space, doesn't break, doesn't expire.", 'It fits in a phone or on a slip of paper, and outlasts any toy.'],
  ['It fits your budget.', "You don't need to give a whole bitcoin: it splits into 100 million parts, so you can give just a little."],
  ['It works for any age.', "From a baptism to grandpa's 90th birthday."],
  ["It's the same gift for everyone, yet each person lives it differently.", 'One gets curious, another saves it, another starts digging in.'],
  ["It'll spark a great conversation, guaranteed.", 'Someone asks what it is, and the after-dinner chat is set.'],
  ['It brings generations together.', 'The grandkid explains it to grandpa, or grandpa surprises them knowing more.'],
  ["It arrives even if you're far away.", 'No shipping, no customs, no currency exchange: the same gift works for your nephew in Brazil and your grandma in Italy.'],
  ['It takes two minutes.', "From your phone, even the night before, and nobody can tell it was last-minute."],
  ["You don't need a computer to receive it.", 'Print it on a card, hand it over, and they claim it whenever they want.'],
  ['Several people can give it together.', 'Each one chips in what they can and it all arrives together.'],
  ["If they don't want it, you get it back or they swap it for cash.", 'No gift goes to waste.'],
  ["Once they claim it, it's truly theirs.", 'It moves to their own wallet: neither we nor anyone else can freeze it or take it.'],
  ['It carries a message.', "It's an invitation to think about saving and the long term."],
  ["It's personal.", 'Your message, their name and an image made for the occasion.'],
  ['It comes with instructions.', 'A step-by-step guide to set up their wallet and claim it. No batteries required.'],
  ["You know when it's claimed.", 'You see when it happened, without having to ask.'],
  ["It's run since 2009 and never closed.", 'Not on a holiday, not on a Sunday, not on December 25th.'],
  ["You can give it to someone who isn't born yet.", 'Perfect for a baby shower.'],
  ['There will never be more than 21 million.', "You're giving a little piece of something nobody can make more of."],
];

const it: readonly Reason[] = [
  ['È originale.', 'Di sicuro nessun altro a tavola regala la stessa cosa.'],
  ['Non devi indovinare taglia, colore o gusti.', 'Né conservare lo scontrino per il cambio.'],
  ['Non occupa spazio, non si rompe, non scade.', 'Sta nel telefono o su un foglietto, e dura più di qualsiasi giocattolo.'],
  ['Si adatta al tuo budget.', 'Non serve regalare un bitcoin intero: si divide in 100 milioni di parti, quindi puoi regalarne anche pochissimo.'],
  ['Va bene a ogni età.', 'Da un battesimo ai 90 anni del nonno.'],
  ['È lo stesso regalo per tutti, ma ognuno lo vive a modo suo.', 'A uno fa venire curiosità, un altro lo conserva e un altro inizia a informarsi.'],
  ['Farà nascere una bella chiacchierata, garantito.', 'Qualcuno chiede cos’è, e il dopocena è servito.'],
  ['Unisce le generazioni.', 'Il nipote lo spiega al nonno, o il nonno sorprende il nipote sapendone di più.'],
  ['Arriva anche se sei lontano.', 'Niente spedizione, dogana o cambio valuta: lo stesso regalo vale per tuo nipote in Brasile e per tua nonna in Italia.'],
  ['Si prepara in due minuti.', 'Dal telefono, anche la sera prima, e senza che si noti che è dell’ultimo minuto.'],
  ['Non serve un computer per riceverlo.', 'Lo stampi su un biglietto, lo consegni a mano e lo riscatta quando vuole.'],
  ['Si può regalare in tanti.', 'Ognuno mette quello che può e arriva tutto insieme.'],
  ['Se non lo vuole, lo recuperi tu o lo cambia in denaro.', 'Nessun regalo resta dimenticato.'],
  ['Una volta riscattato, è davvero suo.', 'Passa al suo portafoglio: né noi né nessun altro può congelarlo o toglierlo.'],
  ['Porta un messaggio.', 'È un invito a pensare al risparmio e al lungo periodo.'],
  ['È personale.', 'Il tuo messaggio, il suo nome e un’immagine fatta per l’occasione.'],
  ['Arriva con le istruzioni.', 'Una guida passo passo per creare il portafoglio e riscattarlo. E senza pile.'],
  ['Sai se l’ha riscattato.', 'Vedi quando è successo, senza dover chiedere.'],
  ['Funziona dal 2009 e non ha mai chiuso.', 'Né un festivo, né una domenica, né un 25 dicembre.'],
  ['Puoi regalarlo a qualcuno che non è ancora nato.', 'Perfetto per un baby shower.'],
  ['Non ce ne saranno mai più di 21 milioni.', 'Stai regalando un pezzetto di qualcosa che nessuno può fabbricare.'],
];

export const REASONS: Readonly<Record<UiLang, readonly Reason[]>> = { es, pt, en, it };

/** Colores de las monedas del abanico (rotan). */
export const COIN_COLORS = ['#ffd23f', '#ff8a1f', '#ff7fa6', '#7fd3ee', '#a8e07f'] as const;
