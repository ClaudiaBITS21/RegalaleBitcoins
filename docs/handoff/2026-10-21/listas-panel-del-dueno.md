# Handoff 21/10/2026 (agregado): panel del dueño de la lista

Estado: INTEGRADO (PR «Panel del dueño de la lista»), con dos notas:

- «Si dejó mail, le llega el mismo aviso»: las transferencias no guardan mail del invitado, así que
  el aviso de «No me llegó» se ve solo en su link de aporte.
- Totales en la página pública y del invitado: hoy no muestran ningún total que mezcle cadena y
  pesos, así que no hubo que desglosar nada. El panel del dueño tiene las cuatro tarjetas.

Se suma a «2026-10-21 - listas por país.md». En la rama `cowork/listas-pais` ya está integrado en
`docs/handoff/2026-10-21/listas-por-pais.md` como sección 7 (y las tareas pasaron a la sección 8).
Salieron al maquetar el panel con aportes en bitcoin y en pesos. Decidido por Rodolfo, 21/10/2026.

## 7.1 «No me llegó»

- En una transferencia *anunciada*, además de «Ya me llegó», el dueño tiene **«No me llegó»**.
  Pasa al estado nuevo `no_llego`. No suma en ningún total.
- El invitado lo ve en su link de aporte: «[nombre] no encontró esta transferencia. Revisá con tu
  banco que haya salido a la cuenta correcta y con el código [RB-XXXX] en el concepto.» Si dejó
  mail, le llega el mismo aviso.
- El invitado puede **volver a avisar** (vuelve a *anunciada*, con una nota opcional de hasta 140
  caracteres, por ejemplo «salió el 12/11 a las 18:40»). Hasta 3 veces por transferencia.
- Si la plata aparece tarde, el dueño la puede pasar de `no_llego` a *recibida* directamente.

## 7.2 Corregir una compra

- Cada compra en tanda queda como un registro propio (fecha, sats, transferencias). En el panel,
  cada compra tiene **«Corregir»** (cambiar los sats: se vuelve a repartir en proporción) y
  **«Deshacer»** (las transferencias vuelven a *recibida*).
- Se puede siempre, sin plazo, pero **nunca en silencio**: cada cambio queda en un historial de la
  compra, y el invitado ve el valor actual con la marca «corregido el dd/mm» (si se deshizo, su
  aporte vuelve a «recibido, todavía sin convertir»). Así un error de tipeo se arregla y nadie
  puede cambiar números sin que se note.
- Una transferencia no se saca sola de una compra: se deshace la compra y se arma de nuevo.

## 7.3 Totales separados

- **Nunca un número único que mezcle lo que vimos en la cadena con lo que declara el dueño.**
- Panel del dueño: «Llegó en bitcoin» (on-chain, lo verifica la web) y «Sats que compraste» (lo
  declarás vos), en tarjetas separadas; más «Anunciado en pesos» y «Pesos sin convertir».
- Página pública de la lista y página del invitado: si se muestra un total, va desglosado: «N sats
  recibidos + $ X en transferencias». Los sats declarados por el dueño se muestran solo en el
  aporte de cada invitado, con la atribución de la regla 5.

## Tareas y tests para Code

- Estado `no_llego` y «volver a avisar»; compras en tanda como registro con historial,
  «Corregir» y «Deshacer»; totales separados en panel, lista e invitado.
- Tests: corregir una compra reparte de nuevo y deja historial; deshacer devuelve las
  transferencias a *recibida*; `no_llego` no suma en ningún total.
Shell cwd was reset to /home/user
