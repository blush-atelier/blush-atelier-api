# Cómo protegemos los datos de pago

## Alcance actual

Esta etapa registra cliente, entrega, cotización y reserva PENDING. **Todavía no cobra,
no tokeniza tarjetas y no se conecta a Wompi.** No escribas tarjetas en Swagger.
Los endpoints actuales aceptan solo su contrato; propiedades adicionales como
cardNumber, pan, cvv o cvc se rechazan con HTTP 400. El error no devuelve sus valores.
Un cliente malicioso puede enviar cualquier cuerpo HTTP: el rechazo no significa que
los bytes nunca lleguen al servidor, sino que no se aceptan como contrato ni se persisten,
registran o reflejan. La validación no sustituye HTTPS ni una revisión del frontend.

## Recorrido previsto de la tarjeta

```mermaid
sequenceDiagram
    participant C as Navegador del cliente
    participant W as Wompi Sandbox
    participant B as Nuestro backend
    participant D as PostgreSQL
    C->>W: Tarjeta directamente al proveedor mediante su flujo oficial y HTTPS
    W-->>C: Token de tarjeta
    C->>B: ID de transacción y token, nunca PAN/CVV
    B->>W: Solicitud Sandbox con importe calculado en servidor
    W-->>B: Estado verificable
    B->>D: Referencias, importes, estado y reserva; sin tarjeta
```

Wompi indica que la tokenización debe realizarse desde el dispositivo hacia el
proveedor, sin pasar la tarjeta por el servidor del comercio.
[Explicación oficial](https://soporte.wompi.co/hc/es-419/articles/360045936994--Puedo-crear-un-token-para-las-tarjetas-de-cr%C3%A9dito-de-mis-clientes).
La documentación actual describe tokenización con JWE y una clave pública de
cifrado del proveedor; también documenta los tokens y autorizaciones necesarias.
Antes de implementar verificaremos qué flujo oficial cubre el modal requerido.
[Métodos de pago](https://docs.wompi.co/docs/colombia/metodos-de-pago/).

Si usamos un formulario propio, sus campos existen temporalmente en la memoria del
navegador. Habrá que limpiarlos y excluirlos de Redux, localStorage, analítica, logs,
reportes de errores y capturas. Un token o un payload cifrado JWE tampoco debe registrarse o persistirse en
el navegador como si fuera un dato público. Tokenización reduce exposición; no
vuelve al frontend inmune a XSS ni equivale por sí sola a certificar nuestro proyecto.

## Qué se guarda y dónde

| Dato                                     | Destino                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| Número completo, CVV/CVC, PIN            | Nunca en nuestro backend, base de datos o almacenamiento del navegador   |
| Nombre, email y teléfono                 | customers; datos personales necesarios para la compra                    |
| Dirección y destinatario                 | deliveries; se accede solo dentro de la sesión propietaria               |
| Producto, importes, estado y referencias | transactions                                                             |
| Credencial de checkout                   | Cookie HttpOnly de una hora; solo su hash SHA-256 se guarda en customers |
| Clave privada y secretos Wompi           | Futuro runtime backend, nunca frontend ni Git                            |

En producción exigiremos HTTPS. La cookie es Secure y SameSite=None para permitir
frontend y API en sitios distintos; por ello cada POST exige X-Checkout-Request: 1,
que fuerza preflight CORS desde otro origen. CORS permite exclusivamente el frontend
configurado y credenciales; Swagger funciona desde el mismo origen de la API.
En local usa datos ficticios: la cookie usa SameSite=Lax y HTTP. Usar siempre el mismo hostname
(localhost o 127.0.0.1), no mezclarlos entre llamadas.

HttpOnly impide leer la cookie desde JavaScript, pero no evita que un XSS ejecute
peticiones como el usuario. Un UUID tampoco autoriza: sesión válida y propiedad
se comprueban en el backend para entregas y transacciones. No devolvemos direcciones
ni contacto en la respuesta de estado. Las respuestas de /api usan Cache-Control: no-store
para no conservar estados o credenciales en cachés. No pongas la cookie en Redux o localStorage.
La sesión expira al cabo de una hora: esta etapa aún no implementa recuperación
tras su vencimiento ni autenticación por email.

## Stock, duplicados y aprobación

El backend recalcula precio y tarifas. expectedTotalMinor solo permite detectar que
el total mostrado cambió; jamás reemplaza al precio del servidor. Idempotency-Key
se vincula a la sesión y a una huella del contenido, y la reserva se hace dentro de
una transacción PostgreSQL con bloqueos. Una solicitud repetida no reserva dos veces.

La reserva vence en 15 minutos. Su liberación es perezosa al cotizar, crear o consultar
una transacción del producto. Solo se libera si payment_started_at sigue vacío.
El futuro módulo de pagos deberá marcar ese campo **antes** de llamar al proveedor.
Un timeout después de enviar un pago nunca permite liberar por tiempo solamente.
La confirmación y el descuento definitivo de stock siguen pendientes de integrar.

## Controles verificables de esta etapa

Pruebas de propiedades de tarjeta rechazadas, errores sin eco del cuerpo, cookie
HttpOnly, acceso entre sesiones denegado, importes alterados, repetición de solicitudes,
rollback y concurrencia de reservas. Los resultados medidos se documentarán al cerrar
la etapa; los flujos Wompi aún no están verificados.

Las llaves de Sandbox son distintas de las de producción; usaremos solo Sandbox,
incluso cuando la aplicación esté publicada en AWS.
[Ambientes y llaves](https://docs.wompi.co/docs/colombia/ambientes-y-llaves/).

## Producción y cookies entre sitios

Aunque se configure SameSite=None y Secure, algunos navegadores bloquean cookies de
terceros. Para AWS se propone /api/* en la misma distribución CloudFront del frontend,
con origen API Gateway, cookies/cabeceras reenviadas y caché desactivada para checkout.
Se evaluará y probará durante despliegue; no añade otra copia completa de infraestructura.
