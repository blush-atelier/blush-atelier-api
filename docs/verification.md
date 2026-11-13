# Verificación del backend: checkout PENDING

Verificado el 13 de noviembre de 2026 en WSL Ubuntu, Node 22.23.3 y PostgreSQL 17.12
(Docker). Alcance: productos, cliente invitado, entrega, cotización y reserva de stock.
El frontend tiene evidencia propia en su repositorio; aquí se verifica el backend. Los pagos Wompi siguen pendientes.

## Comandos y resultados

| Comando                  | Resultado                                                 |
| ------------------------ | --------------------------------------------------------- |
| npm ci                   | Instalación reproducible correcta                         |
| npm run format:check     | Correcto                                                  |
| npm run lint             | Correcto                                                  |
| npm run typecheck        | Correcto                                                  |
| npm run test:cov         | 12 suites y 108 pruebas unitarias/HTTP correctas          |
| npm run test:integration | 2 suites y 18 pruebas correctas sobre PostgreSQL real     |
| npm run build            | Correcto; genera dist/                                    |
| npm run local:migrate    | Nueva migración aplicada conservando productos existentes |
| npm run local:dev        | Arranque correcto; rutas nuevas registradas               |

La integración se ejecutó en una base nueva, con sufijo _test y nombre único, usando
variables temporales y el contenedor local. Solo esa base desechable fue eliminada al
terminar. Las migraciones y tablas de la base de trabajo no se revirtieron.

## Cobertura Jest medida

| Métrica    | Cobertura |
| ---------- | --------- |
| Sentencias | 99.11%    |
| Ramas      | 96.91%    |
| Funciones  | 98.09%    |
| Líneas     | 99.00%    |

Jest incluye src completo y exige 81% global en las cuatro métricas. Reportes locales:
coverage/coverage-summary.json y coverage/lcov.info (ignorados por Git). Los scripts
operativos de desarrollo están fuera de src; local:migrate y local:dev se comprobaron
mediante ejecución real. La cobertura frontend se mide en su repositorio.

## Casos comprobados

- Validación/normalización de cliente y dirección, cantidades e importes BIGINT exactos.
- Cookie HttpOnly; solo hash y vencimiento en DB. Un hash robado no funciona como cookie.
- Propiedad de entrega/transacción; una sesión no lee el estado de otra.
- Campos de tarjeta rechazados sin persistencia ni eco; errores de JSON y cuerpos >16 KB
  tampoco reflejan sus valores. Excepciones inesperadas registran solo diagnóstico fijo.
- Cabecera anti-CSRF, CORS con credenciales y origen permitido, Cache-Control no-store.
- Rate limit comprobado en el AppModule real (HTTP 429); es memoria por proceso.
- Cotización sin reservar; total alterado rechazado; estado APPROVED no aceptado desde JSON.
- Ocho reintentos concurrentes: una transacción y una reserva.
- Ocho compradores, tres unidades: tres reservas, cinco rechazos y cero sobreventa.
- Una entrega no se asigna dos veces; precio/cantidad y snapshot del total controlados por servidor.
- Una inserción forzada a fallar revierte también la reserva.
- Reserva vencida sin pago: EXPIRED y liberación una vez; con pago iniciado, no se libera por tiempo.
- Consulta protegida permite reanudar dentro de la sesión; sesión expirada devuelve 401.
- Migración y rollback/reaplicación comprobados solo en base desechable.

Swagger /docs respondió HTTP 200 desde Windows. /docs-json publica versión 0.2.0 con
los endpoints nuevos; GET /api/products responde 200 y no-store. La API local quedó
arrancada con local:dev para probarla. Son URLs locales, no despliegue público.

## Límites y pendientes

- Confirmación de pago, descuento definitivo de stock, rechazos Wompi, webhook y
  reconciliación: siguiente etapa. No se enviaron solicitudes a la API de pagos Wompi.
- La reserva vence en 15 minutos, pero su liberación es perezosa en cotizar/crear/consultar
  transacciones; no hay cron. La sesión invitada vence en una hora y no tiene recuperación
  posterior implementada. Una entrega usada requiere otra entrega para una nueva compra.
- El catálogo muestra el stock persistido; reservas vencidas aún no evaluadas pueden
  permanecer reflejadas hasta una operación de checkout del producto.
- PostgreSQL en Docker está comprobado; build/arranque del contenedor API siguen pendientes.
- CI remoto, protecciones de ramas, HTTPS de producción, almacenamiento de secretos AWS,
  controles distribuidos de tráfico y cookies/CloudFront en producción siguen pendientes.

## Dependencias agregadas

- class-validator: DTO con tipos, formato y límites; rechaza campos extra mediante ValidationPipe.
- class-transformer: transforma/normaliza el email antes de la validación.
- @nestjs/throttler: limita peticiones; no sustituye controles de API Gateway/WAF al escalar.
- Node crypto y child_process ya vienen con Node; no son paquetes nuevos.

npm ci reporta 19 avisos de auditoría: 7 bajos y 12 moderados; ninguno alto o crítico.
Persisten en las cadenas de Jest/deepmerge y TypeORM/ESLint/glob/minimatch. No se aplicó
--force ni se afirma que no existan vulnerabilidades. Deben revisarse actualizaciones
compatibles antes de entrega. Los resultados de cobertura no certifican seguridad PCI.

## Ampliación de catálogo y UI — 13/11/2026

Se ejecutó `POSTGRES_SSL=false npm run local:seed` con NODE_ENV=development y la IP
obtenida del contenedor Docker local: ahora hay diez productos (ocho de marcas reales).
Los importes e imágenes tienen procedencia en las notas de entrevista; stock ficticio.
No se borraron ni reiniciaron los productos o reservas de la base de trabajo.

Se volvieron a ejecutar las 108 pruebas unitarias/HTTP y 17 de integración, estas últimas
en la base local separada con sufijo `_test`. La base desechable se conservó; sus tablas
se modificaron/revirtieron solo dentro de esa base. La reserva real realizada desde la UI
se hizo en la BD de desarrollo y aparta una unidad MAC durante 15 minutos, sin pago.
El frontend reportó 70 pruebas, 97.28% líneas y 96.36% ramas; ver su README para todas las métricas.
AWS no se modificó ni se verificó desde este cambio.

## Categorías y paginación — 13/11/2026

Se agregaron 12 productos reales a la BD de desarrollo, preservando los 10 anteriores:
22 registros en total. Tres bases, tres correctores, tres sombras y tres accesorios;
URLs de fuente y fecha de consulta en product-catalog.ts. No cambian migraciones/ERD.
Jest: 108 pruebas unitarias/HTTP y 18 de integración correctas en la base local _test.
El frontend reporta 82 pruebas; 97.56% líneas, 96.93% ramas. La revisión Chrome comprobó
22 IDs distintos en páginas 8/8/6, filtros antes de paginar, recuperación y viewports
320–1920 px. Solo se preparó una cotización real adicional; no se creó otra reserva.
