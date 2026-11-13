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
No se han verificado despliegues ni CD desde este repositorio. Antes se requieren presupuesto, costos,
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

## Catálogo de demostración — 13/11/2026

`product-catalog.ts` define datos deterministas para el seed: veinte productos de cuatro marcas y dos productos ficticios heredados. UUID y SKU son estables; stock inicial es ficticio (12/18/20 según producto). El precio es una fotografía de una consulta, no una tarifa en tiempo real ni una oferta comercial. Se conserva como string de centavos sin operaciones de coma flotante. No se añadieron columnas/migraciones: `image_url` ya existía, por lo que el ERD no cambia.

| Marca      | Producto / tono                                | Precio de referencia COP | Fuente                                                                                    |
| ---------- | ---------------------------------------------- | -----------------------: | ----------------------------------------------------------------------------------------- |
| MAC        | MACximal Silky Matte / Ruby Woo                |                  115.000 | [Blush-Bar](https://www.blush-bar.com/labial-macximal-silky-matte-lipstick/p)             |
| MAC        | MACximal Sleek Satin / Brick-o-la              |                  115.000 | [Blush-Bar](https://www.blush-bar.com/labial-macximal-sleek-satin-lipstick/p)             |
| Too Faced  | Lip Injection Lip Gloss / Stars are Aligned    |                  127.000 | [Blush-Bar](https://www.blush-bar.com/brillo-de-labios-lip-injection-lip-gloss/p)         |
| Too Faced  | Lip Injection Extreme Lip Shaper / Hot & Spicy |                  113.000 | [Blush-Bar](https://www.blush-bar.com/lip-injection-extreme-lip-shaper/p)                 |
| Atenea     | Click Lipstick Sublime / Melon                 |                   28.000 | [Atenea](https://ateneaprofesional.com/products/click-lipstick-sublime)                   |
| Atenea     | Rubor en barra Collection / Pinkchai           |                   44.000 | [Atenea](https://ateneaprofesional.com/products/rubor-en-barra-cremoso-atenea-collection) |
| Bloomshell | Bloom Blushy / Sol de Tarde                    |                   25.000 | [Bloomshell](https://tienda.bloomshell.co/product/bloom-blushy-sol-de-tarde/)             |
| Bloomshell | Bloom Touch / Love                             |                   20.000 | [Bloomshell](https://tienda.bloomshell.co/product/bloom-touch-love/)                      |

Los precios y fotos MAC/Too Faced se verificaron también con el catálogo público VTEX de Blush-Bar (`/api/catalog_system/pub/products/search?ft=macximal` y `?ft=lip%20injection`); se prefirió el valor actual de cada SKU frente al precio indexado por buscadores. Atenea se comprobó con las variantes del JSON público Shopify `.js`. Bloomshell publica COP en cada ficha. Las referencias se consultaron el 13/11/2026; pueden cambiar.

Fotografías de producto: CDNs de esas fichas; Sol de Tarde usa [CocoPink, variante 3 Sol de Tarde](https://cocopinkstore.com/products/bloom-blushy-bloomshell), porque la ficha Bloomshell mostraba Susurro en su imagen. La API entrega la URL original; el frontend conserva versiones locales de 480/960 px en `public/images/catalog` y un mapa por SKU para servirlas sin dependencia de hotlinking. Son fotografías ajenas para la demo; no implican afiliación ni licencia comercial de las marcas.

El INSERT está parametrizado e incluye `image_url`. Repetir `local:seed` solo agrega ausentes (`ON CONFLICT DO NOTHING`): no reinicia precio, stock ni reservas, tampoco elimina los productos usados anteriormente. Durante la preparación se corrigió exclusivamente la URL de imagen del nuevo producto Sol de Tarde local, sin modificar sus importes o existencias. Las fuentes son metadatos del seed, no se devuelven datos privados ni se consulta a esas tiendas al hacer checkout.

Prueba de integración: carga diez registros, verifica foto/precio/stock del MAC, modifica precio y reserva en la base desechable y confirma que repetir seed los preserva. Pregunta de entrevista: ¿por qué no hacer upsert de todos los campos? Porque reiniciaría inventario o cambiaría referencias existentes al volver a ejecutar una tarea de desarrollo. Un cambio deliberado de precios requiere una operación explícita.

## Ampliación: bases, correctores, sombras y accesorios — 13/11/2026

Doce productos adicionales, tres por categoría, para un total de 22. Se mantienen
centavos string y stock inicial ficticio. El seed sigue usando una sola inserción
parametrizada y ON CONFLICT DO NOTHING, sin sobrescribir productos anteriores.
Las URLs y fecha de consulta se conservan junto a los datos. El modelo ya admite
estos productos: no se añadieron columnas ni endpoints; ERD sin cambios.

| Producto / variante                         | Precio de referencia COP | Fuente                                                                                                      |
| ------------------------------------------- | -----------------------: | ----------------------------------------------------------------------------------------------------------- |
| Studio Fix Fluid · NC15                     |                  220.000 | [Ficha](https://www.blush-bar.com/base-liquida-studio-fix-fluid-spf-15-24hr-matte-foundation-oil-control/p) |
| Born This Way Foundation · Golden Beige     |                  222.000 | [Ficha](https://www.blush-bar.com/base-liquida-born-this-way-foundation-too-faced/p)                        |
| Studio Fix 36HR · NC15                      |                  165.000 | [Ficha](https://www.blush-bar.com/corrector-sf-36hr-smth-angls-c/p)                                         |
| Born This Way Ethereal Light · Honey Graham |                  154.000 | [Ficha](https://www.blush-bar.com/corrector-born-this-way-etheral-light-concealer/p)                        |
| Base líquida 1st Scene · Light 30 ml        |                   58.000 | [Ficha](https://ateneaprofesional.com/products/mini-base-liquida-1st-scene)                                 |
| Corrector líquido 1st Scene · Cutcrease     |                   49.000 | [Ficha](https://ateneaprofesional.com/products/corrector-liquido-1st-scene)                                 |
| Paleta de sombras Rose Sublime              |                   56.000 | [Ficha](https://ateneaprofesional.com/products/paleta-de-sombras-12-tonos-sublime)                          |
| Paleta multiusos Moccalush                  |                  150.000 | [Ficha](https://ateneaprofesional.com/products/paleta-de-sombras-multiusos-moccalush)                       |
| Sombra cremosa individual · Tropicalb       |                   24.000 | [Ficha](https://ateneaprofesional.com/products/sombra-cremosa-individual)                                   |
| Encrespador de pestañas · Golden Rose       |                   11.000 | [Ficha](https://ateneaprofesional.com/products/encrespador-atenea)                                          |
| Brocha dúo para base y crema                |                   56.000 | [Ficha](https://ateneaprofesional.com/products/brocha-duo-para-base)                                        |
| Kit de brochas Pink Travel ×6               |                   79.800 | [Ficha](https://ateneaprofesional.com/products/kit-de-brochas-pink-travel-x6)                               |

MAC/Too Faced: valores por SKU de los catálogos VTEX públicos `?ft=studio%20fix` y
`?ft=born%20this%20way`; Atenea: precio decimal COP y foto de variante del catálogo
Shopify público products.json, convertidos fuera de JavaScript a centavos exactos.
Las imágenes se optimizan en el frontend, sin búsquedas externas durante el checkout.

La API GET /api/products continúa entregando el listado completo. La UI filtra,
ordena y pagina ocho productos por vista. Para un catálogo mayor, diseñar filtros,
orden estable, total y paginación del servidor mediante un contrato explícito; no
cambiar silenciosamente la forma JSON actual que consume el frontend.

La integración comprueba exactamente tres SKU por prefijo nuevo y precio de la base
Atenea 1st Scene de 58.000 COP (`5800000` centavos). El flujo de checkout acepta los
mismos UUID y conserva todas las reglas de reserva existentes.

## Carrito completo: productos y reserva atómica

QuoteCheckout y CreatePendingTransaction aceptan líneas. calculateBasket calcula cada
subtotal con bigint, suma una sola tarifa base y un envío y controla el límite BIGINT.
TypeOrmCheckoutUnitOfWork persiste la cabecera y transaction_items dentro de la misma
transacción; un Result fallido revierte todas las reservas, incluso después de actualizar
una línea. El hash ordena las líneas para reconocer el mismo pedido aunque cambie su
orden. Para una sola línea conserva el hash anterior y permite recuperar solicitudes
iniciadas antes de esta actualización.

La expiración libera todas las líneas del pedido una vez. Un advisory lock global de
PostgreSQL coordina procesos y evita interbloqueos con carritos superpuestos. Es una
solución sencilla para el volumen de la prueba, con menor concurrencia; al escalar
revisaría bloqueos ordenados y reconciliación. No usar este lock durante Wompi.

Preguntas: ¿por qué una sola transacción por carrito? Para reservar todo o nada y no
cobrar tarifas por producto. ¿Por qué guardar precio por línea? Para conservar el
importe acordado aunque cambie el catálogo. ¿Por qué no borrar las columnas anteriores?
Para migrar sin perder recuperación/idempotencia; son la primera línea compatible.
Los pagos siguen pendientes y no se marcan APPROVED desde el navegador.
