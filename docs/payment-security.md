# Seguridad de pagos implementada

Solo Wompi Sandbox, incluido UAT. No se hacen pagos con dinero real.

## Recorrido de los datos

1. El comprador completa contacto y entrega; la API registra esos datos personales
   y una sesión de checkout. El resumen contiene importes calculados por el backend.
2. En el modal propio, PAN/CVC existen temporalmente en memoria del formulario.
   `card-tokenization.ts` usa Web Crypto: JWE RSA-OAEP-256 + AES-256-GCM, con la llave
   pública de Wompi y una clave AES/IV nuevos por operación. No se hashea la tarjeta.
3. El navegador envía el JWE **directamente por HTTPS a Wompi**. Nuestra API solo
   entrega la llave pública y las condiciones porque UAT no permite leer la llave por CORS.
4. Wompi devuelve un token. El adaptador lo conserva en un cierre efímero, fuera de
   Redux/localStorage. El cargo se pide después de crear PENDING y obtener su UUID.
5. La API recibe token, cuotas y aceptaciones; firma y envía a Wompi con su llave
   privada. No recibe PAN/CVC en el flujo normal ni guarda el token de tarjeta.
6. Solo una respuesta del proveedor consultada desde servidor o un webhook autenticado
   y corroborado con su API permite actualizar pago, stock y entrega.

Los campos se limpian al iniciar el pago o cerrar el modal. Un token o JWE tampoco
se debe incluir en logs, analítica, reportes de errores o capturas.
Un cliente malicioso puede enviar campos arbitrarios: el servidor rechaza campos
extra con 400, sin persistirlos ni reflejarlos. Eso no impide que los bytes lleguen
al parser HTTP; no equivale a afirmar que una petición arbitraria nunca toca el servidor.

## Qué se guarda

| Dato                                           | Tratamiento                                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| PAN/CVC                                        | Solo memoria temporal del formulario y envío cifrado a Wompi; no Redux, localStorage, DB ni logs de aplicación |
| Token de tarjeta                               | Memoria efímera del adaptador y solicitud de pago; no se persiste                                              |
| Nombre, correo y teléfono                      | `customers`, para la compra                                                                                    |
| Dirección y destinatario                       | `deliveries`, con propiedad comprobada por sesión                                                              |
| Productos, importes, referencia y estados      | `transactions` / `transaction_items`                                                                           |
| Credencial de sesión                           | Cookie HttpOnly de una hora; DB guarda su hash SHA-256, no la credencial                                       |
| Llave privada y secretos de integridad/eventos | Variables del backend; nunca frontend ni Git                                                                   |

La llave pública de comercio y la llave pública de cifrado no son secretos. El token
no sustituye las comprobaciones de propiedad, importe y estado de la compra.

## Sesión y transporte

En local: HTTP de desarrollo, cookie SameSite=Lax; utiliza siempre `localhost`.
Wompi se contacta por HTTPS. En producción el código exige origen frontend HTTPS;
la cookie es Secure, HttpOnly y SameSite=None. **HTTPS desplegado aún no está validado**.
CORS limita el origen; los POST del comprador requieren `X-Checkout-Request: 1`.
El webhook tiene su autenticación propia. `/api` devuelve `Cache-Control: no-store`.

Una referencia/UUID no concede acceso: cada consulta comprueba sesión y propietario.
No se devuelve contacto/dirección en el estado de una transacción. HttpOnly dificulta
leer la cookie desde JavaScript, pero no elimina el riesgo de XSS.

Al expirar la sesión, se detiene la consulta automática. Una nueva selección descarta
referencias locales vencidas y vuelve a registrar al comprador al completar sus datos,
obteniendo una cookie nueva. No se renueva el acceso al pedido anterior ni se libera
su stock desde el navegador. No hay cuenta/historial ni recuperación de la sesión vieja.

## Pago, stock e idempotencia

- Precio, tarifas y stock son autoridad del backend. BIGINT/bigint y strings JSON
  preservan precisión; se comprueba el límite entero seguro antes de JSON numérico Wompi.
- PENDING reserva todas las líneas en una transacción DB. Idempotency-Key y huella
  de contenido reconocen reintentos de la misma compra.
- `payment_submitted_at` se confirma bajo bloqueo antes del POST remoto; una solicitud
  duplicada no hace otro cargo. La red queda fuera de la transacción PostgreSQL.
- Se verifican ID, referencia, importe, moneda y transición. APPROVED confirma stock
  físico y entrega READY; DECLINED/ERROR liberan reserva atómicamente, una sola vez.
- Timeout no significa rechazo. Intentos enviados conservan PENDING/reserva hasta
  reconciliar. Las reservas no iniciadas vencen a los 15 minutos y se liberan perezosamente.
- Webhooks: checksum con comparación constante, consulta privada y aplicación idempotente.
- La UI consulta automáticamente cada 2,5 s mientras está visible y PENDING, y al
  recuperar conexión/foco. Solo consulta; no reenvía cargos ni inventa aprobaciones.

## Evidencia y límites

Jest/HTTP/PostgreSQL comprueban validación sin eco, sesiones ajenas/vencidas y nueva
cookie, importes alterados, duplicados concurrentes, rollback y webhook falso/duplicado.
WEB comprueba JWE interoperable, persistencia segura, recuperación de sesión y seguimiento
automático sin repetir el cargo. [Mediciones](verification.md).

Contra UAT Sandbox, con adaptadores WEB desde Node y API/DB aisladas: tokenización,
APPROVED con descuento y DECLINED con stock físico conservado. No acredita navegador,
ERROR real ni webhook público real. No se realizaron pagos con dinero real.

Pendiente: E2E visual del flujo actual, webhook HTTPS público, AWS, TLS de DB, permisos
mínimos y controles distribuidos. Rate limiting actual es por proceso; no sustituye
controles de API Gateway/WAF. Tokenizar/cifrar no reemplaza TLS ni certifica PCI u OWASP.
Para AWS se debe validar enrutamiento `/api` y cookies; SameSite=None no garantiza
que todos los navegadores permitan cookies entre sitios distintos.

Fuentes oficiales: [tarjetas/JWE](https://docs.wompi.co/docs/colombia/metodos-de-pago/),
[aceptaciones](https://docs.wompi.co/docs/colombia/tokens-de-aceptacion/) y
[eventos](https://docs.wompi.co/docs/colombia/eventos/).
