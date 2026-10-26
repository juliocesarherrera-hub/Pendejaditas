# Resultados de la Etapa 7 y corrección de etiquetas

Verificación realizada el 25 de octubre de 2026. Entorno real Supabase del propietario, únicamente con operaciones y expedientes identificados expresamente como técnicos. Ningún movimiento de dinero. Las cuentas de prueba y los resultados con identificadores se guardan en archivos ignorados, sin publicar credenciales ni documentos.

## Evidencias verificadas

| Área | Resultado |
| --- | --- |
| Instalación SQL | Diagnóstico del propietario: 11 tablas con RLS, 26 funciones, 14 políticas, 10 triggers y bucket privado. Los 26 cuerpos coincidieron con el archivo local. No se repitió 007. |
| Casos y versiones | Apertura real, nonce idempotente, versión de B visible para A, persistencia al reiniciar sesión y rechazo de escritura/suplantación/lectura ajena. |
| Archivos Edge | PDF privado e imagen compartida; hash del servidor sobre bytes reales, descarga íntegra con CORS, rechazo de acceso ajeno, sobrescritura y eliminación. Privacidad frente a B cuando no se compartió. |
| Administración con MFA | El propietario verificó personalmente C; autorización explícita de `reviewer`. Acceso a expediente y archivos, inicio de revisión, solicitud de información y resolución registrados. |
| Petición de información | B respondió a su petición; A y C ajeno sin MFA no pudieron contestar en su lugar. Respuesta original y autor del servidor conservados, sin duplicación. |
| Apelación | B apeló la resolución técnica. El propietario confirmó C excluida con MFA; D con MFA pudo revisar y resolver. Dos resoluciones y apelación original conservadas, revisión final 9. |
| Retirada de D | El propietario autorizó y ejecutó su desactivación. Comprobó que la sesión con MFA de D dejó de acceder al panel. Cuenta e historial conservados. |
| Pausas | Dos pausas superpuestas, entrega pendiente cancelada, A/B bloqueados al reprogramar y sin permiso para retirarlas. Retirar una no levantó la restante. |
| Recuperación | Tras retirar ambas, B propuso una nueva cita y A confirmó. La entrega anterior siguió cancelada y la nueva tiene otro ID/revisión de cita. |
| Etiquetas | Se eliminó la clase de modalidad `fixed`, que coincidía con `position: fixed` de Tailwind. Se usan clases `sale-badge--*`, manteniendo colores y contenido en detalle, tarjetas y vista previa. |

La prueba de apelación acredita separación técnica entre cuentas. **Dos cuentas de la misma persona no acreditan revisión humana independiente en producción.** D conserva únicamente su cuenta personal y MFA, con su rol temporal desactivado.

## Correcciones de interfaz incluidas

- Un solo control de actualización por expediente y confirmación visible de consulta.
- Formulario de reclamación completo desde el inicio, contexto válido por defecto, explicación del envío y acceso al expediente existente.
- MFA con detección de pendientes desde `all`, control de duplicados, QR proporcionado y alternativa manual. Reinicio de pendientes propios con confirmación; sin borrar factores verificados.
- Peticiones de información marcadas como respondidas sin fingir un cambio de estado administrativo automático.
- Lista de pausas, alcance, vencimiento y retiro individual justificado. La interfaz evita volver a aplicar un alcance ya cubierto. La RPC conserva la posibilidad de pausas superpuestas: no se promete idempotencia transaccional de altas concurrentes.

## Límites y comprobaciones aún no realizadas

- No se esperó una hora completa para comprobar el vencimiento natural de una pausa. Se verificó el predicado SQL y el tratamiento local de vencimiento con reloj de servidor; el retiro manual sí se probó realmente.
- No se ejecutó una carrera real entre dos moderadores con MFA. Existe comprobación de revisión y bloqueo de filas en SQL; no equivale a una prueba de carga/concurrencia completa.
- No hubo navegador conectado para inspección visual del desplazamiento ni pruebas físicas en iPhone, Android, tablets o plegables. Se revisaron CSS responsive, renderizado y ausencia de clases de posicionamiento en las tres modalidades y superficies.
- Un hash protege integridad posterior a la subida, no autenticidad previa ni ausencia de malware. Faltan análisis de malware, política operativa de retención, cuotas agregadas y limpieza supervisada de pendientes.
- `reviewer` tiene acceso a expedientes elegibles ajenos; no está restringido técnicamente a fixtures ni tiene vencimiento automático. Por eso D fue desactivada. La autoridad dueña de la base de datos es una frontera de confianza.
- El expediente técnico de pausa permanece abierto con las dos pausas retiradas y trazabilidad íntegra. Los fixtures se conservan; no son publicaciones comerciales ni incidentes reales.
- No hay pagos, transferencias, reembolsos, liberaciones de dinero, protección física garantizada ni decisiones de culpabilidad por QR/GPS.

## Verificación local y publicación

Comandos finales: `npm test`, `npm run lint`, `npm run build` y `git diff --check`. Los scripts remotos son optativos y dependen del estado de sus fixtures; no repetir una instalación o un escenario cerrado para intentar ponerlos en verde.

Antes de publicar: comprobar archivos nuevos/modificados y exclusión de `.env*`, `.cache`, documentos y resultados privados. No hacer `push --force`. El propietario autorizó la publicación a `main` mediante commit y push normales después de las verificaciones. El historial de Git registra el resultado; las credenciales y evidencias privadas no forman parte de la publicación.
