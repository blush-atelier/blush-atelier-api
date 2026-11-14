# Verificación actual

Revisión documental: 14/11/2026.

Últimas mediciones locales registradas en esta iteración, WSL / Node 22. No equivalen
a una certificación de producción ni de seguridad PCI. El proveedor se simula en Jest.

## Comandos y evidencia

| Repositorio | Comando                                                                      | Último resultado medido                                  |
| ----------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| API         | `npm run test:cov`                                                           | 19 suites, 224 pruebas unitarias/HTTP correctas          |
| API         | `npm run test:integration`                                                   | 3 suites, 42 pruebas PostgreSQL correctas                |
| WEB         | `npm run test:cov`                                                           | 13 suites, 139 pruebas correctas; sin advertencias React |
| Ambos       | `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build` | Correctos en sus últimos cambios de código               |

La API se midió de nuevo para Swagger y QA del webhook. PostgreSQL se ejecutó en
un contenedor desechable con configuración explícita, sin usar RDS ni realizar pagos.
Las mediciones WEB pertenecen a la iteración anterior. Hubo un fallo inicial de
inferencia TypeScript, corregido, y timeouts al ejecutar las suites simultáneamente
en WSL; las ejecuciones finales secuenciales pasaron sin aumentar timeouts.

Se comprobó HTTP 200 por HTTPS en https://dviblid28pd4o.cloudfront.net/.
Esto verifica acceso a la web, no checkout ni enrutamiento API en AWS. La usuaria
informa API/RDS desplegados; esta revisión no modificó ni verificó RDS y no envió
webhooks a producción. El webhook público y la configuración efectiva desplegada
siguen pendientes de validación operativa autorizada.

| Métrica Jest | API    | WEB    |
| ------------ | ------ | ------ |
| Sentencias   | 94,21% | 96,88% |
| Ramas        | 90,72% | 92,66% |
| Funciones    | 87,09% | 97,33% |
| Líneas       | 94,20% | 96,81% |

Ambos exigen 81% global en las cuatro métricas e incluyen todo `src`. Los reportes
locales se generan en `coverage/` y no se versionan. El README de cada repositorio
contiene sus comandos y mediciones.

## Qué se comprobó

- DTO, propiedad de sesión, cookie HttpOnly, cabecera anti-CSRF, CORS, límites de cuerpo,
  cabeceras de seguridad, rate limiting por proceso y errores sin eco de datos sensibles.
- Dinero BIGINT/bigint/string, cotización de una o varias líneas y tarifas una sola vez.
- PENDING antes del cargo, reserva atómica, idempotencia, expiración de intentos no enviados,
  competencia por stock y rollback completo ante fallos de persistencia.
- Envío directo con token: ocho solicitudes concurrentes generan una llamada al proveedor
  simulado y un único movimiento de stock. `payment_submitted_at` se confirma antes del POST.
- Aprobación confirma stock y entrega READY; rechazo/error liberan reserva; timeout conserva
  incertidumbre. Identidad, referencia, importe y moneda del proveedor se verifican.
- Webhook auténtico/idempotente y carrera con verificación HTTP, usando eventos simulados.
- WEB: sesión vencida permite una nueva selección y registro sin reabrir pedidos antiguos;
  seguimiento automático PENDING entre rutas, con pausa en segundo plano y sin repetir cargos.
- WEB: entrega → resumen/tarjeta → paso 03; validaciones, marca detectada dentro del campo,
  avisos superiores, recuperación, consulta por referencia sin alterar carrito y eliminación
  del banner de selección pendiente después de registrar el pedido.
- JWE interoperable RSA-OAEP-256 + A256GCM; token y tarjeta fuera de Redux/localStorage.
- ERD Mermaid/SVG contrastado con las 60 columnas y tipos de PostgreSQL local; seis
  relaciones representadas y SVG inspeccionado como imagen.
- Cinco migraciones y seed de 22 productos. La migración de envío de tarjeta se aplicó
  también en la BD local de trabajo sin reiniciar inventario.

Las suites PostgreSQL limpian y revierten únicamente una base local desechable con
sufijo `_test`, nunca la base de trabajo. Las pruebas con proveedor real utilizaron
otra base local aislada con sufijo `_sandbox_test`.

## Evidencia contra Wompi UAT Sandbox

Con los adaptadores WEB ejecutados desde Node y API/PostgreSQL local aislado:

- Tokenización cifrada aceptada por UAT.
- APPROVED: PENDING previo, reserva confirmada y una unidad menos de stock.
- DECLINED: PENDING previo, reserva liberada y stock físico conservado.
- Otras tarjetas probadas se rechazaron al tokenizar; no acreditan ERROR de pago en UAT.

No se registraron tarjetas/tokens en archivos de evidencia ni se hicieron pagos con
dinero real. Estas llamadas **no prueban la interacción de navegador ni un evento real**.

## Pruebas manuales reportadas por la usuaria — 14/11/2026

| Caso                                               | Resultado informado                                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Sesión vencida y nueva selección                   | OK                                                                                                 |
| Aprobación y rechazo con tarjeta Sandbox           | OK                                                                                                 |
| Recarga y desconexión                              | OK                                                                                                 |
| Doble clic bloqueado y cantidad limitada por stock | OK                                                                                                 |
| Rechazo de tarjeta con prefijo 6                   | OK; la tienda admite Visa/Mastercard                                                               |
| Titular con números                                | Hallazgo: corregido con filtro de entrada y validación de dominio; requiere repetir manualmente    |
| Botones intermitentes durante actualización        | Hallazgo: consulta separada de la fase visual; regresión DOM en Jest, requiere repetir manualmente |

Estos resultados son un reporte de la usuaria, no una inspección de navegador realizada
por el agente. No acreditan los nueve viewports, otros navegadores ni webhook público.

## Pendientes y límites

- Inspección visual de este modal/flujo en los nueve viewports y en otros navegadores.
  Las capturas anteriores acreditan únicamente versiones anteriores. El arranque de Chrome
  fue bloqueado por la herramienta; no se declaran nuevas pantallas verificadas.
- Repetir manualmente titular sin números y estabilidad de acciones durante varios ciclos
  PENDING. Los recorridos principales reportados por la usuaria ya están anotados arriba.
- Webhook HTTPS público y reconciliación real si se pierde el ID del proveedor.
- AWS, HTTPS/CORS/cookies desplegados, DB privada/TLS/permisos mínimos, URLs públicas,
  controles distribuidos de tráfico, CI remoto y protecciones/promoción de ramas.
- Arranque del contenedor completo de API; API WSL + PostgreSQL Docker sí se comprobó.
- Reservas no iniciadas: vencen a los 15 minutos; liberación perezosa al cotizar/crear/
  consultar transacciones, sin cron. Intentos enviados no se liberan solo por tiempo.
- Sesión invitada de una hora, sin recuperación posterior ni historial entre sesiones.
- El catálogo puede reflejar una reserva vencida hasta evaluar su expiración en checkout.

[Guía manual y Swagger](checkout-testing.md) · [Seguridad de pagos](payment-security.md).

## Checklist frente a la rúbrica

| Criterio base          | Puntos | Evidencia local / pendiente                                                        |
| ---------------------- | ------ | ---------------------------------------------------------------------------------- |
| README                 | 5      | Setup, contratos, ERD y secuencia; faltan URLs públicas y clean clone final        |
| Imágenes y límites UX  | 5      | Imágenes optimizadas y CSS responsive; nueva versión requiere inspección visual    |
| Onboarding con tarjeta | 20     | Jest + UAT y recorrido manual reportado OK; repetir titular y acciones estables    |
| API                    | 20     | Unitarias/HTTP, PostgreSQL, UAT aprobado/rechazado y stock; webhook real pendiente |
| Jest >80% ambos        | 30     | Cuatro métricas >80%; informes medidos arriba                                      |
| App y API publicadas   | 20     | Pendiente: una EC2 creada no es la app desplegada                                  |

**80 puntos base corresponden al trabajo local y 20 al despliegue.** Más pruebas
no sustituyen esos 20. La revisión visual y las dos correcciones pendientes de repetición manual impiden dar por
cerrados todos los 80 locales. El evaluador asigna los puntos, no este documento.

Extra (hasta 50): seguridad/HTTPS 5, responsive/navegadores 5, CSS 10, código limpio 10,
hexagonal 10 y ROP 10. Hay implementación local de esos patrones y controles, pero
HTTPS público, navegadores y revisión final siguen pendientes; no se certifican 100/150.
La usuaria indica una EC2 en us-east-2; no se verificó infraestructura AWS desde aquí.

El recorrido principal ya está reportado OK por la usuaria. Antes de AWS, repetir
titular y estabilidad de acciones y completar revisión visual pendiente. Las pruebas
automáticas cubren stock concurrente, idempotencia, sesiones ajenas e importes alterados.
Después del despliegue: webhook público y repetir E2E sobre las URLs finales.

Estimación orientativa tras repetir las dos correcciones: unos **70/100 base**
(API 20 + Jest 30 + onboarding 20) y **20/50 extra defendibles** por hexagonal/ROP:
**aproximadamente 90/150**. No es puntuación oficial ni garantía. README/UX suman otros
10 sujetos a revisión final; AWS 20 sigue pendiente; CSS/código limpio 20 dependen del
evaluador; HTTPS/navegadores 10 requieren comprobación. El despliegue es un entregable
obligatorio aunque los extras permitan superar 100 en la suma.
