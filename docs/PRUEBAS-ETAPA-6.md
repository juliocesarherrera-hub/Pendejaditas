# Matriz y evidencia de pruebas A/B/C

Estado: 22 comprobaciones remotas distintas aprobadas. La tabla es la matriz de escenarios prevista, no una afirmación de que cada fila se ejecutó físicamente. La evidencia y pendientes están en ETAPA-6-ENTREGAS.md. Usar las credenciales de `.env.test.local` excluido de Git. No imprimir payloads, secretos, contraseñas ni hashes. Conservar el historial técnico con títulos explícitos, sin presentar fixtures como artículos comerciales.

## Fixtures

- A vendedor, B comprador; C ajeno. Artículo a precio fijo, solicitud aceptada y cita confirmada.
- Segundo artículo de subasta: A vendedor, B ganador provisional; C postor perdedor. Cierre mediante el motor, resultado y coordinación canónicos.
- Artículos/operaciones separados para cancelación, reprogramación, expiración, reportes y concurrencia; una entrega registrada no se reutiliza para otra prueba.
- La cita debe estar en ventana válida. Si se acortan tiempos, solo mediante fixture administrativo de IDs técnicos verificados y auditado; jamás añadir una RPC pública que cambie relojes, caducidad o participantes.

## Casos y resultado esperado

| Caso | Ejecución | Resultado exigido |
| --- | --- | --- |
| Acceso | C y anónimo consultan/llaman las RPC para operación A/B | Sin datos privados ni capacidad de mutación |
| Contexto incompleto | Solicitud pendiente, cita no confirmada, producto ajeno/eliminado | No crear/emitir QR |
| Roles | A intenta emitir; B intenta consumir; A intenta confirmar recepción | Rechazo; solo B emite/confirma y A consume |
| Precio fijo | B emite; A revisa/consume; B confirma revisión vigente | Una entrega registrada, sin pago |
| Subasta | Mismo flujo con B ganador; C intenta crear/confirmar | Solo ganador/vendedor admitidos |
| Una sola operación | Dos solicitudes aceptadas distintas para el mismo artículo | Solo una operación no cancelada |
| Formato/falsificación | Cambiar secreto, ID, versión o usar código de otra operación | Ningún token ni entrega consumidos |
| Caducidad | Intentar consumo a los 90 segundos y después | Rechazo con hora del servidor |
| Rotación | B emite otro QR e intenta consumir el primero | Primero revocado, solo último vigente |
| Reutilización | Repetir token consumido con nonce distinto | No otro consumo ni entrega |
| Idempotencia | Repetir mismo nonce/datos, incluso concurrentemente | Mismo recibo, un solo evento de acción |
| Nonce conflictivo | Mismo nonce con otro QR/acción/revisión | Rechazo sin mutación |
| Carreras | Dos consumos y dos confirmaciones simultáneos | Un consumo, una confirmación y secuencia coherente |
| Confirmación incompleta | A consume sin confirmación de B | Pendiente, no entrega completa |
| Confirmación tardía | B confirma después de cinco minutos | No registra; nuevo QR y doble confirmación necesarios |
| Revisión obsoleta | B confirma con revisión anterior | Rechazo, sin suponer recepción |
| Cancelación | Cancelar antes/durante escaneo | Estado serializado, QR anterior no revive |
| Cita modificada | Reprogramar o cancelar con QR emitido | Operación pendiente cancelada y token revocado |
| Entrega histórica | Editar cita/producto, borrar o cancelar recepción registrada | Historial preservado; usar incidentes |
| Pérdida de respuesta | Cortar conexión tras commit de consumo/confirmación | Consultar estado y recibo; no duplicar ni simular éxito offline |
| Reporte privado | B reporta sin pausa; A y C consultan incidentes | Solo B ve su reporte; ningún evento compartido |
| Desacuerdo | B pide pausa; A intenta continuar | Estado en revisión, token inválido, detalles privados |
| Reporte posterior | Abrir revisión tras registro | Conservar recorded_at; sin reversión financiera |
| Revisión humana | A/B/C/service_role intentan función administrativa | Denegado; solo propietario autorizado revisa y audita |
| Resolución | Administrador reanuda/cancela pendiente con motivo | Viejos QR inválidos; no reanudar con otros incidentes pausados sin resolver |
| Permisos directos | A/B/C insertan/actualizan/borran operaciones, tokens, eventos, recibos o revisiones | Denegado por grants/RLS |
| Realtime | C escucha estados A/B y todos escuchan secretos/reportes | C sin eventos privados; secretos e incidentes nunca publicados |
| Límites | Superar 20 intentos/min, 3 emisiones/min o 5 reportes/día | Rechazos persistentes, no limitar únicamente el navegador |
| Dispositivos | Cámara denegada, imagen ilegible, suspensión, desconexión y retorno | Errores claros, ningún éxito supuesto, permisos y alternativas locales |

Las verificaciones locales disponibles son `npm test`, `npm run test:sql`, `npm run lint` y `npm run build`. Analizan sintaxis y contrato; no demuestran aislamiento ni atomicidad en Supabase. Los runners delivery-setup.mjs, delivery-integration.mjs y delivery-final-security.mjs se ejecutaron después de revisar el diagnóstico instalado. No modificar las migraciones anteriores para acomodar las pruebas.
