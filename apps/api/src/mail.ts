import type { Lang } from '@regalale/core';

// Mails desde el servidor (Resend). Nunca llevan el link de un regalo ni palabras:
// solo avisos y el acceso al panel.

export interface Mail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  /** Versión con el diseño de la marca (la de texto queda para los programas que no muestran HTML). */
  readonly html?: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export class MailError extends Error {}

export function resendMailer(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): Mailer {
  return {
    async send(mail) {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, ...(mail.html === undefined ? {} : { html: mail.html }) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new MailError(`Resend respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };
}

/** Sin clave de Resend (desarrollo): el mail se muestra en el log. */
export const consoleMailer: Mailer = {
  async send(mail) {
    console.log(`[mail a ${mail.to}] ${mail.subject}\n${mail.text}`);
  },
};

type Texts = { subject: string; body: string };

// En castellano, frases que valen igual con vos y con tú: el trato no se guarda en la cuenta.
const LOGIN: Readonly<Record<Lang, Texts>> = {
  es: { subject: 'Tu acceso a Regalale Bitcoin', body: 'Hola. Este es el link para entrar a tu panel (vale 20 minutos y sirve una sola vez):\n\n{link}\n\nSi no lo pediste, no hace falta hacer nada.' },
  pt: { subject: 'Seu acesso ao Regalale Bitcoin', body: 'Olá. Entre no seu painel com este link (vale 20 minutos e funciona uma vez só):\n\n{link}\n\nSe você não pediu, ignore este e-mail.' },
  en: { subject: 'Your Regalale Bitcoin access', body: 'Hi. Open your dashboard with this link (valid for 20 minutes, single use):\n\n{link}\n\nIf you didn’t ask for it, ignore this email.' },
  it: { subject: 'Il tuo accesso a Regalale Bitcoin', body: 'Ciao. Entra nel tuo pannello con questo link (vale 20 minuti, si usa una sola volta):\n\n{link}\n\nSe non l’hai chiesto, ignora questa email.' },
};

// Confirmación del mail (Rodolfo, 20/10): con passkey llega después del alta y se puede regalar
// igual; sin passkey hay que abrirla antes de seguir. Sin formas de vos ni de tú.
const CONFIRM: Readonly<Record<Lang, Texts>> = {
  es: { subject: 'Confirmación de tu mail en Regalale Bitcoin', body: 'Hola. Con este link se confirma tu mail y se abre tu cuenta (vale 24 horas y sirve una sola vez):\n\n{link}\n\nSi no fue un pedido tuyo, no hace falta hacer nada.' },
  pt: { subject: 'Confirme seu e-mail no Regalale Bitcoin', body: 'Olá. Com este link seu e-mail é confirmado e sua conta é aberta (vale 24 horas e funciona uma vez só):\n\n{link}\n\nSe você não pediu, ignore este e-mail.' },
  en: { subject: 'Confirm your email at Regalale Bitcoin', body: 'Hi. This link confirms your email and opens your account (valid for 24 hours, single use):\n\n{link}\n\nIf you didn’t ask for it, ignore this email.' },
  it: { subject: 'Conferma la tua email su Regalale Bitcoin', body: 'Ciao. Con questo link la tua email viene confermata e il tuo account si apre (vale 24 ore, si usa una sola volta):\n\n{link}\n\nSe non l’hai chiesto, ignora questa email.' },
};

// «¡Felicitaciones!» (Rodolfo, 21/10): cuando entra el pago de un regalo de una cuenta. El primero
// dice «tu primer regalo»; los demás, «un nuevo regalo». Si el mail no está confirmado, el botón lo
// confirma (el link abre el panel y confirma el mail); si ya lo está, lleva a los regalos.
interface Congrats {
  readonly subjectFirst: string;
  readonly subjectNext: string;
  readonly paid: string;
  readonly confirm: string;
  readonly panel: string;
  readonly buttonConfirm: string;
  readonly buttonPanel: string;
  readonly closing: string;
}
const CONGRATS: Readonly<Record<Lang, Congrats>> = {
  es: {
    subjectFirst: '¡Felicitaciones! Hiciste tu primer regalo',
    subjectNext: '¡Felicitaciones! Hiciste un nuevo regalo',
    paid: 'El regalo para {para} ya está pago y listo para abrir: {sats}.',
    confirm: 'Falta un paso: confirmar tu mail. Con el botón se confirma y se entra a tu panel, donde está el regalo.',
    panel: 'En tu panel ves cómo va y, con tu cara o tu huella, se pueden volver a ver el link y las palabras.',
    buttonConfirm: 'Confirmar mi mail',
    buttonPanel: 'Ver mis regalos',
    closing: 'El botón vale 3 días y sirve una sola vez. Nunca te vamos a pedir las palabras de tu billetera.',
  },
  pt: {
    subjectFirst: 'Parabéns! Você deu seu primeiro presente',
    subjectNext: 'Parabéns! Você deu um novo presente',
    paid: 'O presente para {para} já está pago e pronto para abrir: {sats}.',
    confirm: 'Falta um passo: confirmar seu e-mail. Com o botão ele é confirmado e você entra no seu painel, onde está o presente.',
    panel: 'No seu painel você acompanha tudo e, com seu rosto ou sua digital, pode ver de novo o link e as palavras.',
    buttonConfirm: 'Confirmar meu e-mail',
    buttonPanel: 'Ver meus presentes',
    closing: 'O botão vale 3 dias e funciona uma vez só. Nunca vamos pedir as palavras da sua carteira.',
  },
  en: {
    subjectFirst: 'Congratulations! You made your first gift',
    subjectNext: 'Congratulations! You made a new gift',
    paid: 'The gift for {para} is paid and ready to open: {sats}.',
    confirm: 'One step left: confirm your email. The button confirms it and opens your dashboard, where the gift is.',
    panel: 'In your dashboard you can follow it and, with your face or fingerprint, see the link and the words again.',
    buttonConfirm: 'Confirm my email',
    buttonPanel: 'See my gifts',
    closing: 'The button is valid for 3 days, single use. We will never ask for the words of your wallet.',
  },
  it: {
    subjectFirst: 'Congratulazioni! Hai fatto il tuo primo regalo',
    subjectNext: 'Congratulazioni! Hai fatto un nuovo regalo',
    paid: 'Il regalo per {para} è pagato e pronto da aprire: {sats}.',
    confirm: 'Manca un passo: confermare la tua email. Con il pulsante si conferma e si entra nel tuo pannello, dove c’è il regalo.',
    panel: 'Nel tuo pannello vedi come va e, con il volto o l’impronta, puoi rivedere il link e le parole.',
    buttonConfirm: 'Conferma la mia email',
    buttonPanel: 'Vedi i miei regali',
    closing: 'Il pulsante vale 3 giorni e si usa una sola volta. Non ti chiederemo mai le parole del tuo portafoglio.',
  },
};

const fill = (s: string, vars: Record<string, string>): string => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

// Recordatorio a quien regala si el regalo sigue sin abrirse. Sin formas de vos ni de tú: el
// mismo texto sirve para los dos tratos.
const REMINDER: Record<Lang, Texts> = {
  es: { subject: '{para} todavía no abrió tu regalo', body: 'El regalo para {para} está pago y sigue esperando: todavía no lo abrió. No vence, así que no hay apuro; quizás sea un buen momento para recordárselo o para acompañarlo a abrirlo.\n\nEn tu panel ves cómo va, y con tu cara o tu huella se pueden volver a ver el link y las palabras:\n\n{link}\n\nNunca te vamos a pedir las palabras de tu billetera.' },
  pt: { subject: '{para} ainda não abriu seu presente', body: 'O presente para {para} está pago e continua esperando: ainda não foi aberto. Ele não vence, então não há pressa; talvez seja um bom momento para lembrar ou para ajudar a abri-lo.\n\nNo seu painel você acompanha tudo e, com seu rosto ou sua digital, pode ver de novo o link e as palavras:\n\n{link}\n\nNunca vamos pedir as palavras da sua carteira.' },
  en: { subject: '{para} hasn’t opened your gift yet', body: 'The gift for {para} is paid and still waiting: it hasn’t been opened yet. It doesn’t expire, so there’s no rush; it may be a good moment for a reminder or to help open it.\n\nIn your dashboard you can follow it and, with your face or fingerprint, see the link and the words again:\n\n{link}\n\nWe will never ask for the words of your wallet.' },
  it: { subject: '{para} non ha ancora aperto il tuo regalo', body: 'Il regalo per {para} è pagato e sta ancora aspettando: non è stato aperto. Non scade, quindi non c’è fretta; forse è un buon momento per ricordarglielo o per aiutarlo ad aprirlo.\n\nNel tuo pannello vedi come va e, con il volto o l’impronta, puoi rivedere il link e le parole:\n\n{link}\n\nNon ti chiederemo mai le parole del tuo portafoglio.' },
};

export function loginMail(to: string, lang: Lang, link: string): Mail {
  const t = LOGIN[lang];
  return { to, subject: t.subject, text: fill(t.body, { link }), html: fromText(lang, t.subject, t.body, {}, link, LOGIN_BUTTON[lang]) };
}

export function confirmMail(to: string, lang: Lang, link: string): Mail {
  const t = CONFIRM[lang];
  return { to, subject: t.subject, text: fill(t.body, { link }), html: fromText(lang, t.subject, t.body, {}, link, CONFIRM_BUTTON[lang]) };
}

const LOCALES: Readonly<Record<Lang, string>> = { es: 'es-AR', pt: 'pt-BR', en: 'en-US', it: 'it-IT' };
const satsText = (sats: bigint, lang: Lang) => `${new Intl.NumberFormat(LOCALES[lang], { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(sats)} sats`;

export function readyMail(to: string, lang: Lang, g: { para: string; sats: bigint; first: boolean; verified: boolean; link: string }): Mail {
  const t = CONGRATS[lang];
  const subject = g.first ? t.subjectFirst : t.subjectNext;
  const paid = fill(t.paid, { para: g.para, sats: satsText(g.sats, lang) });
  const next = g.verified ? t.panel : t.confirm;
  const button = g.verified ? t.buttonPanel : t.buttonConfirm;
  return {
    to,
    subject,
    text: `${paid}\n\n${next}\n\n${button}: ${g.link}\n\n${t.closing}`,
    html: layout(lang, g.link, { title: subject, paragraphs: [paid, next], button: { label: button, url: g.link }, after: [t.closing] }),
  };
}

export function reminderMail(to: string, lang: Lang, para: string, link: string): Mail {
  const t = REMINDER[lang];
  const subject = fill(t.subject, { para });
  return { to, subject, text: fill(t.body, { para, link }), html: fromText(lang, subject, t.body, { para }, link, CONGRATS[lang].buttonPanel) };
}

// Aviso a quien armó una lista que fue reportada (sin el mail de quien la reportó). Sin formas de
// vos ni de tú: el mismo texto sirve para los dos tratos.
const REPORT: Record<Lang, { subject: string; body: string; again: string; review: string; button: string }> = {
  es: {
    subject: 'Pausamos tu lista «{titulo}»',
    body: 'Alguien reportó la lista «{titulo}» y la pausamos mientras se revisa: por ahora no muestra datos para aportar. Los aportes que ya estaban anunciados no cambian.\n\nMotivo del reporte: «{motivo}»\n\n{next}',
    again: 'Si todo está bien, se puede reactivar una vez desde el panel.',
    review: 'Como ya se había reactivado una vez, ahora la revisa nuestro equipo y vamos a escribir por este medio.',
    button: 'Ir a mi panel',
  },
  pt: {
    subject: 'Pausamos sua lista «{titulo}»',
    body: 'Alguém denunciou a lista «{titulo}» e ela foi pausada enquanto é revisada: por enquanto não mostra dados para presentear. Os presentes já anunciados não mudam.\n\nMotivo da denúncia: «{motivo}»\n\n{next}',
    again: 'Se estiver tudo certo, dá para reativar uma vez pelo painel.',
    review: 'Como já tinha sido reativada uma vez, agora nossa equipe revisa e vamos escrever por aqui.',
    button: 'Ir ao meu painel',
  },
  en: {
    subject: 'We paused your list «{titulo}»',
    body: 'Someone reported the list «{titulo}» and it’s paused while it’s reviewed: for now it doesn’t show details for giving. Gifts already announced don’t change.\n\nReason given: «{motivo}»\n\n{next}',
    again: 'If everything is fine, it can be reactivated once from the dashboard.',
    review: 'Since it had already been reactivated once, our team will now review it and we’ll write back here.',
    button: 'Open my dashboard',
  },
  it: {
    subject: 'Abbiamo messo in pausa la tua lista «{titulo}»',
    body: 'Qualcuno ha segnalato la lista «{titulo}» ed è in pausa mentre viene verificata: per ora non mostra i dati per contribuire. I contributi già annunciati non cambiano.\n\nMotivo della segnalazione: «{motivo}»\n\n{next}',
    again: 'Se è tutto a posto, si può riattivare una volta dal pannello.',
    review: 'Poiché era già stata riattivata una volta, ora la verifica il nostro team e scriveremo qui.',
    button: 'Vai al mio pannello',
  },
};

export function reportMail(to: string, lang: Lang, r: { titulo: string; motivo: string; review: boolean; link: string }): Mail {
  const t = REPORT[lang];
  const subject = fill(t.subject, { titulo: r.titulo });
  const vars = { titulo: r.titulo, motivo: r.motivo, next: r.review ? t.review : t.again };
  return { to, subject, text: `${fill(t.body, vars)}\n\n${r.link}`, html: fromText(lang, subject, t.body, vars, r.link, t.button) };
}

const LOGIN_BUTTON: Readonly<Record<Lang, string>> = { es: 'Entrar a mi panel', pt: 'Entrar no meu painel', en: 'Open my dashboard', it: 'Entra nel mio pannello' };
const CONFIRM_BUTTON: Readonly<Record<Lang, string>> = { es: 'Confirmar mi mail', pt: 'Confirmar meu e-mail', en: 'Confirm my email', it: 'Conferma la mia email' };
const FOOTER: Readonly<Record<Lang, string>> = {
  es: 'Sin custodia: el regalo es de quien lo recibe.',
  pt: 'Sem custódia: o presente é de quem o recebe.',
  en: 'Non-custodial: the gift belongs to whoever receives it.',
  it: 'Senza custodia: il regalo è di chi lo riceve.',
};

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** El HTML de un mail armado desde su texto: los párrafos van tal cual y el renglón del link, como botón. */
function fromText(lang: Lang, title: string, body: string, vars: Record<string, string>, link: string, button: string): string {
  const parts = body.split('\n\n');
  const i = parts.indexOf('{link}');
  const before = parts.slice(0, i === -1 ? parts.length : i).map((p) => fill(p, vars).replace(/:$/, '.'));
  const after = i === -1 ? [] : parts.slice(i + 1).map((p) => fill(p, vars));
  return layout(lang, link, { title, paragraphs: before, button: { label: button, url: link }, after });
}

/**
 * Diseño de la marca (el del mediakit) para los mails: franja naranja con el logotipo, título en
 * tinta, texto en DM Sans (o la del sistema), botón tinta redondeado y pie con el dominio. Tablas
 * y estilos en línea, que es lo que respetan Gmail y Outlook. Todo lo variable va escapado.
 */
function layout(lang: Lang, link: string, m: { title: string; paragraphs: readonly string[]; button: { label: string; url: string }; after: readonly string[] }): string {
  const origin = new URL(link).origin;
  const font = "'DM Sans',Helvetica,Arial,sans-serif";
  const titles = "'Bricolage Grotesque',Helvetica,Arial,sans-serif";
  const p = (t: string, color = '#1A1530', size = 16) => `<p style="margin:0 0 16px;font-family:${font};font-size:${size}px;line-height:1.55;color:${color}">${esc(t)}</p>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(m.title)}</title></head>
<body style="margin:0;padding:0;background:#FAF7F2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:2px solid #1A1530;border-radius:20px;overflow:hidden">
<tr><td style="background:#FF8A1F;padding:22px 28px"><a href="${esc(origin)}" style="text-decoration:none"><img src="${esc(origin)}/mail/logo-naranja.png" width="240" height="35" alt="Regalale Bitcoin" style="display:block;border:0;width:240px;height:auto;color:#1A1530;font-family:${titles};font-weight:800;font-size:20px"></a></td></tr>
<tr><td style="padding:28px 28px 8px">
<h1 style="margin:0 0 18px;font-family:${titles};font-weight:800;font-size:26px;line-height:1.15;color:#1A1530">${esc(m.title)}</h1>
${m.paragraphs.map((t) => p(t)).join('\n')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px"><tr><td style="background:#1A1530;border-radius:999px"><a href="${esc(m.button.url)}" style="display:inline-block;padding:14px 26px;font-family:${font};font-weight:700;font-size:16px;color:#FFFFFF;text-decoration:none;border-radius:999px">${esc(m.button.label)}</a></td></tr></table>
${m.after.map((t) => p(t, '#4B4660', 14)).join('\n')}
</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #E6E1EE;font-family:${font};font-size:13px;line-height:1.5;color:#4B4660">${esc(FOOTER[lang])}<br><a href="${esc(origin)}" style="color:#B85300;font-weight:700;text-decoration:none">regalalebitcoin.com</a></td></tr>
</table>
</td></tr></table>
</body></html>`;
}
