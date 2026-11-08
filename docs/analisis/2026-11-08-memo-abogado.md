# Análisis del dictamen de VC&A frente al producto de hoy

Fecha: 08/11/2026. Para: Claudia (responsable de RegalaleBitcoin.com).

> **Esto no es asesoramiento legal.** Es un análisis técnico-operativo para conversar con el
> abogado. Contrasta el dictamen con cómo funciona hoy el producto (código y documentación del
> repo). Las valoraciones de riesgo son estimaciones de trabajo, no opiniones jurídicas. Toda
> norma, fecha o umbral que aparece acá sale del dictamen o de los documentos del repo y **hay que
> confirmarla con el abogado**. No se agregaron normas nuevas; donde se menciona alguna fuera del
> dictamen, está marcada como «a confirmar».

Fuentes:
- Dictamen «Regalale Bitcoin — Encuadre regulatorio ante la CNV, propiedad intelectual y datos
  personales», Estudio Vázquez Cáceres & Asoc., Mendoza, 26/10/2026, 23 páginas. Base fáctica:
  descripción del 21/10/2026, repo en la versión `087cb0d` y el sitio.
- Repo al commit `2f15b1f` (08/11/2026): `CLAUDE.md`, `docs/operacion.md`, `docs/mainnet.md`,
  `docs/arquitectura.md`, `docs/derivacion.md`, `apps/web/src/privacidad.tsx`, el handoff B2B v2
  (`docs/handoff/2026-11-08/empresas-y-exchanges-b2b-v2.md`) y el código de `apps/api/src` y
  `apps/web/src`.

---

## 0. Lo más importante en una página

**El dictamen se escribió sobre una foto que ya cambió.** Las diferencias que más pesan:

1. **Operador.** El dictamen está dirigido a Apptivalo S.R.L. como operadora. Desde el 24/10/2026
   (dos días antes de la fecha del dictamen) el operador declarado en el sitio es **Bull&Bear
   International, LLC** (Delaware, registro 6687084). Buena parte de la sección de estructura
   (LLC titular de la IP + S.R.L. operadora con MSA invertido) hay que releerla con eso.
2. **Cobro.** El dictamen dice «cobro publicado pero no activado». Hoy se cobra: packs, planes
   (anual y fundador) y unidades en sats, con cupones de descuento y botón de arrepentimiento.
   La billetera de cobro sigue siendo una xpub cuyas claves están en el hardware de una persona
   humana.
3. **Listas con transferencias.** El dictamen pide reformularlas (sacar el estado «convertido» y
   el reparto de sats, y poner tope). **Nada de eso se hizo**: siguen los estados anunciada →
   recibida → convertida, la compra en tanda que reparte sats y no hay tope para las
   transferencias. Es el flanco que el propio dictamen marca como más expuesto.
4. **Privacidad.** Hay avances que el dictamen no conocía (etapa A publicada; B, C y D en PR para revisión: #137, #138 y #141, más #140 que deja de guardar el destino del reclamo)
   y otros que el dictamen pide y siguen pendientes (Términos y Condiciones, inscripción de bases,
   acuerdos con proveedores, HMAC de IP, retención).
5. **B2B.** El canal con empresas y exchanges (envíos masivos, recupero en lote, co-branding con
   exchanges que pueden ser PSAV) no estaba en el dictamen y abre preguntas nuevas.

**Tres riesgos mayores hoy:**
1. Listas con transferencias en moneda de curso legal (tesis 5 del dictamen): posible lectura de
   intercambio fiat ↔ activo virtual por cuenta de terceros, agravada por el estado «convertida»,
   el reparto de sats y la falta de tope.
2. Defensa del consumidor sin Términos y Condiciones publicados, con cobro activo, plan
   «fundador» con beneficios «para siempre» y mainnet con fondos reales (responsabilidad por
   pérdidas sin reglas escritas).
3. Coherencia estructural: operador (LLC de Delaware), titular de la IP y del dominio, y
   billetera de cobro en cabeza de personas distintas (tesis 6 del dictamen, «operador de hecho»),
   con impacto en CNV, impuestos y datos personales.

**Cinco medidas más recomendadas:**
1. Publicar Términos y Condiciones (software de autocustodia, irreversibilidad, pérdida de
   claves, listas como relación entre particulares, plan fundador acotado), revisados por el abogado.
2. Decidir con el abogado el rediseño de las listas con transferencias: quitar «convertida» y el
   reparto automático de sats, o sostenerlos con argumentos escritos; y poner un tope por lista.
3. Ordenar la titularidad: IP, dominio, cuentas de infraestructura y billetera de cobro a nombre
   de la LLC operadora, con contratos escritos.
4. En el reclamo «esperar», entregar siempre al usuario la transacción firmada y un botón para
   difundirla por su cuenta (quita la «decisión del servidor» de la tesis 1).
5. Cerrar lo formal de datos personales: acuerdos con Google Cloud y Resend, cláusulas de
   transferencia internacional, inscripción de bases (si corresponde con responsable extranjero),
   HMAC con clave rotada para IPs y plazos de retención escritos.

---

## 1. Qué sigue vigente y qué no

Leyenda de estado: **Vigente** (la conclusión sigue valiendo tal cual), **Vigente con cambios**
(vale, pero los hechos cambiaron), **Desactualizado** (se basó en hechos que ya no son así),
**Pendiente** (recomendación que sigue sin hacerse), **Hecho** / **En curso**.

### 1.1 Conclusiones principales (sección II del dictamen)

| # | Conclusión del dictamen | Cómo está hoy | Estado |
|---|---|---|---|
| 1 | No es PSAV; sólida en regalos, defendible «previa corrección» en listas con transferencias | Regalos: las claves siguen en el navegador, barrido de una salida, el servidor no puede mover fondos (`docs/operacion.md` reglas 1–3). Listas con transferencias: **sin la corrección pedida** | Vigente para regalos; **condicionado** en listas |
| 2 | Cuatro flancos: reclamo «esperar», bóveda cifrada, listas con fiat, pérdida de «exclusivamente» | «Esperar»: sin cambios (no se entrega copia de la tx). Bóveda: sigue cifrada con PRF de la passkey, el servidor no tiene la clave. Listas: sin cambios. «Exclusivamente»: el servicio sumó funciones (cobro, cupones, tope diario por cuenta, denuncias, B2B en diseño) | Vigente; los flancos siguen abiertos |
| 3 | Plan de contingencia: categoría 3°, PN mínimo USD 75.000 (50 % si el volumen < USD 2,5 M), S.R.L. preparada | La operadora ya no es la S.R.L. sino una LLC de Delaware. La RG (art. 4, según el dictamen) trata a extranjeras que operan directo en la Argentina | **Desactualizado**: rehacer el plan con la LLC como operadora |
| 4 | Arquitectura internacional viable (LLC en EE.UU. + operadoras locales) | Ya existe una LLC operadora (Bull&Bear International, LLC, constituida en 2017). No consta que sea titular de la IP ni que haya operadoras locales ni MSA | Vigente con cambios |
| 5 | Modelo recomendado: MSA invertido (la LLC contrata con usuarios y paga a la S.R.L.) | La LLC figura como quien presta el servicio (pie y política de privacidad). Falta: contrato con usuarios (T&C), MSA con quien desarrolla, estudio de precios de transferencia, socios definidos. Facturación pendiente con contador de EE.UU. | Parcial / Pendiente |
| 6 | IP: cesión a la LLC inscripta en DNDA, marca en INPI, contratos intercompany | No hay evidencia en el repo de cesión, marca ni contratos. El dictamen además notó que el repo figura a nombre de otro usuario que el titular declarado | **Pendiente** |
| 7 | Datos personales: incumplimientos formales (base sin inscribir, transferencias sin instrumento, sin contratos con encargados, sin leyenda, responsable ≠ quien administra) | Leyenda AAIP: **hecha** (está en `privacidad.tsx`). Responsable: la LLC (ahora identificada con domicilio). El resto, sin evidencia de avance | Parcial |

### 1.2 Medidas de blindaje (sección VI)

| Medida | Hoy | Estado |
|---|---|---|
| 1. «Esperar»: dar copia de la tx firmada y botón para difundirla; umbral y plazo fijados por el usuario; «recordatorio de difusión revocable» | El servidor guarda la tx y la difunde cuando baja la comisión (`apps/api/src/app.ts`). No hay copia para el usuario, ni plazo máximo elegido por él | **Pendiente** |
| 2. Listas con transferencia: reformular como regalo en dinero al dueño; sacar «convertido» y reparto automático de sats; advertencia al invitado; tope por lista < UVA 35.000/mes | Advertencia al invitado: **hecha** (`lista.cobro.invitadoAviso`: «No pasa por RegalaleBitcoin…»). Estado «Convertida» y compra en tanda con reparto de sats: **siguen** (decisión de Claudia del 17/10). Tope: **no hay** («sin tope», `docs/mainnet.md`). El dato de cobro va cifrado y la plataforma no lo ve (mejora no contemplada por el dictamen) | **Pendiente en lo central** |
| 3. Link guardado: nada que ponga semillas al alcance del servidor sin dictamen previo | Regla 4 de `docs/operacion.md`: no entra si no es con clave que el servidor no tenga. No implementado | Vigente, se cumple |
| 4. Integridad del código: build reproducible, hash por versión, SRI, registro de despliegues, auditoría externa | CSP estricta y cero scripts de terceros: sí. Build reproducible y hash publicado: «más adelante». Firebase Hosting sigue delante (hallazgo I5, «pendiente de confirmación»). Sin nodo propio. Auditoría externa: no consta | **Pendiente** |
| 5. Documentación pública coherente (README, descripción del repo, arquitectura) | El README todavía dice «Todo corre en signet/testnet… No uses esto con fondos reales». `docs/arquitectura.md` todavía dice que el servidor «solo recibe una semilla en el caso del link guardado». El repo se sigue llamando `RodoGames` | **Pendiente** |
| 6. Glosario de marca y leyenda de no inscripción en el pie | No hay leyenda «no inscripto como PSAV». «Comisión» aparece solo para la de red (regla 6). Se usa «convertir/convertida» en listas | **Pendiente** |
| 7. Términos y Condiciones | No existen en la web (ni página ni enlace) | **Pendiente**, y ahora más urgente porque hay cobro |
| 8. Carpeta de defensa (dictamen, diagrama de claves, informe técnico firmado por idóneo) | `docs/operacion.md`, `docs/derivacion.md` y la página «Sin custodia» son una buena base. Falta el informe firmado por un tercero | Parcial |
| No consultar a la CNV por ahora | — | Vigente; decisión a revisar si se avanza con B2B y exchanges |

### 1.3 Propiedad intelectual y estructura (secciones VII a IX)

| Recomendación | Hoy | Estado |
|---|---|---|
| Licencia exclusiva puente del titular a la operadora | La operadora cambió a la LLC; no consta licencia | Pendiente, ahora a favor de la LLC |
| Aporte o cesión de la IP a la LLC, inscripta en DNDA | No consta | Pendiente |
| Marca en INPI (clases 9, 35, 42; cuidado con la 36) | No consta | Pendiente |
| Dominio, repo, nube y correo a nombre de la LLC | Según el dictamen, a nombre de una persona humana; sin cambios conocidos | Pendiente |
| Billetera de cobro de la LLC | Xpub de solo lectura con claves en el hardware de una persona (`docs/handoff/2026-10-19/cobro-y-creditos.md`) | **Pendiente**; ahora cobra de verdad |
| Definir socios de la LLC y su residencia fiscal | La LLC existe desde 2017; el repo no dice quiénes son los socios ni dónde residen | Pregunta para abogado y contador |
| Form 5472 + 1120 pro forma | Depende de la composición de la LLC | Contador de EE.UU. |
| MSA de desarrollo con cesión automática a la LLC | No consta | Pendiente |
| Política de accesos (quién despliega, quién firma la billetera de cobro, doble control) | Hay 2FA confirmado en Google, GitHub, DNS, Resend y mail (18/10). Los deploys los hace la responsable. Sin documento de política | Parcial |
| Economía del Conocimiento (Ley 27.506) para la S.R.L. | Con la LLC como operadora, aplica solo si hay una operadora local que exporte servicios | A revisar |

### 1.4 Datos personales (sección X)

| Recomendación | Hoy | Estado |
|---|---|---|
| Leyenda de la Res. AAIP 14/2018 | En la política de privacidad, texto literal | **Hecho** |
| Política conforme al art. 6° | Existe y describe lo que se guarda; identifica a la LLC con domicilio. Contacto `hola@` (el dictamen sugería un canal `privacidad@`) | Hecho en lo principal |
| Inscribir bases ante la AAIP | No consta. Con responsable extranjero, hay que confirmar cómo se hace | Pendiente |
| Acuerdos con Google Cloud y Resend; cláusulas de transferencia internacional (Brasil y EE.UU. no adecuados, según el dictamen) | No consta | Pendiente |
| Menores: prohibir cuentas, desaconsejar apellido o foto de niños | No hay texto sobre menores. Los regalos de bautismo o cumpleaños de chicos llevan nombre y a veces imagen | Pendiente |
| Cifrar nombre, mensaje e imagen de la tarjeta con la clave del link | **Etapa C en PR #138** (sin mergear) | En PR |
| Separar mail de direcciones BTC | **Etapa D en PR #141** (desvincular regalos de la cuenta, lista cifrada con la clave maestra) | En PR |
| HMAC con clave rotada en lugar de hash simple de IP | Las denuncias guardan `sha256("denuncia:" + IP)` sin clave (`apps/api/src/reports.ts`): reversible por fuerza bruta en IPv4. El mail del denunciante ya no se guarda: solo un hash por lista (etapa A) | **Pendiente** (IP); hecho (mail) |
| Plazos de conservación automáticos | La política dice «mientras la cuenta, el regalo o la lista existan» | Pendiente |
| Minimizar la zpub | Se guarda en claro (hace falta para derivar direcciones) | Pendiente de decisión |
| Logs sin IP completa ni mails, retención corta | La API no persiste IP en la base; la nube guarda registros técnicos (Cloud Run). Plazo no escrito | Parcial |
| Correos sin datos de terceros | El recordatorio «todavía no abrió tu regalo» incluía el nombre de quien recibe (`para`) y pasaba por Resend (`apps/api/src/notices.ts`). Con la etapa C (PR #138) el nombre va cifrado y el recordatorio dice ocasión y fecha; la etapa D (PR #141) agrega un aviso genérico | En PR |
| 2FA y mínimo privilegio | 2FA confirmado el 18/10/2026 (AWS fuera por decisión de la responsable) | Hecho en lo principal |
| Supresión que alcance copias de seguridad | No documentado | Pendiente |
| Registro de actividades, evaluación de impacto, protocolo de incidentes | No consta | Pendiente |
| Vista previa del link sin datos | **Hecho** (etapa A): la vista previa ya no dice para quién es | Hecho |

### 1.5 Datos que el dictamen da por ciertos y ya no lo son

| Dato del dictamen | Hoy |
|---|---|
| Operadora: Apptivalo S.R.L. | Bull&Bear International, LLC (Delaware), desde el 24/10/2026 |
| Tope de USD 100 por regalo | Sigue, más USD 500 por día por cuenta y USD 250 por aporte en listas (28/10). El handoff B2B v2 propone **USD 250 por regalo para todo el producto**: según `CLAUDE.md` y `docs/mainnet.md`, eso necesita una autorización explícita anotada, y `docs/derivacion.md` §8 pide revisar la seguridad de los 44 bits si el techo sube |
| Cobro publicado pero no activado | Cobro activo en sats (packs, anual, fundador, unidades), con cupones y arrepentimiento con devolución manual en sats |
| Mapa de datos: denuncias con mail | El mail del denunciante ya no se guarda (solo hash por lista) |
| Sin funciones para empresas | B2B en diseño (no implementado; requiere OK de la responsable) |
| No menciona estadísticas | Hay contador semanal de altas por país aproximado y origen, sin vínculo con la cuenta (`apps/api/src/altas.ts`) |

---

## 2. Riesgo legal que afrontamos

Escala: **probabilidad** (de que una autoridad, un usuario o un tercero lo plantee en los próximos
12 meses) e **impacto** (si prospera). Bajo / Medio / Alto. Son estimaciones de trabajo para
ordenar la conversación, no opiniones legales.

### 2.1 Matriz resumen

| Tema | Probabilidad | Impacto | Riesgo hoy |
|---|---|---|---|
| A. Registro PSAV / CNV y criterio de custodia (regalos) | Baja | Alto | **Medio-bajo** |
| A'. PSAV por las listas con transferencias | Media | Alto | **Alto** |
| B. UIF / lavado y KYC | Baja-media | Alto | **Medio** |
| C. Defensa del consumidor y arrepentimiento | Media | Medio | **Medio-alto** |
| D. Datos personales (Ley 25.326) | Media | Medio | **Medio** |
| E. Cambiario / pesos en listas | Baja-media | Medio | **Medio** |
| F. Impuestos y facturación | Media | Medio-alto | **Medio-alto** |
| G. B2B y co-branding con PSAV | Media (si se lanza) | Alto | **Alto** al lanzarlo |
| H. Mainnet y responsabilidad por pérdidas | Media | Medio | **Medio** |
| I. Jurisdicción y ley aplicable | Media | Medio | **Medio** |

### 2.2 Detalle por tema

#### A. Registro PSAV / CNV y criterio de custodia

- **Qué dice el dictamen:** no es PSAV; riesgos residuales en «esperar», bóveda, «exclusivamente»
  y operador de hecho.
- **Qué mitiga hoy:**
  - Las claves del regalo, la semilla, la passphrase y la firma del barrido viven solo en el
    navegador. El servidor no puede firmar ni reconstruir claves (`docs/operacion.md` regla 1).
  - Barrido con una sola salida, validado antes de difundir; no hay salida para la plataforma.
  - El recupero lo firma quien regala; no existe «te lo devolvemos».
  - Bóveda cifrada con PRF de la passkey; el servidor no tiene la clave.
  - El cobro va aparte, a una dirección propia; nunca sale de un regalo.
  - Link guardado y multifirma avanzada: apagados.
  - No hay funciones de bloqueo, congelamiento ni devolución de fondos de terceros (el dictamen
    dice que con eso la tesis 4 queda en riesgo bajo).
- **Qué lo agrava:**
  - «Esperar»: el servidor decide cuándo difundir y el usuario no tiene copia.
  - Funciones que no son «exclusivamente software»: cobro, cupones, topes por cuenta, pausa de
    listas denunciadas, y el B2B (recupero en lote, panel corporativo).
  - Operador de hecho: LLC operadora, pero dominio, repo, nube y billetera de cobro de una persona.
  - Sin leyenda de no inscripción, sin T&C, documentación pública desactualizada (README dice
    «solo signet»).
  - El nombre de la LLC («Bull&Bear International») evoca mercados financieros: el abogado
    debería opinar si eso pesa frente al art. 34 (publicidad que sugiera ser PSAV).
  - Seguridad de los 44 bits: con el link interceptado, romper la passphrase cuesta del orden de
    USD 500–1.000 (`docs/derivacion.md` §8). Con techo de USD 250 el margen se achica. No es
    custodia, pero un robo masivo dañaría la tesis de «nadie más que el usuario controla».
- **Normas a confirmar:** Ley 25.246 art. 4° bis (incorporado por Ley 27.739), RG CNV 1172/2026
  (B.O. 15/10/2026, vigente desde 16/10/2026), arts. 1°, 2°, 3°, 4°, 9°, 10, 34, 38 y 41, umbral
  de UVA 35.000 y patrimonios mínimos. **La RG 1172/2026 es muy reciente y no pude verificarla;
  puede haber modificaciones, circulares o criterios interpretativos nuevos. Confirmar con el
  abogado.**

#### A'. PSAV por las listas con transferencias (tesis 5)

- **Qué mitiga hoy:**
  - La plata va de persona a persona; la plataforma no la recibe ni la ve.
  - El dato de cobro está cifrado en el navegador del dueño; la clave viaja en el fragmento del
    link y la plataforma no puede leerlo (ni soporte ni admin).
  - No se suben comprobantes.
  - El invitado ve: «No pasa por RegalaleBitcoin: no vemos estos datos ni somos responsables».
  - El dueño acepta un compromiso propio de convertir y un aviso sobre su banco.
- **Qué lo agrava:**
  - Estado «Convertida» y «compra en tanda» que reparte sats por invitado: es exactamente lo que
    el dictamen pide sacar porque narra la operación como un cambio por cuenta de los invitados.
  - Texto del invitado: «cuando lo convierta, te va a contar cuántos sats compró con tu aporte».
  - Sin tope para transferencias: el dictamen recomienda un tope por lista inferior al umbral
    de UVA 35.000 mensuales (que, según el dictamen, alcanzaría al dueño de la lista como
    persona humana que opera por terceros).
  - Se ofrece en varios países y monedas (pesos, reales, pesos colombianos, euros, libre).
  - Hay cotizaciones BTC/ARS visibles en la web.
- **Decisión previa a revisar:** el 17/10/2026 Claudia decidió no hacer consulta legal de las
  listas con alias y mostrar los sats de una transferencia convertida. El dictamen recomienda lo
  contrario. Es una decisión de la responsable; este informe solo marca la tensión.

#### B. UIF / lavado y KYC

- **Contexto:** el dictamen no trata este tema. En general, los PSAV son sujetos obligados ante la
  UIF; si la plataforma no es PSAV, en principio no lo sería por esa vía. **Confirmar con el
  abogado** si alguna otra categoría de sujeto obligado podría alcanzar a la LLC o a una
  operadora local, y si hay obligaciones de reporte para quien no es sujeto obligado.
- **Qué mitiga:** topes (USD 100 por regalo, USD 500 por día por cuenta, USD 250 por aporte en
  listas); sin custodia; los fondos entran desde billeteras o exchanges del usuario (estos sí
  hacen KYC); estadísticas sin datos personales; política de denuncias con pausa escalonada.
- **Qué lo agrava:**
  - Transferencias de listas sin tope.
  - Cuentas solo con mail y passkey, sin verificación de identidad; varias cuentas por persona
    burlan el tope diario.
  - Regalos con passphrase: dificultan seguir quién recibe (es el propósito del producto, pero un
    regulador puede leerlo como opacidad).
  - B2B: lotes grandes fondeados en una sola transacción.
  - Plan D (desvincular regalos de la cuenta) reduce lo que la plataforma puede mostrar ante un
    requerimiento judicial. Es bueno para privacidad; conviene que el abogado lo valide frente a
    deberes de colaboración.
  - El tope diario por cuenta necesita sumar regalos por cuenta: el plan D tiene que resolver eso
    sin volver a vincular cada regalo.

#### C. Defensa del consumidor y botón de arrepentimiento

- **Contexto:** el dictamen no lo trata. El sitio ya tiene botón de arrepentimiento y leyenda de
  Defensa del Consumidor (`docs/handoff/2026-10-24/empresa-bull-and-bear.md`). La norma del botón
  de arrepentimiento (resolución de la Secretaría de Comercio Interior, que creo es la 424/2020)
  y la Ley 24.240 **hay que confirmarlas con el abogado**; no las verifiqué.
- **Qué mitiga:** arrepentimiento dentro de los 10 días si no se usó ningún crédito; código de
  trámite; precios en sats informados antes de pagar; confirmación del monto interpretado antes
  de pagar un regalo; recupero por quien regala si nadie reclama.
- **Qué lo agrava:**
  - **No hay Términos y Condiciones**, con cobro activo.
  - Plan «fundador»: «regalos libres para siempre». Un compromiso perpetuo sin reglas escritas
    (¿qué pasa si el servicio cierra o cambia?).
  - Devolución en los mismos sats, no en su valor en dólares, y hecha a mano: tiene que estar
    escrito y aceptado antes de pagar.
  - Arrepentimiento bloqueado si se usó un crédito: confirmar que eso es compatible con la norma.
  - Cupones vencidos, planes anuales sin renovación automática: reglas sin texto contractual.
  - Proveedor extranjero (LLC) frente a consumidores argentinos: la ley de consumo suele aplicarse
    igual (lo dice el propio handoff del 24/10).

#### D. Datos personales (Ley 25.326)

- **Qué mitiga:**
  - Lo que nunca se tiene: claves, link completo, palabras, biometría.
  - Dato de cobro cifrado en el navegador.
  - Etapa A publicada: vista previa sin nombre; denuncias sin mail.
  - Estadística de altas sin vínculo con la cuenta.
  - Cero scripts de terceros; leyenda AAIP; política que describe la realidad.
  - Etapas B, C y D en PR (#137, #138, #141; ver §3).
- **Qué lo agrava:**
  - Responsable extranjero (LLC de Delaware); base en Brasil (Google Cloud, San Pablo) y correo
    en EE.UU. (Resend): según el dictamen, ninguno de los dos es país adecuado. Sin cláusulas
    modelo firmadas.
  - Bases sin inscribir.
  - Nombres de terceros (quien recibe, invitados), posibles menores, imágenes (derecho a la
    imagen, CCyC arts. 52 y 53 según el dictamen).
  - Hash de IP sin clave en denuncias.
  - Sin plazos de retención.
  - Recordatorios con el nombre de quien recibe pasando por Resend.
  - Etapa B (mails cifrados con Cloud KMS): protege ante una filtración de la base, pero el
    servidor sigue pudiendo descifrar. Sigue siendo dato personal tratado por el responsable; no
    hay que comunicarla como «no tenemos tu mail».
  - B2B: datos de empleados y clientes de terceros.
- **Normas a confirmar:** Ley 25.326, Decreto 1558/2001, Res. AAIP 14/2018, 47/2018, 34/2019,
  159/2018, 198/2023, Disp. DNPDP 60-E/2016. **Hay proyectos de reforma en trámite (el dictamen
  cita expedientes de 2026); pueden haber avanzado.** Además, el comentario del código de
  `privacidad.tsx` cita la «Disp. 10/2008», que el dictamen da por derogada por la Res. AAIP
  14/2018 (el texto de la leyenda publicada es el correcto; solo cambia el comentario).

#### E. Cambiario / pesos en listas

- **Contexto:** el dictamen no lo trata como tema propio (solo menciona el régimen cambiario en
  la estructura de la LLC). **No estoy seguro de qué restricciones cambiarias rigen hoy para
  personas humanas que compran bitcoin con pesos; confirmar con el abogado.**
- **Qué mitiga:** la plataforma nunca recibe, convierte ni transfiere pesos; el dueño compra en
  su exchange; los cobros del servicio son en sats.
- **Qué lo agrava:** muchas transferencias de terceros a cuentas personales (el sitio ya avisa
  que el banco puede preguntar); listas en varias monedas extranjeras; cobro de la LLC en BTC
  fuera del circuito cambiario local (el dictamen lo presenta como beneficio, pero si hay una
  operadora local que exporta servicios, sus cobros sí entran en la normativa del BCRA).

#### F. Impuestos y facturación

- **Qué mitiga:** cobro en sats a una dirección propia, separado de los regalos; precios
  informados; la facturación está identificada como pendiente con contador.
- **Qué lo agrava:**
  - **Se está cobrando sin esquema de facturación definido.**
  - Ingresos en una billetera cuyas claves tiene una persona, no la LLC (el dictamen lo marca).
  - Socios de la LLC sin definir en el repo: si son residentes argentinos, según el dictamen la
    renta se les imputa en el año (art. 130 inc. e LIG) y el ahorro es moderado.
  - Formularios de EE.UU. (5472 y 1120 pro forma) con multas altas por omisión, según el
    dictamen (USD 25.000 por formulario).
  - IVA sobre servicios digitales prestados desde el exterior a consumidores argentinos: **no lo
    trata el dictamen; confirmar con el contador si aplica y cómo, cobrando en BTC.**
  - Para quien recibe o la empresa que regala: tratamiento del regalo (posible impuesto a la
    transmisión gratuita de bienes en algunas provincias; ganancias de empleados en B2B).
    **A confirmar; no es obligación de la plataforma, pero conviene un aviso.**
- **Normas a confirmar:** LIG t.o. 2019 (arts. 1°, 17, 20, 22, 24, 102–104, 130), Ley 27.799
  («vigente desde el 2/1/2026», umbrales de evasión), RG ARCA 5798/2025 y Decreto 767/2025,
  acuerdo de intercambio con EE.UU. (B.O. 13/3/2024), IRC §§862, 864, 871, 881, 6038A, Treas.
  Reg. §301.7701-3, exención de la Corporate Transparency Act (FinCEN, 2025–2026). **El propio
  dictamen dice que varias se tomaron de fuentes secundarias («según Marval O'Farrell»,
  «cotejar en InfoLEG»). Todas deben verificarse antes de firmar instrumentos.**

#### G. B2B y co-branding con PSAV

- **Qué mitiga (en el diseño):**
  - Rige `docs/operacion.md` completo; claves en el navegador de la empresa.
  - No se mandan mensajes a destinatarios; al vencer no se mueve nada solo.
  - Billetera propia como opción principal del reclamo.
  - No se venden tarjetas fondeadas al público (ya identificado como riesgo PSAV).
  - Datos de destinatarios cifrados con la bóveda; cobro B2B sin implementar hasta definirlo.
  - Bloqueante de varias personas por cuenta antes de vender lotes.
- **Qué lo agrava:**
  - **Co-branding con un PSAV** (art. 34 según el dictamen): página `/x/<slug>` con marca del
    exchange, «cómo pasarlo a pesos», «Fondear desde X». Puede leerse como que la plataforma es
    parte del servicio del PSAV o que se presenta como tal.
  - Si el exchange paga a la plataforma por usuario derivado o por volumen, el abogado debería
    ver si eso se acerca a «participación en servicios financieros relacionados» (art. 4° bis
    inc. v, según el dictamen).
  - «Recupero en lote» desde un panel corporativo: el usuario de la plataforma (la empresa)
    recupera fondos de regalos ajenos todavía no reclamados. Firma el navegador de la empresa,
    pero la función es más «administración» que un regalo individual.
  - Opción 4 de las palabras («sin palabras, con vencimiento corto»): la empresa queda con todo
    lo necesario para mover los fondos de sus destinatarios. Es custodia de la empresa, no de la
    plataforma, pero conviene que el contrato lo deje claro.
  - Tope de USD 250 por regalo para todo el producto (propuesto en el handoff): necesita
    autorización formal y revisión de la seguridad de la passphrase.
  - Datos de empleados de terceros: la plataforma pasa a ser encargada de la empresa (necesita
    contrato de tratamiento).
  - Volumen: lotes grandes acercan los umbrales del dictamen (USD 2,5 M de volumen anual para el
    50 % del patrimonio mínimo, «volumen local > 20 %» como punto de contacto).

#### H. Mainnet y responsabilidad por pérdidas

- **Qué mitiga:** topes; revisión de seguridad del 17/10 con bloqueantes resueltos; vectores de
  regresión que fijan la derivación; tope de comisión en el navegador y confirmación aparte si
  supera el 25 %; aviso desde el 10 %; recupero por quien regala; respaldo de cadena
  (mempool.space + blockstream.info); 2FA en las cuentas críticas; esquema de recuperación
  documentado sin la plataforma (`docs/derivacion.md` §6).
- **Qué lo agrava:**
  - Sin T&C que expliquen irreversibilidad, pérdida de link o palabras, dependencia de
    terceros (mempool.space, Firebase) y límites de responsabilidad.
  - Sin nodo propio; Firebase delante del JavaScript (I5 «pendiente de confirmación»).
  - Sin build reproducible ni auditoría externa.
  - B1: el mismo código de recuperación produce el mismo link en signet y mainnet (aceptado por
    la responsable).
  - El README dice «No uses esto con fondos reales», contradicción que un usuario podría usar
    contra la plataforma (o a favor, según cómo se lea).
  - «Esperar»: si la tarea programada falla, el regalo queda trabado y el usuario no tiene la tx.

#### I. Jurisdicción y ley aplicable

- **Qué mitiga:** operador identificado con domicilio registrado; contacto publicado.
- **Qué lo agrava:**
  - Sin T&C no hay elección de ley ni de jurisdicción. Con consumidores argentinos, una cláusula
    de jurisdicción extranjera probablemente no valga (confirmar).
  - Oferta en pt, en, it con PIX, Bre-B, IBAN: el dictamen advierte LGPD (Brasil), Ley 1581 de
    2012 (Colombia), RGPD (UE) y sus regímenes de activos virtuales, sin opinión local.
  - Si alguna vez se califica como PSAV, la RG (art. 4°, según el dictamen) mira dominio `.ar`,
    rampas locales, direccionamiento a residentes, publicidad dirigida y volumen local > 20 %. El
    sitio usa `.com`, pero está en castellano rioplatense, con pesos y alias argentinos.

---

## 3. Soluciones adicionales

Además de lo que propone el dictamen. «En curso» quiere decir que hay trabajo en el código o un
plan aprobado; «Hecho» que ya está publicado.

### 3.1 Rápidas (días)

| # | Medida | Tipo | Baja riesgo en | Estado |
|---|---|---|---|---|
| R1 | Actualizar README (mainnet con topes), descripción y nombre del repo, y la línea de `docs/arquitectura.md` sobre «recibir una semilla» | Documental | A, H | Pendiente |
| R2 | Leyenda en el pie: software de autocustodia, no custodia ni intercambia, no inscripto como PSAV (texto a validar con el abogado, en todos los idiomas y en vos/tú) | Producto | A, G | Pendiente |
| R3 | «Esperar»: mostrar y permitir descargar la tx firmada, con botón «difundirla yo» y la opción de cancelar el recordatorio | Producto | A (tesis 1), H | Pendiente |
| R4 | HMAC con clave secreta rotada para IP y hash del denunciante (hoy SHA-256 sin clave) | Producto | D | Pendiente |
| R5 | Sacar el nombre de quien recibe de los recordatorios por mail | Producto | D | **En PR** (C #138 y D #141) |
| R6 | Aviso a quien recibe y a quien regala sobre posibles impuestos del regalo (sin opinar, «consultá a tu contador») | Documental | F | Pendiente |
| R7 | Texto sobre menores: no usar apellido ni foto de chicos, y pedido de supresión inmediato | Producto | D | Pendiente |
| R8 | Canal `privacidad@regalalebitcoin.com` y registro interno de pedidos con plazos (10 días acceso; 5 hábiles rectificación/supresión, según el dictamen) | Operativo | D | Pendiente |
| R9 | Anotar en `docs/mainnet.md` si el tope de USD 250 por regalo del handoff B2B está autorizado o no; hasta entonces, sigue USD 100 | Documental | A, H | Pendiente |
| R10 | Cambiar «Convertida» por algo neutro que no describa un cambio por cuenta del invitado (por ejemplo, «Ya está en bitcoin») mientras se decide el rediseño de fondo | Producto | A' | Pendiente (requiere decisión) |
| R11 | Corregir el comentario de `privacidad.tsx` («Disp. 10/2008» → Res. AAIP 14/2018) | Código | — | Pendiente (menor) |

### 3.2 Medianas (semanas)

| # | Medida | Tipo | Baja riesgo en | Estado |
|---|---|---|---|---|
| M1 | **Términos y Condiciones** con: software de autocustodia; irreversibilidad; pérdida de link, palabras o código; recupero por quien regala; listas como relación entre particulares; precios en sats y devolución en sats; reglas de planes, cupones y fundador (incluido qué pasa si el servicio cierra); límites de responsabilidad; ley y jurisdicción. Aceptación expresa antes de pagar | Documental | A, C, H, I | Pendiente |
| M2 | Listas con transferencias: tope por lista y por mes; sacar el reparto automático de sats (o dejarlo como nota libre del dueño, sin cálculo de la plataforma); reformular como «regalo en dinero al dueño» | Producto | A', B, E | Pendiente (requiere decisión de la responsable) |
| M3 | Cifrar mails en la base con claves envueltas por Cloud KMS | Producto | D | **En curso** (etapa B) |
| M4 | Cifrar el texto de la tarjeta con la clave del link (verificar que la vista previa y la tarjeta imprimible sigan funcionando) | Producto | D, A | **En curso** (etapa C) |
| M5 | Desvincular regalos de la cuenta (lista cifrada con la clave maestra; avisos genéricos), cuidando que el tope diario, «Descartar» y el arrepentimiento («¿usó créditos?») sigan funcionando sin re-vincular | Producto | D, B | **En PR #141** (tope diario, Descartar y devolución resueltos sin re-vincular) |
| M6 | Plazos de retención automáticos: regalos reclamados o recuperados, listas cerradas, pagos (respetando lo que pida la ley contable), logs de Cloud Run | Producto / Operativo | D | Pendiente |
| M7 | Acuerdos de tratamiento y transferencia internacional con Google Cloud y Resend; inscripción de bases (confirmar cómo con responsable extranjero) | Documental | D | Pendiente |
| M8 | Billetera de cobro a nombre de la LLC, con política de firma (quién, doble control) | Operativo | A (tesis 6), F | Pendiente |
| M9 | Build reproducible con hash publicado por versión y registro de despliegues | Producto | A, H | Pendiente |
| M10 | Informe técnico de no-custodia firmado por un tercero idóneo, para la carpeta de defensa | Documental | A, A' | Pendiente |
| M11 | Política de denuncias y respuesta a autoridades escrita (qué datos hay, cómo se entregan, plazos) | Documental | B, D | Pendiente |

### 3.3 Estructurales (meses)

| # | Medida | Tipo | Baja riesgo en | Estado |
|---|---|---|---|---|
| E1 | Cadena de titularidad completa: IP, marca, dominio, repo, nube y correo a nombre de la LLC; cesiones inscriptas; contratos intercompany | Documental | A, F, I | Pendiente |
| E2 | Definir socios y residencia fiscal de la LLC; facturación del costo por servicio; IVA de servicios digitales | Operativo | F | Pendiente (contador de EE.UU.) |
| E3 | Auditoría externa de seguridad del código que mueve fondos y del núcleo criptográfico | Operativo | H, A | Pendiente |
| E4 | Nodo propio como fuente principal de cadena (hoy mempool.space + blockstream.info) | Producto | H | Pendiente |
| E5 | Hosting sin intermediario que termine TLS delante de las páginas con claves (lo que planteaba `docs/arquitectura.md` originalmente) | Producto | A, H | Pendiente |
| E6 | Antes del B2B: dictamen específico sobre co-branding con PSAV, recupero en lote y datos de empleados; contrato tipo con empresas (responsable/encargado, custodia de la empresa, opción de palabras elegida) | Documental | G | Pendiente (ya figura en el handoff) |
| E7 | Bóveda con varias passkeys y roles para cuentas de empresa | Producto | G, H | Pendiente (bloqueante del B2B) |
| E8 | Opinión local antes de promocionar en Brasil, Colombia y la UE | Documental | I, D | Pendiente |
| E9 | Evaluación de impacto de privacidad y protocolo de incidentes | Documental | D | Pendiente |

---

## 4. Preguntas para el abogado

### Encuadre PSAV / CNV
1. El dictamen se basó en Apptivalo S.R.L. como operadora. Con **Bull&Bear International, LLC**
   (Delaware) como operadora desde el 24/10/2026, ¿cambia alguna conclusión? ¿Cómo queda el plan
   de contingencia (categoría 3°, patrimonio mínimo, inscripción de extranjeras)?
2. ¿El nombre «Bull&Bear International» o su actividad anterior (constituida en 2017) agrega
   riesgo frente al art. 34 o en lo societario?
3. Listas con transferencias: ¿alcanza con cambiar textos («Convertida», «cuántos sats compró con
   tu aporte»), o el problema es la función (reparto automático de sats)? ¿Qué tope por lista
   recomienda, en qué moneda y con qué período?
4. El dato de cobro va cifrado en el navegador del dueño y la plataforma no lo puede ver. ¿Eso
   cambia la valoración de la tesis 5?
5. ¿El cobro activo (packs, planes, cupones) cambia el análisis de «como negocio» o de
   «exclusivamente software»?
6. ¿Recomienda poner ya la leyenda de no inscripción? ¿Con qué texto exacto?
7. ¿Hay novedades sobre la RG CNV 1172/2026 desde el 26/10 (modificaciones, criterios, consultas
   públicas)?

### UIF / lavado
8. Si no somos PSAV, ¿la LLC o una operadora local tienen alguna obligación ante la UIF? ¿Y si
   alguna vez nos calificaran como PSAV, desde cuándo?
9. ¿Los topes actuales (USD 100 por regalo, USD 500 por día por cuenta, USD 250 por aporte) son
   una defensa razonable? ¿Hace falta algún tope para las transferencias de listas por este lado?
10. Desvincular regalos de la cuenta (plan D): ¿hay algún deber de conservación o de colaboración
    que lo impida o lo limite?

### Defensa del consumidor
11. Confirmar la norma vigente del botón de arrepentimiento y si es válido: (a) devolver en los
    mismos sats y no en su valor; (b) negarlo si ya se usó un crédito; (c) hacer la devolución a
    mano.
12. Plan «fundador» con beneficios «para siempre»: ¿cómo redactarlo para que no sea una promesa
    perpetua exigible si el servicio cambia o cierra?
13. ¿Qué contenido mínimo deben tener los T&C y cómo se instrumenta la aceptación? ¿Vale una
    cláusula de ley y jurisdicción de Delaware frente a consumidores argentinos?

### Datos personales
14. Con un responsable extranjero, ¿hay que inscribir bases ante la AAIP? ¿Cómo?
15. ¿Qué instrumento hace falta para Google Cloud (Brasil) y Resend (EE.UU.)? ¿Sirven sus
    acuerdos estándar?
16. Cifrado con Cloud KMS (etapa B): ¿cómo debemos describirlo en la política sin prometer de más?
17. ¿Qué plazos de retención recomienda para regalos, listas, pagos, denuncias y logs?
18. Menores: ¿alcanza con un aviso y supresión a pedido, o hay que prohibir algo en la interfaz?
19. ¿Hay avances en los proyectos de reforma de la Ley 25.326 que convenga anticipar?

### Cambiario
20. ¿Hay algún riesgo cambiario para el dueño de una lista que recibe transferencias en pesos y
    compra bitcoin? ¿Y para listas en reales, pesos colombianos o euros con dueño en la Argentina?
    ¿Debemos avisarlo en la interfaz?

### Impuestos y estructura
21. ¿Qué pasos del dictamen (aporte de IP, MSA, licencia puente) siguen siendo necesarios con la
    LLC ya operando? ¿Quién debería ser titular de la IP hoy?
22. El dictamen notó que el repo figura a nombre de otro usuario que el titular declarado. ¿Qué
    documento necesita para dejar la titularidad clara?
23. Mientras se define la facturación con el contador de EE.UU., ¿hay que suspender el cobro o
    alcanza con documentarlo?
24. ¿La billetera de cobro tiene que pasar ya a la LLC? ¿Cómo se trata lo cobrado hasta ahora?

### B2B y co-branding
25. Co-branding con un exchange inscripto como PSAV: ¿qué textos y funciones evitar? ¿«Fondear
    desde X» y «cómo pasarlo a pesos» son aceptables?
26. Si el exchange nos paga por el canal (por paquete, por usuario o por volumen), ¿cambia el
    encuadre?
27. Recupero en lote desde un panel de empresa: ¿agrega riesgo para nosotros? ¿Qué debe decir el
    contrato con la empresa sobre quién controla los fondos hasta el reclamo?
28. Opción «sin palabras» (la empresa conserva todo lo necesario para mover los fondos): ¿es
    custodia de la empresa? ¿Nos alcanza de algún modo?
29. Datos de empleados y clientes de la empresa: ¿somos encargados? ¿Qué contrato tipo?

### Mainnet y responsabilidad
30. Sin T&C hoy y con fondos reales: ¿qué riesgo concreto tenemos ante una pérdida (bug, caída
    de un tercero, link perdido)? ¿Cuánto podemos limitar la responsabilidad frente a
    consumidores?
31. ¿Conviene pedir un informe técnico firmado (no-custodia) antes de subir el tope a USD 250?

### Otros países
32. ¿Recomienda limitar la promoción a la Argentina hasta tener opinión local para Brasil,
    Colombia y la UE? ¿Basta con no promocionar, o hay que restringir funciones (PIX, Bre-B,
    IBAN)?

---

## Anexo: fechas y normas del dictamen que conviene reconfirmar

| Norma o dato | Por qué revisarlo |
|---|---|
| RG CNV 1172/2026 (B.O. 15/10/2026, vigente 16/10/2026) | Muy reciente; puede tener modificaciones o criterios nuevos. No pude verificarla |
| Umbral de UVA 35.000 mensuales y patrimonios mínimos (USD 150.000 / 75.000 / 35.000; 50 % < USD 2,5 M) | Valores de la RG; confirmar texto y actualización |
| Ley 27.739 (B.O. 15/3/2024) y art. 4° bis Ley 25.246 | Confirmar que no hubo cambios |
| Ley 27.799 («Inocencia Fiscal», vigente 2/1/2026) y umbrales | El dictamen la toma de un estudio externo; cotejar en el B.O. |
| RG ARCA 5798/2025 y Decreto 767/2025 | Ídem |
| Exención de la Corporate Transparency Act (FinCEN, regla de 2025, definitiva 14/8/2026) | Cambió varias veces; confirmar |
| Proyectos de reforma de la Ley 25.326 (3397-D-2026, 1751-D-2026) | Pueden haber avanzado |
| Ley 27.506 (vigente hasta 31/12/2029) | Confirmar |
| Ley 11.723 art. 53 (validez de la cesión sujeta a inscripción) | El propio dictamen señala la discusión doctrinaria |
| Normas de defensa del consumidor y botón de arrepentimiento | El dictamen no las trata; las cita el handoff del 24/10 sin número |
