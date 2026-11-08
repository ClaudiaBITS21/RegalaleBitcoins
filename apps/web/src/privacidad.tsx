import { useEffect } from 'preact/hooks';
import { SiteFooter, SiteHeader, useI18n } from './ui.tsx';

// Política de privacidad (Rodolfo, 20/10). Describe lo que el sistema guarda de verdad (ver las
// migraciones de apps/api) y cumple con la Ley 25.326 (leyenda de la AAIP, Disp. 10/2008). Está
// en castellano y escrita sin vos ni tú, para que valga con los dos tratos. Si cambia lo que se
// guarda o con quién se comparte, esta página cambia con el mismo PR.

// Versión de la etapa de privacidad B, C y D (Claudia, 08/11/2026): se publica junto con esos cambios.
const VERSION = '8 de noviembre de 2026';
const CONTACTO = 'hola@regalalebitcoin.com';

export function PrivacyPage() {
  const { lang } = useI18n();
  useEffect(() => {
    document.title = 'Política de privacidad · Regalale Bitcoin';
  }, [lang]);

  return (
    <div class="pagina pagina-home pagina-legal" lang="es">
      <section class="porque-hero">
        <div class="hero-contenido">
          <SiteHeader onOrange />
          <div class="porque-hero-texto">
            <p class="kicker kicker-tinta">Política de privacidad</p>
            <h1>Lo mínimo, y nunca tus llaves</h1>
            <p class="bajada">Qué datos guarda regalalebitcoin.com, para qué y con quién. Versión del {VERSION}.</p>
          </div>
        </div>
      </section>

      <main class="home-secciones legal">
        <section class="seccion">
          <h2>En pocas palabras</h2>
          <ul>
            <li>
              <strong>No sabemos para quién es cada regalo ni quién lo mandó.</strong> El nombre, quién lo manda y el mensaje se cifran en el navegador con la clave del link.
            </li>
            <li>
              <strong>No unimos los regalos con las cuentas.</strong> Cuando el regalo ya está pago y quien lo armó vuelve a entrar a «Mis regalos», deja de estar asociado a su cuenta; y
              los créditos usados tampoco dicen en qué regalo se usaron.
            </li>
            <li>
              <strong>El mail se guarda cifrado</strong> y se busca con un resumen (hash) que no permite leerlo.
            </li>
            <li>
              <strong>No guardamos la dirección IP</strong> en nuestra base, ni a qué billetera fue un regalo cuando se abrió.
            </li>
            <li>
              <strong>Nunca tenemos las llaves</strong> de un regalo ni el link completo: no podemos mover fondos.
            </li>
          </ul>
        </section>

        <section class="seccion">
          <h2>Quién es responsable</h2>
          <p>
            Regalale Bitcoin (regalalebitcoin.com) es un servicio de Bull&amp;Bear International, LLC, una sociedad constituida en el Estado de Delaware, Estados Unidos
            (registro n.º 6687084), con domicilio registrado en 1013 Centre Road, Suite 403-B, Wilmington, Delaware 19805, Estados Unidos, responsable de
            los datos que se describen acá. Para cualquier consulta o pedido sobre datos personales:{' '}
            <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
          </p>
        </section>

        <section class="seccion">
          <h2>Lo que nunca tenemos</h2>
          <ul>
            <li>Las claves de un regalo, las 12 palabras de recuperación ni las palabras de una billetera: se generan en el navegador y no llegan al servidor.</li>
            <li>El link completo de un regalo: la parte que abre el regalo (lo que va después del #) no viaja al servidor.</li>
            <li>La cara, la huella ni el PIN de una passkey: quedan en el dispositivo; al servidor llega solo la clave pública de la passkey.</li>
          </ul>
          <p>Por eso no podemos mover los fondos de un regalo ni recuperarlos en nombre de nadie.</p>
        </section>

        <section class="seccion">
          <h2>Qué datos guardamos</h2>
          <ul>
            <li>
              <strong>Cuenta de quien regala:</strong> mail, idioma y si el mail ya fue confirmado. El mail se guarda cifrado, con una clave que vive en el servicio
              de claves de Google Cloud (KMS) y no sale de ahí; para encontrar una cuenta por su mail usamos un resumen con clave (HMAC) que no permite leerlo. Con passkey, además, su clave pública y una caja cifrada que solo abre esa passkey (y, si se
              usa desde otro dispositivo con el QR, hasta tres copias de esa caja, también cifradas). Para abrirla en otra compu, el celu le pasa la llave cifrada para esa compu: nosotros solo
              guardamos ese paquete, que no podemos abrir, hasta que la compu lo recibe o pasan 10 minutos.
            </li>
            <li>
              <strong>Regalos:</strong> la dirección bitcoin, la ocasión, el idioma, el monto, el estilo de la tarjeta y la imagen propia si se sube
              una (se achica y se le sacan los datos ocultos, como la ubicación, en el propio teléfono antes de enviarla). También su estado y las transacciones, que son públicas en la red de bitcoin. El nombre de quien recibe, quién lo manda y el mensaje se cifran en el navegador con una clave que va en el link del regalo: los guardamos así y no los podemos leer (los regalos anteriores al 8 de noviembre de 2026 se cifran cuando quien regala entra a «Mis regalos»). Cuando
              el regalo se abre, no anotamos a qué billetera fue (la red de bitcoin lo muestra, como toda transacción). Si quien lo abre elige esperar a que baje la comisión, guardamos el
              envío ya firmado solo hasta mandarlo a la red; después se borra.
            </li>
            <li>
              <strong>Qué regalos son de qué cuenta:</strong> mientras se espera el primer pago de un regalo, queda unido a la cuenta de quien lo armó (para descontar el crédito y avisar
              que llegó el pago). Después, la próxima vez que esa persona entra a «Mis regalos» con su passkey, su navegador lo guarda en una lista cifrada con su clave de 12 palabras y
              borramos la unión: ya no sabemos qué regalos son de esa cuenta. Para editarlos, su navegador prueba que son suyos con una llave que sale de esa misma clave (guardamos solo
              un resumen que no permite reconstruirla). De la cuenta queda solo cuántos regalos armó, cuándo el último y cuántos seguían sin abrir la última vez que entró, para el
              aviso por mail. El tope diario guarda los montos de cada cuenta solo por 24 horas.
            </li>
            <li>
              <strong>Listas de regalos:</strong> título, ocasión, mensaje, idioma y la llave pública de la billetera que recibe. Si la lista acepta transferencias, el país y la moneda; el dato
              para transferir y su titular se guardan cifrados en el navegador de quien arma la lista y no los podemos ver (la clave va en el link de la lista). De cada aporte, el nombre, el
              mensaje y el monto que deja quien aporta.
            </li>
            <li>
              <strong>Compras y créditos:</strong> el producto, el monto en sats, la dirección de pago y sus transacciones; si se usa el botón de arrepentimiento, la dirección para la
              devolución. De cada crédito usado, la fecha (redondeada al día) y una referencia que no permite saber en qué regalo se usó.
            </li>
            <li>
              <strong>Reportes de listas:</strong> el motivo de quien reporta una lista. Su mail no se guarda: solo una huella (un hash) distinta para cada lista, que sirve para que la misma
              persona no reporte dos veces la misma lista y no permite saber quién es. La dirección IP no se guarda: se usa solo en el momento para frenar abusos. A quien armó la lista le llega
              el motivo.
            </li>
            <li>
              <strong>Cupones:</strong> el código, lo que da, quién lo usó y cuándo. Un cupón puede estar hecho para un mail: ese mail queda guardado, cifrado como los de las cuentas, con el cupón aunque la persona todavía no
              tenga cuenta, solo para que nadie más lo pueda usar. No le mandamos mails a esa dirección por el cupón; la invitación la manda quien la reparte.
            </li>
            <li>
              <strong>Datos técnicos:</strong> una cookie de sesión (<code>__session</code>) solo para mantener la cuenta abierta; el idioma elegido, en el propio navegador. La dirección IP se usa en
              memoria para frenar abusos y no se guarda en la base. Nuestro proveedor de nube lleva registros técnicos de los pedidos al servidor.
            </li>
            <li>
              <strong>Estadística de altas:</strong> al crear una cuenta sumamos uno a un contador por semana, con el país aproximado (según la zona horaria del
              dispositivo, no la dirección IP) y de dónde llegaste (solo el nombre del sitio, la etiqueta de campaña del link o si entraste por un cupón). Ese
              contador no se guarda en tu cuenta ni se puede relacionar con ella.
            </li>
          </ul>
        </section>

        <section class="seccion">
          <h2>Para qué los usamos</h2>
          <ul>
            <li>Para prestar el servicio: crear y mostrar los regalos y las listas, seguir los pagos y llevar los créditos.</li>
            <li>Para mandar los mails del servicio: confirmar el mail, el acceso a la cuenta, el aviso de regalo listo, el recordatorio si sigue sin abrirse y, ya sin saber cuáles, un aviso general si quedan regalos sin abrir (a los 14 días de armar uno y después cada 2 meses sin cambios).</li>
            <li>Para prevenir abusos y fraudes (por ejemplo, pausar una lista reportada mientras se revisa).</li>
          </ul>
          <p>
            No vendemos datos ni los usamos para publicidad. El sitio no tiene analytics, píxeles, chats ni ningún otro script de terceros.
          </p>
        </section>

        <section class="seccion">
          <h2>Con quién se comparten</h2>
          <ul>
            <li>
              <strong>Google Cloud</strong> (Firebase Hosting, Cloud Run, Cloud SQL y Cloud KMS): aloja el sitio, el servidor y la base de datos, y guarda la clave que cifra los mails, en
              la región de San Pablo, Brasil.
            </li>
            <li>
              <strong>Resend</strong>: envía los mails del servicio; recibe el mail de destino y el texto de cada mail. Los mails no dicen para quién es un regalo ni llevan su link.
              Puede procesarlos fuera de la Argentina.
            </li>
            <li>
              <strong>mempool.space</strong>: el servidor le consulta el estado de las direcciones y las transacciones (datos públicos de la red de bitcoin) y la cotización. No le enviamos datos
              personales.
            </li>
          </ul>
          <p>Fuera de esto, solo compartimos datos si lo exige una autoridad competente conforme a la ley.</p>
        </section>

        <section class="seccion">
          <h2>Cuánto tiempo</h2>
          <p>
            Guardamos los datos mientras la cuenta, el regalo o la lista existan y lo necesite el servicio. Algunos duran menos: el monto de cada regalo para el tope diario de la
            cuenta, 24 horas; el vínculo entre un regalo y la cuenta, hasta que se paga y quien lo armó vuelve a entrar a «Mis regalos»; un envío firmado en espera, hasta mandarlo. Se puede pedir que borremos una cuenta y sus datos escribiendo a{' '}
            <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>. Lo que ya está en la red de bitcoin (direcciones y transacciones) es público y nadie puede borrarlo.
          </p>
        </section>

        <section class="seccion">
          <h2>Derechos sobre los datos</h2>
          <p>
            Cualquier persona puede pedir acceso a sus datos, su rectificación, actualización o supresión, en los términos de la Ley 25.326 de Protección de los Datos Personales, escribiendo a{' '}
            <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>. El acceso es gratuito en intervalos de no menos de seis meses, salvo que se acredite un interés legítimo.
          </p>
          <p class="legal-aaip">
            La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes
            resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.
          </p>
        </section>

        <section class="seccion">
          <h2>Cambios</h2>
          <p>Si esta política cambia, publicamos la versión nueva en esta página con su fecha.</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
