# Desarrollo local y Swagger

## Preparar Docker en Windows y WSL

La configuración del repositorio usa PostgreSQL en Docker y la API en WSL.
Si `docker --version` no funciona en Ubuntu:

1. Instala o abre Docker Desktop en Windows.
2. En Settings → Resources → WSL Integration, habilita Ubuntu y aplica los cambios.
3. Abre otra terminal Ubuntu y comprueba:

```bash
docker --version
docker compose version
docker info
```

[Documentación oficial de Docker para WSL](https://docs.docker.com/desktop/features/wsl/).
PostgreSQL Docker y API en WSL están verificados; el contenedor completo de API sigue pendiente.

## Configuración

Sigue el bloque `.env` del README. `POSTGRES_USER` y `POSTGRES_PASSWORD` deben tener
valores locales elegidos por ti, iguales para Docker y la API. No los compartas ni
los incluyas en Git. Para una contraseña con `$`, utiliza comillas simples en `.env`
para evitar que Compose interprete el carácter como sustitución de variables.

- `PORT`: puerto HTTP de NestJS; las URLs del README asumen 3000.
- `FRONTEND_ORIGIN`: origen permitido por CORS; no es la dirección de Swagger.
- `POSTGRES_HOST=localhost`: la API se conecta desde WSL al puerto publicado por Docker.
- `POSTGRES_PORT=5433`: puerto publicado local; PostgreSQL escucha en 5432 dentro del contenedor.
- `POSTGRES_DB`: nombre de la base creada al inicializar el volumen.
- `POSTGRES_SSL=false`: conexión local. La futura conexión de producción exigirá TLS.

En WSL, dentro del repositorio:

```bash
nvm use
npm ci
cp .env.example .env
```

No vuelvas a copiar `.env.example` sobre un `.env` que ya hayas completado.

## Levantar PostgreSQL y la API

Después de completar `.env`:

```bash
docker compose up -d db
docker compose ps
```

Espera a `healthy`. Si no arranca, revisa `docker compose logs db`.
Luego:

```bash
npm run local:migrate
npm run local:seed
npm run local:dev
```

- Docker crea la base y conserva sus archivos en el volumen `postgres_data`.
- Las cinco migraciones crean el modelo de productos, clientes, entregas, pedidos/líneas y trazabilidad de pagos.
- El seed agrega veinte productos de marcas reales y dos ficticios heredados sin sobrescribir precios o inventario existentes.
- NestJS sirve la API en el puerto configurado; deja esa terminal abierta.
- Los comandos local:* descubren el contenedor y usan su IP solo para ese proceso. No editan .env.

Para consultar tablas desde otra terminal:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT sku, price_minor, stock_on_hand, stock_reserved FROM products;"'
```

Detener sin eliminar los datos:

```bash
docker compose down
```

Para el flujo nuevo: [datos → resumen/tarjeta → pago y verificación](checkout-testing.md).

## Swagger y consultas manuales

No necesitas configurar una herramienta externa: NestJS genera Swagger a partir de
los controladores y DTO. Abre `http://localhost:3000/docs` en el navegador.

1. Expande **GET /api/products** → **Try it out** → **Execute**.
   Debe devolver HTTP 200 y veintidós productos si el seed se acaba de cargar.
2. Expande **GET /api/products/{id}** y usa el UUID del seed:
   `11111111-1111-4111-8111-111111111111`. Debe responder 200.
3. Prueba `no-es-un-uuid`: debe responder 400.
4. Prueba `33333333-3333-4333-8333-333333333333`: debe responder 404
   siempre que ese UUID no exista en tu base.

Los endpoints de catálogo son públicos. Los de checkout requieren la cookie que crea POST /api/customers.
`http://localhost:3000/docs-json` entrega el contrato OpenAPI.
Si cambias `PORT`, cambia ese puerto en las URLs.

Alternativa desde una segunda terminal WSL:

```bash
curl -i http://localhost:3000/api/products
curl -i http://localhost:3000/api/products/11111111-1111-4111-8111-111111111111
```

Los precios viajan como strings de centavos. `priceMinor: "8990000"` son 89.900,00 COP.

## Pruebas de integración

Las pruebas unitarias/HTTP usan dobles de dependencias y no necesitan una BD:

```bash
npm run test:cov
```

Para integración, primero levanta el servicio `db`. Crea una base separada **una sola vez**:

```bash
docker compose exec db sh -c 'createdb -U "$POSTGRES_USER" "${POSTGRES_DB}_test"'
NODE_ENV=test WOMPI_ENABLED=false POSTGRES_SSL=false POSTGRES_DB=blush_atelier_test npm run test:integration
```

El ejemplo supone `POSTGRES_DB=blush_atelier` en `.env`; adapta el nombre si elegiste otro.
El sufijo `_test` es obligatorio. Si ya creaste la base, ejecuta solo la segunda línea.
Estas pruebas aplican/revierten la migración y deben usar exclusivamente esa base desechable.

## Si algo falla

| Síntoma                                   | Qué revisar                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `docker: command not found`               | Docker Desktop abierto e integración Ubuntu habilitada                                                             |
| Docker no conecta con el daemon           | `docker info` y estado de Docker Desktop                                                                           |
| PostgreSQL no conecta                     | `docker compose ps`, host, puerto y credenciales de `.env`                                                         |
| `FRONTEND_ORIGIN` inválido                | Usar `http://localhost:5173`, sin ruta ni barra final                                                              |
| Swagger abre pero GET devuelve 503        | BD disponible y migración aplicada; revisar terminal NestJS                                                        |
| Swagger no abre                           | API arrancada; usar `/docs`, no `/api/docs`                                                                        |
| Contraseña incorrecta tras cambiar `.env` | El volumen conserva las credenciales de su primera inicialización; cambiar `.env` no modifica el usuario existente |
| Puerto 5432 ocupado                       | Elegir otro `POSTGRES_PORT` local y reiniciar el servicio                                                          |

No elimines el volumen ni ejecutes `migration:revert` para resolver un error de conexión:
el rollback inicial elimina la tabla. Conserva los datos y revisa primero la configuración.

## Ambos servicios dentro de Docker (alternativa)

Con `.env` completo:

```bash
docker compose up -d --build
docker compose exec api npm run migration:run
docker compose exec api npm run seed
```

Compose ajusta internamente el host de la BD a `db`; las URLs del navegador se mantienen.
Esta alternativa también está pendiente de verificar con Docker disponible.

## Docker Snap/WSL y puerto publicado

Si el contenedor está saludable pero localhost:5433 no responde, usa los comandos
local:migrate, local:seed y local:dev. Descubren la IP en cada ejecución y conectan al
puerto interno 5432. El mapeo correcto sigue siendo puerto local 5433 → interno 5432.
La conexión tiene límite de 5 segundos, no espera indefinidamente.

Las pruebas de integración necesitan la base desechable separada; si hay el mismo
problema de red, pasa temporalmente POSTGRES_HOST con la IP actual y POSTGRES_PORT=5432,
además de POSTGRES_DB terminado en _test. No cambies tu base de trabajo para ejecutar tests.
