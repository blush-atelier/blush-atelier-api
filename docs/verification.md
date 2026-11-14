# Verificación actual

Últimas mediciones locales registradas en esta iteración, WSL / Node 22. No equivalen
a una certificación de producción ni de seguridad PCI. El proveedor se simula en Jest.

## Comandos y evidencia

| Repositorio | Comando                                                                      | Último resultado medido                                  |
| ----------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| API         | `npm run test:cov`                                                           | 17 suites, 206 pruebas unitarias/HTTP correctas          |
| API         | `npm run test:integration`                                                   | 3 suites, 39 pruebas PostgreSQL correctas                |
| WEB         | `npm run test:cov`                                                           | 12 suites, 118 pruebas correctas; sin advertencias React |
| Ambos       | `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build` | Correctos en sus últimos cambios de código               |

Estos resultados se obtuvieron antes de actualizar esta documentación; no se volvió
a ejecutar toda la suite por cambios exclusivamente documentales.

| Métrica Jest | API    | WEB    |
| ------------ | ------ | ------ |
| Sentencias   | 93,71% | 96,54% |
| Ramas        | 90,04% | 92,36% |
| Funciones    | 85,94% | 97,19% |
| Líneas       | 93,67% | 96,62% |

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
- WEB: entrega → resumen/tarjeta → paso 03; validaciones, marca detectada dentro del campo,
  avisos superiores, recuperación, consulta por referencia sin alterar carrito y eliminación
  del banner de selección pendiente después de registrar el pedido.
- JWE interoperable RSA-OAEP-256 + A256GCM; token y tarjeta fuera de Redux/localStorage.
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

## Pendientes y límites

- Inspección visual de este modal/flujo en los nueve viewports y en otros navegadores.
  Las capturas anteriores acreditan únicamente versiones anteriores. El arranque de Chrome
  fue bloqueado por la herramienta; no se declaran nuevas pantallas verificadas.
- E2E manual en navegador: aprobado/rechazado, F5 durante pago y errores visibles.
- Webhook HTTPS público y reconciliación real si se pierde el ID del proveedor.
- AWS, HTTPS/CORS/cookies desplegados, DB privada/TLS/permisos mínimos, URLs públicas,
  controles distribuidos de tráfico, CI remoto y protecciones/promoción de ramas.
- Arranque del contenedor completo de API; API WSL + PostgreSQL Docker sí se comprobó.
- Reservas no iniciadas: vencen a los 15 minutos; liberación perezosa al cotizar/crear/
  consultar transacciones, sin cron. Intentos enviados no se liberan solo por tiempo.
- Sesión invitada de una hora, sin recuperación posterior ni historial entre sesiones.
- El catálogo puede reflejar una reserva vencida hasta evaluar su expiración en checkout.

[Guía manual y Swagger](checkout-testing.md) · [Checklist](acceptance-checklist.md).
