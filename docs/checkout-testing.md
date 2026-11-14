# Probar checkout, pagos y stock

## Arranque local

Con `.env` completo y Wompi Sandbox configurado según README:

```bash
docker compose up -d db
NODE_ENV=development POSTGRES_SSL=false npm run local:migrate
NODE_ENV=development POSTGRES_SSL=false npm run local:seed
NODE_ENV=development POSTGRES_SSL=false npm run local:dev
```

Conserva la API que ya esté iniciada; no arranques otra en el mismo puerto.
Frontend: `npm run dev` en `blush-atelier-web`, http://localhost:5173.
Swagger: http://localhost:3000/docs. Usa siempre `localhost` y el mismo navegador.

## Prueba completa desde la tienda

1. Anota `availableStock` con GET `/api/products/{productId}`.
2. Agrega uno o varios productos; revisa cantidades en el carrito.
3. **Pagar con tarjeta de crédito** abre **01 Tus datos**. Completa contacto y
   entrega; Departamento habilita Ciudad. Pulsa **Completar pago**.
4. **02 Resumen y tarjeta** muestra productos, tarifa base y envío en el Backdrop.
   Completa tarjeta, cuotas y las dos aceptaciones de Wompi. El logo aparece dentro
   del campo de número al reconocer Visa/Mastercard.
5. **Registrar pago** tokeniza directamente con Wompi, crea PENDING antes del cargo
   y activa **03 Procesando pago**. Este paso es de UI: en la BD sigue PENDING hasta
   obtener un resultado verificado.
6. Comprueba resultado y referencia. Vuelve a **Tienda** o entra al producto desde
   su nombre en el pedido para consultar stock actualizado.
7. El resultado se consulta automáticamente cada 2,5 segundos mientras PENDING está
   visible, también fuera de la pantalla del pedido, y al reconectar/recuperar foco.
   No necesitas pulsar Actualizar.
8. En **Mi pedido**, consulta una referencia `BA-UUID` de la sesión activa. No debe
   cambiar el carrito ni revelar pedidos de otra sesión. Un pedido registrado ofrece
   consultar estado; no muestra «Tu selección sigue aquí» como carrito pendiente.

Datos exclusivamente de Sandbox, comprobados en UAT mediante adaptadores y API local:

| Resultado | Número              | Titular    | Vencimiento | CVC | Cuotas |
| --------- | ------------------- | ---------- | ----------- | --- | ------ |
| APPROVED  | 4242 4242 4242 4242 | Ana Prueba | 12/30       | 123 | 1      |
| DECLINED  | 4111 1111 1111 1111 | Ana Prueba | 12/30       | 123 | 1      |

[Fuente oficial](https://docs.wompi.co/docs/colombia/datos-de-prueba-en-sandbox/).
No uses tarjetas reales. No hay un tercer número confirmado para ERROR en UAT:
las otras tarjetas probadas fueron rechazadas al tokenizar. ERROR se cubre con mocks.

## Verificar una compra de la UI desde Swagger

**No ejecutes POST /api/customers si ya compraste desde la UI:** reemplazaría la cookie
con otra sesión. Swagger utiliza la cookie HttpOnly existente; no la copies a Authorize
ni localStorage. La sesión invitada dura una hora. Si vence, **Volver a comprar** limpia referencias
antiguas; agrega productos y completa de nuevo tus datos para obtener otra cookie.
Esto no renueva el acceso al pedido anterior ni crea una cuenta con historial.

1. Obtén el UUID de la respuesta POST `/api/transactions` en Network del navegador;
   esa respuesta muestra PENDING antes de enviar el pago. La referencia es `BA-UUID`.
2. GET `/api/transactions/{transactionId}` consulta el estado guardado.
3. POST `/api/transactions/{transactionId}/payment-verification` con cuerpo `{}` y
   cabecera `X-Checkout-Request: 1` consulta Wompi desde el servidor y aplica el resultado.
4. Repite GET de transacción y GET `/api/products/{productId}`.

No existe una operación del comprador para imponer APPROVED. Tampoco envíes tarjeta,
precio o status a la verificación: los campos adicionales se rechazan.

Ejemplo aislado: 10 unidades iniciales, compra de 2, sin otras compras concurrentes:

| Momento          | Stock físico | Reservado | availableStock |
| ---------------- | ------------ | --------- | -------------- |
| Inicial          | 10           | 0         | 10             |
| PENDING          | 10           | 2         | 8              |
| APPROVED         | 8            | 0         | 8              |
| DECLINED / ERROR | 10           | 0         | 10             |

La API pública muestra `availableStock`, no los contadores internos. APPROVED deja
la entrega READY. Un timeout no prueba rechazo: conserva PENDING y reserva hasta
reconciliar. Un pago enviado no se libera automáticamente al cumplir 15 minutos.

## Probar solo la API: preparación manual sin cobro

Hazlo en una sesión de prueba separada de tu compra de UI. En cada POST del comprador
usa `X-Checkout-Request: 1`.

1. POST `/api/customers`: `{"fullName":"Ana Prueba","email":"ana@example.com","phone":"+573001234567"}`.
   Devuelve 201 y crea la cookie HttpOnly.
2. POST `/api/deliveries`:

```json
{
  "recipientName": "Ana Prueba",
  "recipientPhone": "+573001234567",
  "addressLine": "Calle 10 # 20-30",
  "city": "Bogotá",
  "region": "Bogotá D.C.",
  "countryCode": "CO"
}
```

3. Copia el UUID de entrega y usa un producto real de GET `/api/products` en
   POST `/api/checkout/quote`:

```json
{
  "productId": "11111111-1111-4111-8111-111111111111",
  "quantity": 1,
  "deliveryId": "REEMPLAZAR_POR_UUID_DE_ENTREGA"
}
```

4. POST `/api/transactions` con el mismo cuerpo más `expectedTotalMinor` tomado de
   `totalMinor` de la cotización. Agrega `Idempotency-Key: checkout-request-0001`.
   Usa una clave nueva para cada compra independiente, pero la misma en sus reintentos.
5. La respuesta 201 es PENDING. Cotizar no reserva; crear PENDING sí. Repetir clave y
   contenido devuelve el mismo pedido; cambiar contenido con esa clave falla.

Para varias líneas agrega `items: [{productId, quantity}, ...]` y conserva productId/
quantity de la primera línea. Las tarifas se cobran una vez; falta de stock en una
línea revierte toda la reserva. Una entrega solo se usa en una transacción.

El cargo usa POST `/api/transactions/{id}/payments`: recibe únicamente token,
cuotas y aceptaciones. Prueba la captura desde la UI; no introduzcas PAN/CVC en Swagger.
La ruta anterior `payment-session` es de compatibilidad; no mezcles ambos flujos para
un pedido que ya inició el pago.

## Casos de fuego

| Caso                                                                          | Tipo                         | Resultado esperado                                                         |
| ----------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| Datos vacíos, Luhn inválido, titular numérico, fecha vencida o CVC incompleto | Manual / Jest                | Error claro; sin crear transacción ni cobrar                               |
| Resumen y edición de entrega                                                  | Manual / Jest                | Datos primero, totales de API y tarjeta después                            |
| Aprobación / rechazo                                                          | Manual Sandbox / integración | Estado verificado y stock según tabla                                      |
| Doble clic o misma solicitud concurrente                                      | Manual / PostgreSQL          | Un cargo y un movimiento de stock por pedido                               |
| F5 antes de pagar y durante el envío                                          | Manual / Jest                | Recupera referencias; pide tarjeta si no se envió, consulta si ya se envió |
| Corte de red / timeout                                                        | Manual / mocks               | No inventa aprobación/rechazo ni inicia otra compra automáticamente        |
| Precio alterado, cantidad excesiva o carrito parcialmente agotado             | HTTP / PostgreSQL            | Error controlado; sin reserva parcial ni cobro                             |
| Compradores compitiendo por últimas unidades                                  | PostgreSQL                   | Sin sobreventa ni stock negativo                                           |
| Pedido ajeno / sesión vencida / referencia inválida                           | Manual / HTTP / Jest         | Rechazo seguro sin exponer datos de otro cliente                           |
| Webhook falso o duplicado                                                     | HTTP / PostgreSQL            | Firma inválida rechazada; duplicado no descuenta otra vez                  |
| Volver después de APPROVED                                                    | Manual / Jest                | Consulta del pedido; sin banner de selección pendiente                     |
| 320–1920 px, teclado y movimiento reducido                                    | Manual pendiente             | Modal, avisos, menús y botones accesibles sin recortes                     |

Prueba los nueve viewports: 320×568, 375×667, 390×844, 430×932, 768×1024, 1024×768,
1280×800, 1440×900 y 1920×1080. La versión actual **no tiene validación visual**:
la herramienta bloqueó iniciar Chrome. Jest no sustituye esta revisión.

Para eventos reales hace falta configurar un webhook HTTPS público que llegue a
`/api/payments/wompi/events`; localhost no sirve. Una respuesta perdida sin ID del
proveedor necesita reconciliación por webhook. No repitas cargos a ciegas.

[Resultados medidos y límites](verification.md) · [Comandos de integración](development.md#pruebas-de-integración).

## Repetición después de la revisión manual del 14/11/2026

La usuaria confirmó sesión vencida, aprobación, rechazo, F5/desconexión y bloqueo de
duplicados/cantidades. Repetir solo los hallazgos corregidos, además de la revisión visual pendiente:

1. En titular, escribe/pega `Ana123 María456`: el campo debe quedar `Ana María`.
   Números solos no forman un titular válido. Acentos, espacios, apóstrofe y guion son válidos.
2. Durante PENDING observa varios ciclos automáticos: botones, textos y posiciones
   permanecen estables. Solo cambia el resultado al confirmarlo el backend.
3. Al recuperar un PENDING aún no enviado, el resumen/tarjeta no debe cerrarse ni
   borrar lo escrito por una consulta automática. No repetir cargos para probarlo.

Jest comprueba titular inválido antes de tokenizar, nombres Unicode, identidad de los
nodos de botones y conservación del paso de edición. La consulta de fondo usa su propio
indicador y no alterna la fase visual entre idle/resuming.

## Webhook: QA automatizado sin pagos ni RDS

`test/webhook-http.spec.ts` comprueba checksum/ambiente inválidos (401 y sin
consulta al proveedor), APPROVED, DECLINED, PENDING, duplicados, pedido ajeno,
fallo de almacenamiento (503), reintento y ausencia de datos sensibles en logs.
Se usan el verificador real y un proveedor simulado. Ejecuta:

```bash
npm run test:cov
```

`test/integration/payments.spec.ts` verifica además en PostgreSQL que eventos
concurrentes no descuentan dos veces, que rechazo conserva stock físico y que
un fallo al guardar la entrega revierte transacción y stock juntos. El fallo se
inyecta con un trigger **solo dentro de la base desechable de pruebas**.

Para aislar completamente la integración de un `.env` que apunte a RDS, en WSL
con Docker local crea este contenedor nuevo (contraseña ficticia solo para QA):

```bash
qa_container=$(docker run -d --rm \
  -e POSTGRES_DB=blush_webhook_test -e POSTGRES_USER=qa_local \
  -e POSTGRES_PASSWORD=qa_disposable_only postgres:17-bookworm)
# Espera a que este comando indique "accepting connections".
docker exec "$qa_container" pg_isready -U qa_local -d blush_webhook_test
qa_host=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$qa_container")
NODE_ENV=test WOMPI_ENABLED=false FRONTEND_ORIGIN=http://localhost:5173 \
POSTGRES_HOST="$qa_host" POSTGRES_PORT=5432 POSTGRES_SSL=false \
POSTGRES_DB=blush_webhook_test POSTGRES_USER=qa_local \
POSTGRES_PASSWORD=qa_disposable_only BASE_FEE_MINOR=500000 DELIVERY_FEE_MINOR=1000000 \
npm run test:integration
# Detiene y elimina exclusivamente el contenedor creado arriba.
docker stop "$qa_container"
```

Este ejemplo usa la IP del contenedor de Docker local en WSL. No lo sustituyas
por un host RDS ni uses las credenciales de producción. No se envían cargos:
las dependencias de Wompi se reemplazan por dobles en la integración.

## Consultar el resultado en PostgreSQL

En una sesión `psql` conectada a la base que quieras inspeccionar, usa un usuario
de lectura y la referencia de un pedido existente. Estas consultas no modifican datos:

```sql
\set reference 'BA-UUID-DEL-PEDIDO'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT t.reference, t.status, t.reservation_status, t.provider_payment_id,
       t.payment_submitted_at, d.status AS delivery_status
FROM transactions t JOIN deliveries d ON d.id = t.delivery_id
WHERE t.reference = :'reference';

SELECT p.id, i.quantity, p.stock_on_hand, p.stock_reserved,
       p.stock_on_hand - p.stock_reserved AS available_stock
FROM transactions t
JOIN transaction_items i ON i.transaction_id = t.id
JOIN products p ON p.id = i.product_id
WHERE t.reference = :'reference';
COMMIT;
```

| Resultado                              | Transacción / reserva | Entrega     | Stock físico de un pedido de 2 unidades, partiendo de 20 |
| -------------------------------------- | --------------------- | ----------- | -------------------------------------------------------- |
| Antes del resultado                    | PENDING / ACTIVE      | PENDING     | 20, con 2 reservadas                                     |
| Aprobado                               | APPROVED / CONFIRMED  | READY       | 18, reserva liberada                                     |
| Rechazado                              | DECLINED / RELEASED   | PENDING     | 20, reserva liberada                                     |
| Firma inválida o fallo de persistencia | Sin cambios           | Sin cambios | Sin cambios                                              |
| Evento final duplicado                 | Sin cambios           | Sin cambios | No vuelve a descontar                                    |

Los contadores de producto incluyen otros pedidos; compara capturas antes/después
en una base aislada. Un 503 de persistencia permite reintentar el mismo evento;
no se devuelve 200 hasta confirmar el commit. Wompi reintenta notificaciones que
no reciban 200 según su [documentación de eventos](https://docs.wompi.co/docs/colombia/eventos/).

## Observar el webhook

Los logs de `WompiEventsController` contienen mensajes JSON con `event`,
`correlationId`, `durationMs` y `outcome` o `code`. Busca `wompi.webhook.received`,
`wompi.webhook.processed`, `wompi.webhook.rejected` o `wompi.webhook.failed` en
la salida de Docker o en tu recolector de logs. `outcome` distingue `confirmed`,
`released`, `pending`, `duplicate` e `ignored`. Solo se anuncia éxito tras el commit.
No se registra body, checksum, identificador del proveedor, tarjeta, contacto ni secretos.
Cada recepción genera su propia correlación; no se usa un valor enviado por el cliente.

Los duplicados se reconocen por estado final e identidad verificada bajo bloqueo:
se consulta nuevamente Wompi para reconciliar su estado actual, pero no se repiten
las escrituras. No existe una tabla adicional de eventos ni cambia el esquema.
La llegada de un webhook real a AWS y el destino de logs en AWS requieren validación
operativa aparte; estas pruebas locales no los acreditan.

## Replay firmado sin dashboard

El endpoint público es
`https://dviblid28pd4o.cloudfront.net/api/payments/wompi/events`.
Se comprobó que un cuerpo vacío devuelve **401 InvalidWebhook**, sin cookie ni
`X-Checkout-Request`. Esto acredita enrutamiento/rechazo, no recepción de Wompi.

Puedes probar el receptor usando el identificador Wompi de un pago Sandbox existente
(`provider_payment_id`, no el UUID interno ni la referencia BA-UUID). No necesitas
crear otra compra. Desde el backend con sus variables Sandbox en `.env`:

```bash
npm run build
# Solo valida configuracion y muestra el plan; no hace red ni cambia datos.
node --env-file=.env scripts/replay-wompi-event.cjs \
  --transaction ID_WOMPI_EXISTENTE \
  --url https://dviblid28pd4o.cloudfront.net/api/payments/wompi/events
```

**Después de autorizar expresamente la reconciliación del pedido**, ejecuta el mismo
comando con `--send`. Consulta únicamente el pago existente en Wompi, construye el
checksum con el secreto de eventos y envía el evento a tu API. Nunca crea cargos.
La API vuelve a consultar Wompi: no confía en el estado que propone el script.
No imprime el secreto, firma ni datos del pedido; solo modo y HTTP obtenido.

Espera **200**, consulta SQL de lectura antes/después y revisa los logs. Si el
seguimiento automático ya confirmó el pago, el replay será `duplicate`: es correcto
y no debe volver a descontar stock. Un 401 indica revisar ambiente/secreto coincidente;
un 503 indica revisar disponibilidad del proveedor o persistencia. No cambies el
estado manualmente en SQL para forzar la prueba. Las pruebas aisladas cubren además
la transición inicial y el rollback sin modificar RDS.

Este es un evento generado por nuestra herramienta, **no un evento emitido por Wompi**.
La documentación oficial indica configurar la URL de eventos en el dashboard; sin
acceso no podemos confirmar esa suscripción ni sustituirla inventando un endpoint de
configuración. Solicita al responsable del comercio que registre la URL y facilite
un evento real. El checkout ya consulta el estado por API privada, por lo que su
confirmación normal no depende de recibir el webhook.
