# Ramas, CI y promoción

## Ramas permanentes

- development: integración y trabajo local.
- staging: candidato de validación.
- production: versión de entrega publicada en AWS cuando exista despliegue.
- feature/*: ramas cortas nacidas desde development.

La rama main preexistente no se elimina automáticamente. La rama por defecto y las
protecciones remotas aún deben configurarse en GitHub. Las ramas locales nuevas no
se han publicado automáticamente.

## Promoción

1. feature/* → development por PR con CI verde.
2. development → staging por PR, CI verde, revisión de migraciones y validación del candidato.
3. staging → production por PR, misma revisión, CI verde y evidencia de aceptación.
4. Futuro CD: desplegar únicamente el SHA aprobado en production, verificar API y
   ejecutar checkout Sandbox; promover código no cambia el modo del proveedor.

El workflow verifica también el origen de los PR de promoción: solo development
puede apuntar a staging y solo staging puede apuntar a production. No evita pushes
directos por sí solo: requerir PR y CI mediante reglas de rama es configuración remota pendiente.

## CI implementada

PR y pushes a development/staging/production; pushes a feature/* también validan el
trabajo antes del PR. npm ci, format:check, lint, typecheck, Jest con cobertura global
mínima de 81% en las cuatro métricas, integración PostgreSQL y build. Las versiones
se reproducen mediante package-lock.json y Node de .nvmrc. Permisos contents:read y
acciones fijadas por SHA. Concurrencia cancela ejecuciones antiguas de la misma rama.
Los tests no reciben claves Wompi ni AWS. PostgreSQL usa credenciales efímeras de test.

## Configuración remota pendiente

- Publicar las ramas y seleccionar development como rama por defecto.
- Proteger las tres ramas: PR obligatorio, sin force push y check quality requerido.
- Revisar la política de aprobación y conservar evidencia de las promociones.
- Verificar la primera ejecución real del workflow; una prueba local no demuestra CI remoto.

## AWS y rollback futuros

Priorizar una infraestructura funcional de production: Lambda/API Gateway y PostgreSQL
privado. Staging no tendrá una copia AWS completa sin revisar costos regionales,
créditos, almacenamiento, red, logs y presupuesto. No se promete que RDS sea gratis.

CD solo después de infraestructura verificada, CI verde y OIDC de mínimo privilegio
restringido a production. Secretos solo en runtime AWS. Rollback al artefacto/version
Lambda anterior verificado; migraciones compatibles hacia atrás. No ejecutar down
sobre producción ni restaurar una DB sin evaluar pérdida de datos.
