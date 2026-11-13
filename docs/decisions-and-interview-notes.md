# Decisiones y notas para entrevista

## Alcance de esta etapa

Productos, clientes, entregas y transacciones PENDING están implementados. El pago
Wompi conserva su diseño, sin módulo simulado ni cobros.
No se añadieron Strategy, CQRS, buses de eventos ni otras abstracciones innecesarias.

## Dominio Product

Representa un producto válido. Verifica precio entero no negativo y reservas dentro
de las existencias; calcula disponibilidad. No conoce HTTP, NestJS ni PostgreSQL.
Pregunta: ¿por qué validar también en la base? Porque escrituras fuera del dominio
no deben romper las invariantes. El dominio usa Result para rechazar datos inválidos.

## Casos de uso ListProducts y GetProduct

Reciben un ProductRepository, piden datos y devuelven Result con una vista segura.
GetProduct distingue producto inexistente de almacenamiento no disponible.
Pregunta: ¿por qué no devolver null para cualquier fallo? Se perdería la diferencia
entre una consulta válida sin resultado y una caída de infraestructura.

## Puerto y adaptador

ProductRepository define qué necesita la aplicación. TypeOrmProductRepository lo
implementa y convierte entidades ORM a Product campo por campo, sin copiar metadatos; transforma errores del driver en un
fallo controlado y registra un diagnóstico fijo sin consultas ni credenciales.
Pregunta: ¿cómo cambiarías PostgreSQL? Implementando el mismo puerto y cambiando el
binding del módulo; los casos de uso no cambian.

## NestJS y dependencias

ProductsModule conecta PRODUCT_REPOSITORY al adaptador y construye casos de uso con
fábricas. Los decoradores NestJS quedan en infraestructura. ProductsController valida
UUID y traduce Result a HTTP 200, 404 o 503; UUID inválido da 400.
Flujo: HTTP → controlador → caso de uso → puerto → adaptador → PostgreSQL → Product
→ vista con centavos string → HTTP. Swagger está disponible localmente en /docs.

## Migraciones y seed

La migración crea el esquema de productos con restricciones. Su down elimina la tabla:
solo se usa de forma consciente, nunca para deshacer datos reales automáticamente.
El seed usa parámetros y UUID/SKU estables. ON CONFLICT DO NOTHING evita reiniciar
stock al repetirlo. No se ejecuta automáticamente al arrancar el servidor.

## Dinero

BIGINT en PostgreSQL → string del driver → bigint en dominio → string JSON.
Number puede perder precisión por encima de 2^53 - 1; bigint permite cálculos enteros
exactos. JSON.stringify no admite bigint, por eso el mapper produce una cadena.
Ver conversiones y límites en data-dictionary.md.

## Stock y pagos (siguiente etapa)

Una reserva evita vender la misma unidad simultáneamente. El stock final solo se
modifica al confirmar el pago desde el servidor. La idempotencia hace que reintentar
una petición o recibir dos webhooks no duplique el cobro ni el descuento de stock.
Un timeout no prueba rechazo: requiere reconciliación con Wompi Sandbox.
No se almacenarán PAN/CVV; los detalles de tokenización y autenticidad del webhook se
verificarán contra documentación oficial antes de implementar el adaptador.

## Entornos y promoción

feature/* → development → staging → production, siempre por PR y CI aprobado.
Development es local. Staging valida el candidato con PostgreSQL efímero en CI y
pruebas manuales locales mientras se evalúan costos; no implica un despliegue staging
persistente. Production será la entrega AWS. Todos usarán Wompi Sandbox.
No hay CD ni infraestructura AWS creados. Antes se requieren presupuesto, costos,
red privada de PostgreSQL, OIDC restringido a production y una verificación de salud.
Ver pipeline.md para promoción, rollback y configuración pendiente en GitHub.

## Registrar cliente y sesión

RegisterCustomer normaliza contacto y usa un puerto para UUID, reloj y aleatoriedad.
La credencial se envía solo en cookie HttpOnly; el repositorio guarda su hash y fecha
límite. AuthenticateCheckout encuentra ese hash y verifica vencimiento. Un visitante
no puede consultar una transacción solo por saber su UUID. No implementamos login ni JWT.
Pregunta: ¿por qué SHA-256 y no cifrar la cookie en la base? La credencial tiene 256 bits
aleatorios; basta comparar hashes y no necesitamos recuperar el valor original.

## Entrega

RegisterDelivery usa el cliente autenticado y valida dirección en Colombia. Devuelve
solo el ID. La relación compuesta impide asignar una entrega al cliente equivocado incluso
si otro adaptador escribe directamente. No se publica un listado de datos personales.

## Cotización y reserva

QuoteCheckout comprueba propiedad y disponibilidad y calcula con bigint. No reserva.
CreatePendingTransaction usa CheckoutUnitOfWork para bloquear la clave de idempotencia,
el producto y la entrega, recalcular, comparar el total mostrado y reservar. Solo entonces
guarda PENDING. Si una escritura falla, TypeORM revierte todo; un Result fallido también
se traduce a una excepción interna de rollback y vuelve a ser Result al salir del adaptador.
La excepción interna no llega al dominio ni al controlador.

Pregunta: ¿qué ocurre con ocho compradores y tres unidades? El bloqueo de producto
serializa decisiones; el UPDATE condicional y las restricciones son otra defensa. Tres
compras reservan y las restantes reciben InsufficientStock. El stock físico no baja aún.
Pregunta: ¿y ocho reintentos con la misma clave? El bloqueo transaccional por clave hace
que el segundo lea la misma transacción, sin reservar otra vez. El índice único respalda
esta regla. Los hashes advisory pueden colisionar: solo añaden espera, no mezclan compras.

## Vencimiento y recuperación

GetTransaction verifica propiedad, evalúa reservas vencidas del producto y devuelve un
resumen sin contacto o dirección. La cookie permite continuar tras refrescar mientras no
venza. Una reserva sin pago dura 15 minutos y solo se libera una vez. Si el futuro pago ya
se inició, hay que consultar al proveedor: el tiempo por sí solo no prueba rechazo.

## Seguridad HTTP y librerías agregadas

class-validator valida los DTO y class-transformer prepara el email antes de validarlo.
ValidationPipe rechaza propiedades no declaradas. El filtro evita devolver cuerpos de
peticiones o errores internos. Throttler limita a 60 solicitudes por minuto por ruta/IP
en cada proceso; AWS necesitará controles compartidos en API Gateway/WAF si se escala.
La cabecera X-Checkout-Request fuerza preflight CORS en escrituras entre orígenes; no es
un secreto. Cookie HttpOnly limita lectura por JavaScript, no elimina el riesgo de XSS.
Ver payment-security.md para separar tarjeta, token Wompi y credencial del checkout.

## Comandos locales

scripts/local-db.cjs usa Node child_process para consultar solo el ID/IP del contenedor
y ejecutar un script npm conocido con variables temporales. No evalúa comandos de usuario,
no imprime credenciales ni modifica .env. Evita depender de una IP fija con Docker Snap/WSL.
