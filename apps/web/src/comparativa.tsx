import { Fragment } from 'preact';
import { useEffect } from 'preact/hooks';
import { COLUMNAS, comparativaFor, DIRECTO_COLUMNAS, FILAS, type Valor, VALORES } from './content/comparativa.ts';
import { SiteFooter, SiteHeader, useI18n } from './ui.tsx';

// Página "Comparativa" (handoff 2026-10-19, «comparativa»): Regalale Bitcoin frente a las otras
// formas de regalar bitcoin, sin nombres de marcas. Tabla semántica con la primera columna fija;
// debajo de ~720 px la tabla se desplaza dentro de su caja y la página nunca de costado.

/** Texto con **negrita** y el nombre de la marca entre *…* o _…_ (en naranja, sin itálica). */
function Rico({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((parte, i) =>
        parte.startsWith('**') ? (
          <strong key={i}>
            <Marca text={parte.slice(2, -2)} />
          </strong>
        ) : (
          <Marca text={parte} key={i} />
        ),
      )}
    </>
  );
}

function Marca({ text }: { text: string }) {
  return (
    <>
      {text.split(/[*_]([^*_]+)[*_]/).map((parte, i) =>
        i % 2 === 1 ? (
          <span class="nombre-marca" key={i}>
            {parte}
          </span>
        ) : (
          <Fragment key={i}>{parte}</Fragment>
        ),
      )}
    </>
  );
}

function Icono({ valor, label, size = 26, nuestro = false }: { valor: Valor; label: string; size?: number; nuestro?: boolean }) {
  if (valor === 'si') {
    return (
      <svg role="img" aria-label={label} width={size} height={size} viewBox="0 0 26 26">
        <circle cx="13" cy="13" r="12" fill="#1A1530" />
        <path d="M8 13.5l3.5 3.5 6.5-7.5" fill="none" stroke={nuestro ? '#FFD23F' : '#FFFFFF'} stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    );
  }
  if (valor === 'no') {
    return (
      <svg role="img" aria-label={label} width={size} height={size} viewBox="0 0 26 26">
        <circle cx="13" cy="13" r="11.5" fill="none" stroke="#8A8599" stroke-width="2" />
        <path d="M9.5 9.5l7 7M16.5 9.5l-7 7" stroke="#8A8599" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    );
  }
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox="0 0 26 26">
      <circle cx="13" cy="13" r="11.5" fill="none" stroke="#1A1530" stroke-width="2" />
      <path d="M13 1.5a11.5 11.5 0 0 1 0 23z" fill="#1A1530" />
    </svg>
  );
}

export function ComparisonPage({ testnet }: { testnet: boolean }) {
  const { t, lang, trato } = useI18n();
  const c = comparativaFor(lang, trato);

  useEffect(() => {
    document.title = `${c.kicker} · Regalale Bitcoin`;
  }, [lang, trato]);

  const parrafo = (i: number) => (
    <p class={i === DIRECTO_COLUMNAS.derecha[0] ? 'comparativa-gancho' : undefined} key={i}>
      <Rico text={c.parrafos[i] ?? ''} />
    </p>
  );

  return (
    <div class="pagina pagina-home pagina-comparativa">
      {testnet && (
        <p class="aviso-red" role="note">
          {t('red.prueba')}
        </p>
      )}
      <section class="porque-hero">
        <div class="hero-contenido">
          <SiteHeader onOrange />
          <div class="porque-hero-texto">
            <p class="kicker kicker-tinta">{c.kicker}</p>
            <h1>
              <Rico text={c.titulo} />
            </h1>
            <p class="bajada">
              <Rico text={c.bajada} />
            </p>
          </div>
        </div>
      </section>

      <main class="home-secciones">
        <section class="seccion comparativa-seccion" aria-label={c.kicker}>
          <div class="comparativa-caja" role="region" aria-label={c.kicker} tabindex={0}>
            <table class="comparativa-tabla">
              <thead>
                <tr>
                  <th scope="col">{c.criterios}</th>
                  <th scope="col" class="comparativa-nos">
                    <Icono valor="si" label={c.valores.si} size={30} nuestro />
                    <span class="comparativa-nos-nombre">Regalale Bitcoin</span>
                  </th>
                  {COLUMNAS.map((col) => (
                    <th scope="col" key={col}>
                      <span class="comparativa-t">{c.columnas[col][0]}</span>
                      <span class="comparativa-b">{c.columnas[col][1]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FILAS.map((f) => (
                  <tr key={f}>
                    <th scope="row">
                      <span class="comparativa-t">{c.filas[f][0]}</span>
                      <span class="comparativa-b">{c.filas[f][1]}</span>
                    </th>
                    <td class="comparativa-nos">
                      <Icono valor="si" label={c.valores.si} size={30} nuestro />
                    </td>
                    {COLUMNAS.map((col) => (
                      <td key={col}>
                        <Icono valor={VALORES[f][col]} label={c.valores[VALORES[f][col]]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul class="comparativa-leyenda">
            {(['si', 'no', 'parcial'] as const).map((v) => (
              <li key={v}>
                <Icono valor={v} label="" size={20} />
                {c.valores[v]}
              </li>
            ))}
          </ul>
        </section>

        <section class="comparativa-directo" aria-labelledby="comparativa-directo">
          <div>
            <h2 id="comparativa-directo">{c.directoTitulo}</h2>
            {DIRECTO_COLUMNAS.izquierda.map(parrafo)}
          </div>
          <div>{DIRECTO_COLUMNAS.derecha.map(parrafo)}</div>
        </section>

        <div class="comparativa-cierre">
          <a class="boton boton-primario boton-grande" href="/regalar">
            {c.cta} →
          </a>
          <p class="comparativa-pie">{c.pie}</p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
