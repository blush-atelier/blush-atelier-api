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
7. En **Mi pedido**, consulta una referencia `BA-UUID` de la sesión activa. No debe
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
ni localStorage. La sesión invitada dura una hora; no existe recuperación después de
vencer ni una cuenta con historial de todas las compras.

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

| Caso                                                              | Tipo                         | Resultado esperado                                                         |
| ----------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| Datos vacíos, Luhn inválido, fecha vencida o CVC incompleto       | Manual / Jest                | Error claro; sin crear transacción ni cobrar                               |
| Resumen y edición de entrega                                      | Manual / Jest                | Datos primero, totales de API y tarjeta después                            |
| Aprobación / rechazo                                              | Manual Sandbox / integración | Estado verificado y stock según tabla                                      |
| Doble clic o misma solicitud concurrente                          | Manual / PostgreSQL          | Un cargo y un movimiento de stock por pedido                               |
| F5 antes de pagar y durante el envío                              | Manual / Jest                | Recupera referencias; pide tarjeta si no se envió, consulta si ya se envió |
| Corte de red / timeout                                            | Manual / mocks               | No inventa aprobación/rechazo ni inicia otra compra automáticamente        |
| Precio alterado, cantidad excesiva o carrito parcialmente agotado | HTTP / PostgreSQL            | Error controlado; sin reserva parcial ni cobro                             |
| Compradores compitiendo por últimas unidades                      | PostgreSQL                   | Sin sobreventa ni stock negativo                                           |
| Pedido ajeno / sesión vencida / referencia inválida               | Manual / HTTP / Jest         | Rechazo seguro sin exponer datos de otro cliente                           |
| Webhook falso o duplicado                                         | HTTP / PostgreSQL            | Firma inválida rechazada; duplicado no descuenta otra vez                  |
| Volver después de APPROVED                                        | Manual / Jest                | Consulta del pedido; sin banner de selección pendiente                     |
| 320–1920 px, teclado y movimiento reducido                        | Manual pendiente             | Modal, avisos, menús y botones accesibles sin recortes                     |

Prueba los nueve viewports: 320×568, 375×667, 390×844, 430×932, 768×1024, 1024×768,
1280×800, 1440×900 y 1920×1080. La versión actual **no tiene validación visual**:
la herramienta bloqueó iniciar Chrome. Jest no sustituye esta revisión.

Para eventos reales hace falta configurar un webhook HTTPS público que llegue a
`/api/payments/wompi/events`; localhost no sirve. Una respuesta perdida sin ID del
proveedor necesita reconciliación por webhook. No repitas cargos a ciegas.

[Resultados medidos y límites](verification.md) · [Comandos de integración](development.md#pruebas-de-integración).
