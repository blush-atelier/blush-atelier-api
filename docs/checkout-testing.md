# Probar el checkout pendiente en Swagger

## Arranque local

Con Docker db saludable y .env ya completo:

```bash
npm run local:migrate
npm run local:seed
npm run local:dev
```

Abre http://localhost:3000/docs (o 127.0.0.1, conservando ese mismo hostname para todo).
Si ya hay una API ejecutándose en 3000, detén ese proceso antes de arrancar otro.
Los comandos local:* están pensados para Docker Engine/Snap dentro de WSL; en una
instalación que permita conectar a POSTGRES_HOST/POSTGRES_PORT de .env también puedes
usar los comandos migration:run, seed y start:dev originales.

En todos los POST completa X-Checkout-Request con `1`. Es una protección frente a
peticiones de otros sitios, no una contraseña. La cookie se recibe automáticamente
en el navegador; no la copies en la ventana Authorize ni en localStorage.

## 1. Crear comprador

POST /api/customers:

```json
{
  "fullName": "Ana Prueba",
  "email": "ana@example.com",
  "phone": "+573001234567"
}
```

Respuesta 201 con id. El navegador guarda checkout_session como HttpOnly durante una hora.
Registrar otro comprador reemplaza la sesión actual; no podrás consultar la compra del anterior.

## 2. Crear entrega

POST /api/deliveries:

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

Respuesta 201 con id. Copia ese id como deliveryId para los próximos pasos.
No se recibe customerId: el backend lo obtiene de la sesión.

## 3. Cotizar

POST /api/checkout/quote (reemplaza DELIVERY_UUID por el UUID anterior):

```json
{
  "productId": "11111111-1111-4111-8111-111111111111",
  "quantity": 1,
  "deliveryId": "DELIVERY_UUID"
}
```

Respuesta 200 con importes como strings. Con el precio del seed y las tarifas locales
por defecto: producto 89.900 COP + base 5.000 COP + envío 10.000 COP = 104.900 COP;
totalMinor será `"10490000"`. Si cambiaste precio o tarifas, usa el total que realmente recibas.
Cotizar no reserva ni cobra.

Las variables opcionales BASE_FEE_MINOR y DELIVERY_FEE_MINOR controlan las tarifas en
centavos. En local hay valores de demostración; producción exige configuración explícita.
No existe una regla geográfica distinta de envío en esta etapa: se usa tarifa fija para Colombia.

## 4. Crear PENDING

POST /api/transactions. Además de X-Checkout-Request, usa Idempotency-Key:
`checkout-request-0001` (entre 8 y 128 caracteres: letras, números, guion o guion bajo).

```json
{
  "productId": "11111111-1111-4111-8111-111111111111",
  "quantity": 1,
  "deliveryId": "DELIVERY_UUID",
  "expectedTotalMinor": "10490000"
}
```

Respuesta 201 con id, reference, status PENDING, importes y vencimiento de la reserva.
Copia el id. **No significa pago aprobado**: todavía no hay integración de cobro.
Repetir la misma clave y contenido devuelve la misma transacción sin reservar otra vez.
Cambiar contenido con esa clave devuelve 409 IdempotencyConflict.
Una entrega no puede asignarse a dos transacciones; para otra compra crea una nueva entrega.

## 5. Consultar y verificar stock

- GET /api/transactions/{id}: debe devolver PENDING dentro de la misma sesión.
- Refrescar Swagger conserva la cookie; vuelve a consultar el id para reanudar.
- GET /api/products/{productId}: baja availableStock por la reserva, no stock físico.
- Al consultar/cotizar/crear para el producto después de 15 minutos, una reserva sin
  pago iniciado pasa a EXPIRED y se libera una sola vez. No hay cron en esta etapa.

Errores: 400 entrada inválida; 401 sesión ausente/vencida; 404 recurso ajeno o inexistente;
409 stock insuficiente, total cambiado, clave reutilizada o entrega ya usada;
422 importe fuera de rango; 429 límite de peticiones; 503 almacenamiento no disponible.
El código en el JSON distingue cada fallo; los mensajes no muestran datos internos.

## Integración futura con el frontend

Cada llamada del frontend debe enviar la cookie:

```typescript
fetch(`${apiUrl}/api/checkout/quote`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json', 'X-Checkout-Request': '1' },
  body: JSON.stringify({ productId, quantity: 1, deliveryId }),
});
```

Para transactions agrega Idempotency-Key; consérvala por intento lógico para reintentar
tras un fallo de red. Guarda solo IDs, clave de solicitud y pasos seguros; ninguna tarjeta,
cookie, token Wompi o dato personal en Redux persistido/localStorage. Reanuda leyendo el
estado backend. La sesión dura una hora; su recuperación tras vencer aún no está implementada.

En AWS se recomienda enrutar /api/* al API Gateway desde la misma distribución CloudFront
del frontend, reenviando cookie y cabeceras y desactivando caché de las respuestas de checkout.
Así no dependemos de que el navegador permita cookies de terceros. SameSite=None/Secure
por sí solo no garantiza que un navegador acepte cookies entre sitios distintos.
No se ha desplegado ni verificado esa configuración todavía.

Lee [payment-security.md](payment-security.md) antes de implementar el formulario de tarjeta.

## Carrito de varios productos

Los mismos endpoints de cotización y PENDING admiten `items` (1–50 UUID distintos).
Conserva productId y quantity de la primera línea para compatibilidad:

```json
{
  "productId": "11111111-1111-4111-8111-111111111111",
  "quantity": 1,
  "items": [
    { "productId": "11111111-1111-4111-8111-111111111111", "quantity": 1 },
    { "productId": "22222222-2222-4222-8222-222222222222", "quantity": 2 }
  ],
  "deliveryId": "DELIVERY_UUID"
}
```

Para crear la reserva añade expectedTotalMinor de la cotización y la cabecera
Idempotency-Key. No envíes precios por línea: se calculan en servidor. La respuesta
múltiple incluye items con precio unitario y subtotal de cada línea; productAmountMinor
es el agregado y las tarifas se cobran una vez. Cualquier falta de stock revierte
el pedido completo. Un timeout se reintenta con la misma clave y las mismas líneas.
