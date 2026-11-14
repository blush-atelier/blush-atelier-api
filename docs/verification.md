# Verificación de entrega

Revisión: 14/11/2026. Fuente: PDF de la prueba (7 páginas), `requirements.md`, código,
Jest y comprobaciones HTTP. Los puntos los asigna el evaluador, no este documento.

## Evidencia pública

| Comprobación                                | Resultado                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Web `https://dviblid28pd4o.cloudfront.net/` | 200, HTML por HTTPS                                                                                                 |
| `/api/products`                             | 200, JSON con 22 productos                                                                                          |
| `/api/docs` y `/api/docs-json`              | 200, Swagger/OpenAPI con rutas reales                                                                               |
| POST `/api/payments/wompi/events` con `{}`  | 401 InvalidWebhook; sin cookie ni cabecera del comprador                                                            |
| Cabeceras API                               | HSTS, CSP, nosniff, SAMEORIGIN y no-store presentes                                                                 |
| Cabeceras respuesta web `/`                 | HSTS, CSP y nosniff no presentes; configurar política de respuesta CloudFront                                       |
| Repositorios GitHub                         | Ambos públicos; nombres sin el nombre del proveedor                                                                 |
| CI API                                      | [Ejecución 20 correcta](https://github.com/blush-atelier/blush-atelier-api/actions/runs/43580054894), SHA `11b5113` |

La prueba inválida del webhook se rechaza antes de consultar proveedor/persistencia.
No se realizaron pagos, replays firmados ni escrituras RDS en esta revisión. No se
inspeccionó infraestructura interna de EC2/RDS ni un navegador renderizado.

## Pruebas medidas

| Repositorio | Resultado Jest         | Sentencias | Ramas  | Funciones | Líneas |
| ----------- | ---------------------- | ---------- | ------ | --------- | ------ |
| API         | 229 pruebas, 20 suites | 94,21%     | 90,72% | 87,09%    | 94,20% |
| WEB         | 139 pruebas, 13 suites | 96,88%     | 92,66% | 97,33%    | 96,81% |

API: 42 pruebas PostgreSQL/3 suites correctas en la revisión inmediatamente anterior,
con contenedor local desechable, proveedor simulado y sin RDS. Incluyen confirmación,
rechazo, concurrencia, stock, idempotencia y rollback de entrega/pago/stock.
Los cambios posteriores agregan herramienta operativa y documentación; no cambian schema.

El replay tiene cinco pruebas con HTTP simulado: no red por defecto, checksum válido,
consulta existente sin crear cargos, rechazo de destinos reales y fallos sin eco.
Ambos repos exigen 81% en las cuatro métricas e incluyen todo `src`. Reportes locales
en `coverage/`; no se versionan. [Ejecución y SQL](checkout-testing.md).

## Checklist base — 100 puntos posibles

| Requisito                               | Máximo | Estado / evidencia                                                                                                | Acción mínima pendiente                                                              |
| --------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| README completo                         | 5      | Cumplido en archivos: URLs, setup, variables, arquitectura, ERD, pruebas y AWS en ambos repos                     | Publicar los commits revisados y comprobar instrucciones desde clon limpio           |
| Imágenes rápidas y UI dentro de límites | 5      | Parcial: tamaños/lazy loading/fallback en WEB; responsive confirmado por usuaria                                  | Guardar evidencia de imágenes/caché y UX sobre la versión AWS                        |
| Checkout con tarjeta                    | 20     | Parcial de entrega: modal, Backdrop, tarifas, PENDING, resultado y recarga probados; ciclo confirmado por usuaria | Repetir aprobación/rechazo y F5 en la URL pública; conservar referencias sin tarjeta |
| API correcta                            | 20     | Implementada: 229 pruebas y 42 PostgreSQL; catálogo/Swagger públicos correctos                                    | Corroborar stock/entrega del recorrido AWS con SQL de lectura                        |
| Jest >80% en ambos                      | 30     | Cumplido medido en las cuatro métricas; resultados arriba                                                         | Mantener CI verde al promover                                                        |
| App y API publicadas y conectadas       | 20     | Parcial de evidencia: web/API por mismo CloudFront responden; EC2/RDS informado                                   | Confirmar desde navegador que la web usa esta API y completa el checkout             |

No hay un bloque funcional base conocido pendiente en local. Falta cerrar evidencia
end-to-end de la entrega AWS. No se certifican 100 puntos únicamente por respuestas 200
ni se convierte una fila parcial en una puntuación concedida.

## Extras — 50 puntos posibles

| Requisito                          | Máximo | Estado / evidencia                                                                              | Acción mínima pendiente                                                      |
| ---------------------------------- | ------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| OWASP, HTTPS y cabeceras           | 5      | Parcial: HTTPS y cabeceras API comprobados; tokenización, validación, cookies y firma en código | Cabeceras web en CloudFront, verificar cookies/CORS y TLS/red RDS efectivos  |
| Responsive y distintos navegadores | 5      | Parcial: usuaria confirma responsive; capturas históricas no acreditan checkout actual          | Probar Chrome, Firefox y Safari reales, al menos móvil compacto y escritorio |
| CSS                                | 10     | Implementado: Grid/Flexbox, tokens, estilos por responsabilidad, movimiento reducido            | Revisión final del evaluador; no requiere otra iteración estética            |
| Código limpio                      | 10     | Implementado: TypeScript, separación de capas, lint y pruebas                                   | Revisión final y comprobar Git sin secretos                                  |
| Hexagonal / Ports & Adapters       | 10     | Implementado: domain/application/infrastructure; puertos, repositorios, UoW y DI                | Defender flujo y dependencias en entrevista                                  |
| ROP                                | 10     | Implementado: Result discriminado y errores esperados tipados                                   | Explicar transición de resultados hasta HTTP                                 |

## Webhook sin dashboard

El PDF no exige expresamente webhook: exige que el resultado esté verificado y se
actualicen pedido/entrega/stock. La aplicación lo logra mediante consulta privada,
además del receptor de eventos. Su recepción real desde Wompi queda pendiente de
configuración del comercio; no bloquea por sí sola la confirmación normal por polling.

[Replay firmado](checkout-testing.md#replay-firmado-sin-dashboard): usa una transacción
Sandbox existente, no crea cargos, y requiere `--send` para enviar. No se ejecutó
contra AWS. Prueba nuestro receptor; no acredita la suscripción ni el envío de Wompi.

## Cierre mínimo

1. Aprobar/publicar los cambios revisados mediante PR; mantener CI y ramas de entrega.
2. En AWS, aprobación/rechazo/F5 y stock/entrega por SQL de lectura; no usar tarjetas reales.
3. Completar cabeceras del frontend y revisión de cookies/CORS/red/TLS sin exponer RDS.
4. Registrar evidencia móvil/escritorio y Firefox/Safari de la versión publicada.
5. Si se requiere evidencia de eventos entrantes, coordinar con el dueño del comercio;
   el replay manual y la recepción real deben etiquetarse por separado.

La usuaria confirmó el ciclo, responsive y correcciones de sesión/titular/estado estable.
Es evidencia reportada; no se atribuye al agente ni se presume realizada sobre AWS.
