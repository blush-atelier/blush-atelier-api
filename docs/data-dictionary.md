# Diccionario de datos implementado

Las cinco migraciones crean cinco tablas, representadas en [erd.mmd](erd.mmd) y
[erd.svg](erd.svg). No existen tablas payment_attempts ni webhook_events: la trazabilidad
actual de pago está en transactions y el webhook se aplica idempotentemente sobre ella.

| Tabla             | Responsabilidad y campos principales                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| products          | UUID PK; SKU único; nombre, descripción e imagen; price_minor BIGINT y currency CHAR(3) COP; stock_on_hand y stock_reserved INTEGER; timestamps                                                                                                   |
| customers         | UUID PK; full_name VARCHAR(120), email VARCHAR(254), phone VARCHAR(16); session_hash CHAR(64) único y session_expires_at TIMESTAMPTZ; timestamps. Email no es único en checkout invitado                                                          |
| deliveries        | UUID PK; customer_id FK; destinatario y teléfono; address_line VARCHAR(250), city/region VARCHAR(100), country_code CHAR(2) CO; status PENDING/READY; timestamps                                                                                  |
| transactions      | UUID PK; reference única; UNIQUE(customer_id,idempotency_key); request_hash CHAR(64); customer_id/product_id FK y delivery_id FK única; cantidad y precios de primera línea compatibles; totales BIGINT; moneda, estados y fechas de reserva/pago |
| transaction_items | PK compuesta (transaction_id,product_id), ambas FK; quantity INTEGER; unit_price_minor y product_amount_minor BIGINT; created_at                                                                                                                  |

## Relaciones y restricciones

- Cliente → muchas entregas y transacciones. Una entrega corresponde como máximo a
  una transacción; la FK compuesta (delivery_id,customer_id) impide usar entregas ajenas.
- Una transacción contiene una o más líneas. Cada producto puede aparecer en muchas
  líneas. Cabecera product_id/quantity/unit_price_minor conserva la primera línea para
  compatibilidad; la fuente completa del carrito es transaction_items.
- Cantidades >0, stock físico >=0 y 0 <= reservado <= físico. Disponible = físico − reservado.
- Cada subtotal = precio unitario × cantidad. Total = suma de líneas + base + envío.
  La base es siempre positiva; envío >=0. Se valida el límite BIGINT antes de persistir.
- Estado/reserva: PENDING/ACTIVE, APPROVED/CONFIRMED o DECLINED/ERROR/EXPIRED con RELEASED.
- provider_payment_id es nullable y único; provider_payment_status conserva el resultado.
  payment_started_at/payment_expires_at permiten compatibilidad con el flujo anterior.
  payment_submitted_at nullable registra el claim antes del POST y requiere payment_started_at.
- Índices y claves protegen búsquedas por dueño, producto, idempotencia y reservas pendientes.
  Borrados de relaciones usan RESTRICT para preservar trazabilidad; no se usa synchronize.

## Importes exactos

PostgreSQL guarda BIGINT; el driver devuelve string. Dominio usa bigint y JSON strings:
`"8990000"` son 89.900,00 COP. Pesos enteros × 100n = centavos. Formato monetario separa
cociente y resto, sin parseFloat ni convertir cantidades grandes a Number.
Límite PostgreSQL: 9.223.372.036.854.775.807 centavos. Para el JSON numérico de Wompi se
comprueba `amount <= BigInt(Number.MAX_SAFE_INTEGER)`; fuera de rango se rechaza sin redondeo.

## Consistencia de stock y privacidad

Reserva, confirmación/liberación y entrega usan transacciones y un advisory lock común.
La red Wompi queda fuera del bloqueo. Aprobación descuenta físico y reservado; rechazo
libera solo reservado; duplicados no repiten efectos. Intentos enviados no se liberan
por tiempo sin resultado verificable.
Contacto y dirección son datos personales de compra. No se almacena PAN/CVC, JWE ni
token de tarjeta. La cookie es aleatoria y HttpOnly; solo su hash SHA-256 se persiste.
