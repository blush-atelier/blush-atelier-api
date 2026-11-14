# Checklist de entrega

Actualizado el 13/11/2026. «Cumplido localmente» requiere código y pruebas; no equivale a una validación pública en AWS. No se asignan puntos anticipadamente.

| Requisito                                               | Estado                     | Evidencia / acción pendiente                                                                                                                                                            |
| ------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React + TypeScript + Vite y Redux Toolkit               | Cumplido localmente        | WEB `main.tsx`, `application/store.ts`, pruebas de estado/carrito                                                                                                                       |
| Catálogo, descripción, precios, stock y seed PostgreSQL | Cumplido localmente        | API `products`, migraciones y seed; WEB catálogo/detalle                                                                                                                                |
| Modal «Pagar con tarjeta de crédito»                    | Parcial                    | WEB `CartPage`, `CheckoutDialog`, `card-ui.spec.tsx`; falta revisión renderizada de esta versión                                                                                        |
| Validación de tarjeta y logos Visa/Mastercard           | Cumplido en pruebas        | WEB `domain/card.ts`, `CardFields`, `card-checkout.spec.ts`; confirmar visualmente                                                                                                      |
| Contacto y entrega: departamento → ciudad               | Cumplido en pruebas        | WEB formulario, dataset local y `ui.spec.tsx`                                                                                                                                           |
| Resumen: productos + tarifa base + envío en Backdrop    | Cumplido localmente        | API cotización; WEB `SummaryBackdrop`/`OrderSummary` y pruebas                                                                                                                          |
| PENDING antes del envío del pago                        | Cumplido localmente        | API `CreatePendingTransaction`/`ChargeCard`; flujo real UAT con adaptadores WEB                                                                                                         |
| Tokenización y pago Wompi Sandbox                       | Parcial                    | JWE directo a Wompi; APPROVED/DECLINED reales en UAT con API y PostgreSQL aislado, sin navegador; completar prueba UI                                                                   |
| Resultado verificado, entrega READY y stock             | Cumplido localmente        | Consulta privada, política ROP y UoW PostgreSQL; aprobación/rechazo UAT                                                                                                                 |
| Rechazo, error y timeout                                | Parcial                    | Rechazo real UAT; ERROR/timeout simulados en Jest. Tercera tarjeta fue rechazada al tokenizar en UAT                                                                                    |
| Idempotencia de cargo y stock                           | Cumplido en pruebas        | `payment_submitted_at` antes del POST; ocho envíos concurrentes → una llamada/actualización en integración PostgreSQL                                                                   |
| Sobreventa, expiración y rollback                       | Cumplido en pruebas        | Integración de checkout/basket/payments; intento enviado no se libera solo por tiempo                                                                                                   |
| Webhook auténtico e idempotente                         | Parcial                    | Checksum + consulta privada y duplicados probados localmente; falta evento real contra URL HTTPS pública                                                                                |
| Recarga y recuperación segura                           | Parcial                    | Solo referencias en localStorage; token efímero. Jest cubre pedido enviado/no enviado; falta F5 durante pago en navegador real                                                          |
| Protección de tarjeta y secretos                        | Cumplido en implementación | PAN/CVC cifrados directamente a Wompi, nunca API/Redux/localStorage/logs; API recibe token; revisión de historial público pendiente                                                     |
| Avisos sobre el checkout y «Completando pago»           | Parcial                    | Native dialog/top layer y pruebas de foco; falta revisar renderizado/teclado en navegador                                                                                               |
| Hexagonal y ROP                                         | Cumplido en implementación | Domain sin frameworks; casos de uso dependen de puertos; adaptadores DI/Repository/UoW; `Result<T,E>`                                                                                   |
| Importes exactos                                        | Cumplido en pruebas        | PostgreSQL BIGINT, bigint en cálculo y strings JSON; límite seguro antes de JSON numérico para Wompi                                                                                    |
| Jest >80% en ambos repositorios                         | Cumplido medido            | API: 206 pruebas + 39 PostgreSQL, 93,71% sentencias / 90,04% ramas / 85,94% funciones / 93,67% líneas. WEB: 113 pruebas, 96,23% / 92,81% / 97,12% / 96,20%; reportes/mandatos en README |
| CSS Grid/Flexbox, tokens y movimiento reducido          | Cumplido en código         | Estilos por responsabilidad; sin dependencias nuevas ni !important en esta iteración                                                                                                    |
| Responsive y compatibilidad                             | Parcial                    | Diseño anterior revisado en Chrome; nuevo modal **sin inspección visual**: herramienta bloqueó iniciar Chrome. Revisar nueve tamaños 320×568–1920×1080 y Safari/Firefox                 |
| README, ERD y Swagger                                   | Parcial                    | Setup, claves por nombre, arquitectura, ERD sincronizado con cinco migraciones y Swagger local; faltan URLs públicas y clean clone                                                      |

## Bloqueantes para entrega

- [ ] Probar el flujo visual con tarjetas oficiales Sandbox: validación, resumen, aprobación/rechazo, aviso superior y F5.
- [ ] Revisar los nueve viewports acordados, dropdowns, foco, scroll y contenido largo; comprobar otros navegadores.
- [ ] Configurar webhook HTTPS y verificar evento real, duplicados y reconciliación tras perder la respuesta.
- [ ] Verificar frontend S3/CloudFront, API Lambda/API Gateway y PostgreSQL privado en AWS; migraciones/seed y TLS.
- [ ] Comprobar HTTPS, CORS, cookies, rutas SPA, secretos, permisos mínimos y controles distribuidos de tráfico.
- [ ] Verificar CI remoto, protecciones y promoción por PR feature/* → development → staging → production. Sin merges ni despliegues automáticos en esta iteración.
- [ ] Comprobar repositorios públicos sin secretos, README desde clon limpio y URLs de app/API/Swagger.
- [ ] Validar costos y rollback antes de habilitar CD/OIDC; una infraestructura final funcional como prioridad.

## Rúbrica

Base: README 5, imágenes/UX 5, onboarding con tarjeta 20, API 20, Jest >80% 30 y despliegue 20.
Extra: seguridad/HTTPS 5, responsive/navegadores 5, CSS 10, código limpio 10, hexagonal 10 y ROP 10.
Los 150 puntos dependen de la evaluación: AWS, webhook público y comprobación visual siguen abiertos.
