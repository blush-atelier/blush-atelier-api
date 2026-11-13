# Diccionario de datos

## Estado de implementación

`erd.mmd` refleja las dos migraciones implementadas: products, customers, deliveries
y transactions. payment_attempts y webhook_events siguen como diseño futuro en
checkout-model.mmd; el módulo de pago aún no existe.

## Products (implementada)

| Campo          | Tipo PostgreSQL | Restricción / significado                             |
| -------------- | --------------- | ----------------------------------------------------- |
| id             | UUID            | PK, asignado explícitamente; seed con UUID v4 estable |
| sku            | VARCHAR(80)     | único, obligatorio y no vacío; índice único           |
| name           | VARCHAR(180)    | Obligatorio y no vacío                                |
| description    | TEXT            | Obligatorio                                           |
| image_url      | TEXT            | Nullable; el frontend debe mostrar fallback           |
| price_minor    | BIGINT          | Centavos COP, entero >= 0                             |
| currency       | CHAR(3)         | CHECK: COP                                            |
| stock_on_hand  | INTEGER         | Existencias físicas >= 0                              |
| stock_reserved | INTEGER         | Default 0; entre 0 y stock_on_hand                    |
| created_at     | TIMESTAMPTZ     | Default now()                                         |
| updated_at     | TIMESTAMPTZ     | Default now(); TypeORM actualiza al guardar           |

El índice de la PK sirve para consultar por ID; el de SKU evita duplicados y ordena
el catálogo. Disponibilidad = stock_on_hand - stock_reserved. Las escrituras SQL
futuras deberán actualizar updated_at explícitamente. No se usa synchronize.

## Conversión monetaria sin pérdida de precisión

- PostgreSQL guarda BIGINT; su driver devuelve string.
- El mapper convierte con `BigInt(row.priceMinor)`; el dominio calcula con bigint.
- La API devuelve `priceMinor` como string decimal, por ejemplo `"8990000"`:
  representa **89.900,00 COP**, no 8.990.000 pesos.
- Para COP la escala acordada es 100: pesos enteros × 100n = centavos.
- Para mostrar decimales se separan cociente y resto: `minor / 100n` y
  `minor % 100n`; no se convierte todo el importe a Number.
- Para aceptar pesos con fracción, se validará una cadena con máximo dos decimales
  y se construirá el entero por concatenación/relleno; no usar parseFloat × 100.
- Límite PostgreSQL: 9.223.372.036.854.775.807 centavos. Las futuras sumas y
  multiplicaciones también deberán validar ese límite antes de persistir.
- Al integrar Wompi, si su contrato requiere un número JSON, se verificará primero
  `amount <= BigInt(Number.MAX_SAFE_INTEGER)` y los límites propios del proveedor;
  un importe fuera de rango se rechazará, nunca se redondeará.

## Clientes, entregas y transacciones (implementadas)

Todas las PK son UUID. Todas las FK tienen índices apropiados y borrado RESTRICT para conservar
la trazabilidad. created_at/updated_at son TIMESTAMPTZ obligatorios con default now().

| Tabla                     | Campos y restricciones previstas                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| customers                 | id PK; full_name VARCHAR(120), email normalizado VARCHAR(254) y phone VARCHAR(16) obligatorios; session_hash CHAR(64) único (SHA-256 de una credencial aleatoria de 256 bits); session_expires_at TIMESTAMPTZ; created_at, updated_at. Email no se impone como único para permitir checkout invitado.                                                                                                  |
| deliveries                | id PK; customer_id FK; recipient_name, recipient_phone, address_line, city, region, country_code obligatorios; status CHECK (PENDING, READY); created_at, updated_at. Dirección inmutable de esa compra.                                                                                                                                                                                               |
| transactions              | id PK; reference única; UNIQUE(customer_id, idempotency_key); request_hash obligatorio; product_id/customer_id FK; delivery_id FK única; quantity INTEGER > 0; unit_price_minor, product_amount_minor, base_fee_minor, delivery_fee_minor, total_minor BIGINT >= 0; currency COP; status; reservation_status; reservation_expires_at; payment_started_at TIMESTAMPTZ nullable; created_at, updated_at. |
| payment_attempts (futura) | id PK; transaction_id FK; provider_reference única; provider_transaction_id nullable y único; status CHECK (CREATED, PENDING, APPROVED, DECLINED, ERROR, UNKNOWN); created_at, updated_at. índice único parcial de intento activo por transacción.                                                                                                                                                     |
| webhook_events (futura)   | id PK; payment_attempt_id FK; deduplication_key única; event_type, processing_status CHECK (RECEIVED, PROCESSED), received_at; processed_at nullable. No guardar payload completo ni datos de tarjeta.                                                                                                                                                                                                 |

Transacciones: status CHECK (PENDING, APPROVED, DECLINED, ERROR, EXPIRED) y
reservation_status CHECK (ACTIVE, CONFIRMED, RELEASED). Un índice sobre
(status, reservation_expires_at) permitirá reconciliar pendientes. CHECK de importes:
`product_amount_minor = unit_price_minor × quantity` y
`total_minor = product_amount_minor + base_fee_minor + delivery_fee_minor`.
Validar antes de superar BIGINT. La coherencia cliente/entrega está garantizada con
una FK compuesta (delivery_id, customer_id).

## Relaciones e idempotencia

Un cliente puede tener varias compras; cada compra tiene un producto y una entrega
única. Una transacción puede registrar varios intentos históricos, pero solo uno
activo. Los eventos autentificados de un intento se deduplican en la base de datos.
La clave exacta del evento se decidirá contra la documentación oficial de Wompi.
Reutilizar una clave de solicitud con otro contenido producirá conflicto.

## Reserva de stock

Dentro de una transacción SQL: actualizar stock_reserved solo si la disponibilidad
alcanza y crear PENDING. Una aprobación verificada disminuye stock_on_hand y
stock_reserved en la misma transacción; un rechazo definitivo solo libera la reserva.
Las transiciones condicionales impiden ejecutar estos efectos dos veces.
No mantener bloqueos PostgreSQL mientras se llama a Wompi. Un timeout queda pendiente:
se consulta al proveedor antes de reintentar o liberar. Un vencimiento por sí solo no
permite liberar stock cuando el pago puede haberse aprobado.

## Decisiones de esta etapa

- La sesión propietaria se acredita con cookie HttpOnly de una hora; no con el UUID del cliente.
- Las entregas se crean usando el cliente autenticado, no un customerId enviado en JSON.
- El mismo Idempotency-Key solo es único dentro de su cliente. El request_hash detecta contenido distinto.
- UNIQUE(delivery_id) impide asignar una entrega a dos transacciones; tras expirar una compra,
  una compra nueva requiere otra entrega (puede tener la misma dirección).
- Los bloqueos siguen el orden solicitud → producto → entrega. La reserva usa además UPDATE condicional.
- La caducidad es perezosa en cotizar/crear/consultar, no un cron. Solo libera PENDING/ACTIVE
  con payment_started_at NULL y fecha vencida. El módulo de pagos deberá marcar el inicio
  antes de la llamada externa y luego implementar reconciliación, confirmación y liberación verificadas.
- La transacción guarda snapshots monetarios; los cambios posteriores del catálogo no cambian esos importes.
- El precio esperado del cliente solo se compara con el total recalculado para pedir nueva confirmación.
