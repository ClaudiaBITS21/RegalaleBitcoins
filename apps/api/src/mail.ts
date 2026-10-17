import type { Lang } from '@regalale/core';

// Mails desde el servidor (Resend). Nunca llevan el link de un regalo ni palabras:
// solo avisos y el acceso al panel.

export interface Mail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
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
        body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
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

const LOGIN: Readonly<Record<Lang, Texts>> = {
  es: { subject: 'Tu acceso a RegalaleBitcoin', body: 'Hola. Entrá a tu panel con este link (vale 20 minutos y sirve una sola vez):\n\n{link}\n\nSi no lo pediste, ignorá este mail.' },
  pt: { subject: 'Seu acesso ao RegalaleBitcoin', body: 'Olá. Entre no seu painel com este link (vale 20 minutos e funciona uma vez só):\n\n{link}\n\nSe você não pediu, ignore este e-mail.' },
  en: { subject: 'Your RegalaleBitcoin access', body: 'Hi. Open your dashboard with this link (valid for 20 minutes, single use):\n\n{link}\n\nIf you didn’t ask for it, ignore this email.' },
  it: { subject: 'Il tuo accesso a RegalaleBitcoin', body: 'Ciao. Entra nel tuo pannello con questo link (vale 20 minuti, si usa una sola volta):\n\n{link}\n\nSe non l’hai chiesto, ignora questa email.' },
};

const READY: Readonly<Record<Lang, Texts>> = {
  es: { subject: 'Tu regalo para {para} ya está listo', body: 'Recibimos el pago del regalo para {para}: ya se puede abrir.\n\nEn tu panel ves cómo va, y con tu cara o tu huella podés volver a ver el link y las palabras:\n\n{link}\n\nNunca te vamos a pedir las palabras de tu billetera.' },
  pt: { subject: 'Seu presente para {para} está pronto', body: 'Recebemos o pagamento do presente para {para}: ele já pode ser aberto.\n\nNo seu painel você acompanha tudo e, com seu rosto ou sua digital, pode ver de novo o link e as palavras:\n\n{link}\n\nNunca vamos pedir as palavras da sua carteira.' },
  en: { subject: 'Your gift for {para} is ready', body: 'We received the payment for the gift for {para}: it can be opened now.\n\nIn your dashboard you can follow it and, with your face or fingerprint, see the link and the words again:\n\n{link}\n\nWe will never ask for the words of your wallet.' },
  it: { subject: 'Il tuo regalo per {para} è pronto', body: 'Abbiamo ricevuto il pagamento del regalo per {para}: si può già aprire.\n\nNel tuo pannello vedi come va e, con il volto o l’impronta, puoi rivedere il link e le parole:\n\n{link}\n\nNon ti chiederemo mai le parole del tuo portafoglio.' },
};

const fill = (s: string, vars: Record<string, string>): string => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

export function loginMail(to: string, lang: Lang, link: string): Mail {
  const t = LOGIN[lang];
  return { to, subject: t.subject, text: fill(t.body, { link }) };
}

export function readyMail(to: string, lang: Lang, para: string, link: string): Mail {
  const t = READY[lang];
  return { to, subject: fill(t.subject, { para }), text: fill(t.body, { para, link }) };
}
