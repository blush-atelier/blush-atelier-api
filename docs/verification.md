# Verificación del backend: checkout PENDING

Verificado el 13 de noviembre de 2026 en WSL Ubuntu, Node 22.23.3 y PostgreSQL 17.12
(Docker). Alcance: productos, cliente invitado, entrega, cotización y reserva de stock.
El frontend y los pagos Wompi no están implementados/verificados por esta evidencia.

## Comandos y resultados

| Comando                  | Resultado                                                 |
| ------------------------ | --------------------------------------------------------- |
| npm ci                   | Instalación reproducible correcta                         |
| npm run format:check     | Correcto                                                  |
| npm run lint             | Correcto                                                  |
| npm run typecheck        | Correcto                                                  |
| npm run test:cov         | 12 suites y 107 pruebas unitarias/HTTP correctas          |
| npm run test:integration | 2 suites y 16 pruebas correctas sobre PostgreSQL real     |
| npm run build            | Correcto; genera dist/                                    |
| npm run local:migrate    | Nueva migración aplicada conservando productos existentes |
| npm run local:dev        | Arranque correcto; rutas nuevas registradas               |

La integración se ejecutó en una base nueva, con sufijo _test y nombre único, usando
variables temporales y el contenedor local. Solo esa base desechable fue eliminada al
terminar. Las migraciones y tablas de la base de trabajo no se revirtieron.

## Cobertura Jest medida

| Métrica    | Cobertura |
| ---------- | --------- |
| Sentencias | 99.10%    |
| Ramas      | 96.91%    |
| Funciones  | 98.03%    |
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
