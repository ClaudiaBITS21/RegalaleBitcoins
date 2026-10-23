import { useEffect, useState } from 'preact/hooks';
import { api, type Credits, type Products } from '../api.ts';

// Lo que traen los planes (imagen con IA, tarjeta imprimible, salutación automática): lo gratis
// trae lo que el admin le incluya (Claudia, 23/10; antes, nada). Con el cobro apagado, todos lo
// tienen. Sin sesión y con el cobro activo, se asume lo gratis: la cuenta nueva empieza con la
// bienvenida. Mientras no se sabe, null: no se completa nada solo ni se ofrece imprimir, pero
// tampoco se pone candado (el servidor igual controla la imagen propia).

type Free = 'ia' | 'tarjeta' | 'saludo';

/** La imagen con IA (estilo «imagen propia»). */
export function usePlanFeatures(): boolean | null {
  return useFeature((c) => c.conIa ?? c.conPlan ?? true, 'ia');
}

/** La tarjeta imprimible (sin la marca de vista previa). */
export function useCardFeature(): boolean | null {
  return useFeature((c) => c.conTarjeta ?? c.conPlan ?? true, 'tarjeta');
}

/** La salutación automática: la traen los planes salvo Satoshi (Rodolfo, 21/10). */
export function useGreetings(): boolean | null {
  return useFeature((c) => c.conSaludo ?? c.conPlan ?? true, 'saludo');
}

/** Sin sesión: con el cobro apagado, todo; con el cobro activo, lo que incluye lo gratis. */
function freeHas(p: Products, what: Free): boolean {
  if (!p.cobroActivo) return true;
  return p.productos.find((x) => x.codigo === 'bienvenida')?.[what] === true;
}

function useFeature(pick: (c: Credits) => boolean, free: Free): boolean | null {
  const [with_, setWith] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .creditsIfSignedIn()
      .then(async (c) => (c !== null ? pick(c) : freeHas(await api.products(), free)))
      .then((v) => alive && setWith(v))
      .catch(() => alive && setWith(true));
    return () => {
      alive = false;
    };
  }, []);
  return with_;
}
