import type { Medio } from './cobro.ts';

// Países y medios de cobro de las listas (handoff 21/10/2026, «listas por país»). El dueño elige
// el país al armar la lista. Todo se valida acá, en su navegador, antes de cifrar: el servidor ya
// no ve el dato. No se ofrecen llaves que expongan el número de documento (CPF/CNPJ en PIX, cédula
// en Bre-B). México, EE. UU., Chile, Perú y Uruguay están ABIERTOS: por ahora van por «Otro».

export type Pais = 'AR' | 'BR' | 'CO' | 'EU' | 'XX';
export const PAISES: readonly Pais[] = ['AR', 'BR', 'CO', 'EU', 'XX'];
/** Moneda fija por país; en «Otro» la elige el dueño. */
export const MONEDA: Readonly<Record<Exclude<Pais, 'XX'>, string>> = { AR: 'ARS', BR: 'BRL', CO: 'COP', EU: 'EUR' };
/** Medios de cada país. */
export const MEDIOS_DE: Readonly<Record<Pais, readonly Medio[]>> = { AR: ['alias', 'cbu'], BR: ['pix'], CO: ['breb'], EU: ['iban'], XX: ['otro'] };

export type Problema = 'formato' | 'verificador' | 'documento' | 'largo';
export type Resultado = { ok: true; dato: string } | { ok: false; problema: Problema };

const no = (problema: Problema): Resultado => ({ ok: false, problema });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** CBU o CVU: 22 dígitos en dos bloques, cada uno con su dígito verificador. */
export function cbuValido(cbu: string): boolean {
  if (!/^\d{22}$/.test(cbu)) return false;
  const check = (digits: string, weights: readonly number[]) => {
    const sum = [...digits].reduce((a, d, i) => a + Number(d) * (weights[i % weights.length] as number), 0);
    return (10 - (sum % 10)) % 10;
  };
  const w1 = [7, 1, 3, 9, 7, 1, 3];
  const w2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];
  return check(cbu.slice(0, 7), w1) === Number(cbu[7]) && check(cbu.slice(8, 21), w2) === Number(cbu[21]);
}

/** IBAN: país, dígitos de control y mod 97 = 1 (ISO 13616). */
export function ibanValido(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

/** Valida y normaliza el dato según el medio. */
export function validarDato(medio: Medio, entrada: string): Resultado {
  const raw = entrada.trim();
  switch (medio) {
    case 'alias': {
      const a = raw.toLowerCase();
      return /^[a-z0-9.-]{6,20}$/.test(a) ? { ok: true, dato: a } : no('formato');
    }
    case 'cbu': {
      const d = raw.replace(/[\s-]/g, '');
      if (!/^\d{22}$/.test(d)) return no('formato');
      return cbuValido(d) ? { ok: true, dato: d } : no('verificador');
    }
    case 'pix': {
      if (EMAIL.test(raw)) return { ok: true, dato: raw.toLowerCase() };
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) return { ok: true, dato: raw.toLowerCase() };
      const digits = raw.replace(/[\s()./-]/g, '');
      // Celular: +55, DDD de 2 dígitos y número de 8 o 9.
      const cel = /^\+?55(\d{10,11})$/.exec(digits);
      if (cel !== null) return { ok: true, dato: `+55${cel[1]}` };
      // CPF (11) o CNPJ (14): exponen el número fiscal a cualquiera con el link.
      if (/^\d{11}$|^\d{14}$/.test(digits)) return no('documento');
      return no('formato');
    }
    case 'breb': {
      if (EMAIL.test(raw)) return { ok: true, dato: raw.toLowerCase() };
      const digits = raw.replace(/[\s().-]/g, '');
      const cel = /^(?:\+?57)?(3\d{9})$/.exec(digits);
      if (cel !== null) return { ok: true, dato: cel[1] as string };
      // Cédula: solo números (que no son un celular).
      if (/^\d{5,12}$/.test(digits)) return no('documento');
      // Llave alfanumérica: empieza con @, de 3 a 20 letras o números.
      if (/^@[A-Za-z0-9._-]{3,20}$/.test(raw)) return { ok: true, dato: raw };
      return no('formato');
    }
    case 'iban': {
      const i = raw.replace(/\s/g, '').toUpperCase();
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(i)) return no('formato');
      return ibanValido(i) ? { ok: true, dato: i } : no('verificador');
    }
    case 'otro':
      return raw.length === 0 ? no('formato') : [...raw].length > 120 ? no('largo') : { ok: true, dato: raw };
  }
}

/** IBAN en grupos de 4, para leerlo y copiarlo sin errores. */
export const mostrarDato = (medio: Medio, dato: string) => (medio === 'iban' ? dato.replace(/(.{4})/g, '$1 ').trim() : medio === 'cbu' ? `${dato.slice(0, 8)} ${dato.slice(8)}` : dato);

/** Decimales de la moneda (unidad menor): 2 en la mayoría; los montos se guardan en esa unidad. */
export function decimales(moneda: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: moneda }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Monedas ISO 4217 que conoce el navegador (para «Otro»). */
export function monedasIso(): readonly string[] {
  const all = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('currency');
  return all !== undefined && all.length > 0 ? all : ['USD', 'EUR', 'MXN', 'CLP', 'PEN', 'UYU', 'ARS', 'BRL', 'COP', 'GBP', 'CAD'];
}
