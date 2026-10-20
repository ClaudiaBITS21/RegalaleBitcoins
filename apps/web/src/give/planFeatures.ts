import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.ts';

// Lo que traen los planes (imagen con IA, tarjeta imprimible, salutación automática): lo gratis
// (solo la bienvenida) no lo trae (Rodolfo, 20/10). Con el cobro apagado, todos lo tienen. Sin
// sesión y con el cobro activo, se asume lo gratis: la cuenta nueva empieza con la bienvenida.
// Mientras no se sabe, null: no se completa nada solo ni se ofrece imprimir, pero tampoco se
// pone candado (el servidor igual controla la imagen propia).

export function usePlanFeatures(): boolean | null {
  const [with_, setWith] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .creditsIfSignedIn()
      .then(async (c) => (c !== null ? c.conPlan : !(await api.products()).cobroActivo))
      .then((v) => alive && setWith(v))
      .catch(() => alive && setWith(true));
    return () => {
      alive = false;
    };
  }, []);
  return with_;
}
