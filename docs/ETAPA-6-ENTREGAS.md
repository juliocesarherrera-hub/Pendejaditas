# Etapa 6: entrega QR conectada a Supabase

La migración 006 fue instalada una sola vez por el propietario. Su diagnóstico confirmó siete tablas con RLS, catorce funciones y tres triggers activos. Se revisaron las condiciones reales, permisos y publicación Realtime. **No repetir migraciones.** La interfaz de entrega, QR local, cámara, confirmaciones, reportes e historial está conectada. No hay pagos ni liberaciones de dinero.

Pasaron **22 comprobaciones remotas distintas con A/B/C**, en dos pasadas del runner principal y una final de seguridad. Se corrigió el runner para respetar límites de emisión y usar revisiones vigentes; no se modificó el motor ni se repitió la migración. Los fixtures administrativos ajustaron exclusivamente citas y la subasta técnicas previamente verificadas. Se conservan sus registros y reportes, explícitamente identificados como pruebas, no incidentes reales.

Las pruebas locales, lint y build pasaron; el detector mecánico de interfaz no encontró incidencias. No había un navegador/dispositivo conectado disponible: **cámara real y compatibilidad visual en Android, iPhone, iPad, tablets y escritorio siguen pendientes de pruebas físicas**. La integración usa APIs y bibliotecas compatibles, pero esto no equivale a certificar todos los navegadores o dispositivos.

## Cómo probar con dos cuentas

1. Ejecutar `npm run dev`. Abrir comprador y vendedor en perfiles/navegadores separados. Para cámara desde un teléfono se requiere HTTPS válido; una URL HTTP de la red local no basta. En la computadora local puede usarse localhost. También está disponible Leer imagen local sin subirla.
2. A publica a precio fijo; B solicita intercambio desde el artículo; A acepta. Acuerdan lugar y fecha, y confirman la cita. Para subasta, primero debe haber ganador provisional y abrir su coordinación canónica.
3. En Mis citas, pulsar Preparar o consultar entrega QR. Esto crea o recupera la operación y conserva el acuerdo. También hay acceso desde la conversación y Mis entregas.
4. **B, comprador, genera y muestra el QR. A, vendedor, lo escanea.** Este es el orden autorizado por el servidor; no funciona al revés. Solo se emite dentro de la ventana de treinta minutos antes y veinticuatro horas después del inicio de la cita. Una cita recién propuesta a una hora todavía requiere esperar para entrar en la ventana.
5. A pulsa Abrir cámara y concede el permiso, o elige una imagen local. Leer el QR no confirma nada. La aplicación valida que corresponda a la operación abierta. A revisa artículo y participantes, marca su declaración y confirma que entregó.
6. B verifica que realmente recibió y revisó el artículo, marca su declaración y confirma recepción. Solo entonces la pantalla mostrará Entrega registrada por ambas partes a partir del estado leído del servidor. No supone compra pagada ni prueba física automática.
7. Consultar historial o abrir Ayuda y revisión privada. Un reporte sin pausa es privado y no detiene la entrega; una pausa sí es visible como estado general. No hay atención inmediata garantizada.

El QR dura 90 segundos y se mantiene solo en memoria. Se oculta al vencer, cambiar de revisión, ocultar la página o perder conexión. No se incluye el secreto en URL, logs, localStorage o sessionStorage. Al cambiar de cuenta se desmonta el detalle. La cámara se detiene al cerrar el lector, ocultar la página, desconectarse o abandonar la vista. Ante una respuesta perdida se consulta el estado del servidor; no se reenvía ni se confirma offline de forma automática.

Se añadieron `qrcode@1.5.4` y `qr-scanner@1.4.2`: generador y lector locales, sin proveedor de pago ni envío de imágenes a un servicio QR externo. El lector tiene alternativa de imagen JPG/PNG/WebP local hasta 10 MB. Los módulos y worker están empaquetados por Vite. Las dependencias existentes conservan sus versiones; npm informó tres vulnerabilidades moderadas y no se aplicaron actualizaciones forzadas.

Fuentes de integración: [lector QR](https://github.com/nimiq/qr-scanner), [generador QR](https://github.com/soldair/node-qrcode), [permiso y contexto seguro de cámara](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

## Esquema instalado

Archivo histórico instalado, `supabase/migrations/202610240006_delivery_qr.sql`:

1. Creó siete tablas con RLS: operaciones, hashes de QR, recibos idempotentes, eventos, intentos, incidentes y bitácora de revisión humana.
2. Creó catorce funciones para validación, creación, emisión, consumo, confirmación, cancelación, reportes y revisión administrativa. Sin permisos de escritura directa desde el navegador.
3. Añadió tres triggers a las tablas existentes: invalidar QR al cambiar solicitud/cita y preservar artículos vinculados a entregas. No reemplazó sus funciones ni políticas anteriores. Los artículos con historial de entrega quedarán protegidos contra eliminación; los vinculados a una entrega activa/registrada también contra edición.
4. Añadió solo operaciones y eventos compartidos a Realtime. **Nunca** tokens/hashes, recibos, incidentes, intentos o notas administrativas.
5. Ejecutó la recarga de esquema y confirmó la transacción. No borra datos, no repite migraciones, no instala extensiones, no crea tareas Cron y no implementa pagos.

Todo está envuelto en BEGIN/COMMIT. Si la instalación completa falla, no se deben aplicar fragmentos ni borrar objetos para reintentar: revisar primero el error. El análisis local de PostgreSQL comprueba sintaxis; no demuestra que todas las dependencias y permisos remotos sean correctos.

El propietario confirmó Success. No rows returned. No volver a ejecutar el archivo 006. El diagnóstico de solo lectura `supabase/diagnostics/audit-delivery.sql` ya se ejecutó y sus resultados fueron revisados.

## Qué operación admite una entrega

La aplicación aún no tiene órdenes pagadas. El QR se vincula a una **solicitud de intercambio aceptada y una cita confirmada**, no a un pago supuesto. Guarda comprador, vendedor, artículo, título, importe de referencia y revisión de la cita.

- Precio fijo: participantes de la solicitud aceptada, con artículo existente y vendedor propietario.
- Subasta: debe haber finalizado con ganador provisional; comprador y solicitud deben coincidir con `auction_results` y la coordinación canónica creada en la etapa 5.
- Precio negociable: se deja fuera hasta implementar la aceptación real de ofertas. No se inventa un importe acordado.
- Un artículo solo puede tener una operación no cancelada. Evita dos entregas paralelas o duplicar una entrega registrada. La creación repetida para la misma solicitud/revisión recupera la operación existente.

Se requiere una cita confirmada. Emisión, consumo y confirmación están limitados a la ventana de treinta minutos antes y veinticuatro horas después de su inicio, usando la hora del servidor. Esta ventana es una regla operativa configurable en una futura revisión, no evidencia de proximidad ni entrega.

## Protocolo de dos confirmaciones

1. Cualquiera de las partes abre la operación y revisa el acuerdo. Solo el comprador puede emitir el QR temporal.
2. El servidor genera un secreto opaco con dos UUID v4 independientes (244 bits aleatorios). Devuelve el payload una vez y guarda **únicamente SHA-256**, operación, revisión, vencimiento y estados de uso/revocación.
3. El formato es `pjd:delivery:v1:<operation_uuid>:<secreto>`, no una URL pública. Caduca en **90 segundos**. Emitir otro revoca el anterior.
4. El vendedor escanea, revisa el artículo/participantes y pulsa expresamente «Confirmo que entregué el artículo». Decodificar una imagen por sí solo no debe ejecutar la RPC. La validación y el consumo se realizan bajo bloqueo de filas en Supabase.
5. El QR queda consumido. El estado pasa a **pendiente de confirmación del comprador**. Todavía no hay entrega registrada completa.
6. El comprador revisa y pulsa «Confirmo que recibí el artículo». El servidor exige comprador correcto, revisión vigente, contexto válido y confirmación del vendedor. Registra fecha y evento; **no cobra ni libera dinero**.
7. Si pasan cinco minutos sin la confirmación final, no se confirma automáticamente. El comprador podrá emitir un QR nuevo y repetir las dos confirmaciones. No resucita un QR ya usado.

El QR es un credencial temporal: no enviarlo al chat, a un servicio generador de imágenes, a telemetría, a parámetros de URL, a almacenamiento persistente o a registros de errores. La representación y el escaneo serán locales. El contrato de cliente ya rechaza formatos, versiones y operaciones incorrectas y no refleja errores del servidor que pudieran incluir el secreto. Los registros de infraestructura deben revisarse al integrar el servicio; no se puede prometer que un dispositivo comprometido nunca exponga la pantalla o el tráfico autorizado.

La entropía aleatoria y el hash dificultan fabricar otro QR válido, pero **no se anuncia un QR “imposible de copiar”**. Una captura o retransmisión conserva el mismo secreto mientras siga vigente; solo vendedor autorizado puede consumirlo y el comprador debe confirmar después. Dos participantes pueden mentir o sufrir coacción: el sistema registra sus declaraciones, no prueba físicamente el intercambio ni garantiza identidad real, ubicación o seguridad personal. No usa GPS ni NIP de emergencia.

Fuentes de primitivas PostgreSQL: [UUID aleatorio v4](https://www.postgresql.org/docs/current/functions-uuid.html), [SHA-256 de datos binarios](https://www.postgresql.org/docs/current/functions-binarystring.html).

## Reutilización, concurrencia y pérdida de conexión

Cada consumo/confirmación incluye un UUID de intento. La combinación operación/usuario/nonce es única; cambiar la acción o los datos con el mismo nonce se rechaza. Dos escaneos distintos compiten por el mismo registro bajo bloqueo: solo uno consume el token. Repetir **el mismo intento** devuelve su recibo original, no otro consumo ni una segunda entrega.

Los cambios usan el orden artículo → solicitud → cita → entrega. La cancelación o reprogramación se serializa con el escaneo y la confirmación. La hora, identidad, expiración, revisión, propietario y ganador se verifican en el servidor. Ningún cliente puede escribir el estado `recorded`, un hash o un resultado directamente.

Un error de red no demuestra éxito ni fracaso. Mantener el nonce y consultar el estado al reconectar; nunca confirmar offline, mostrar un éxito local o retransmitir automáticamente una entrega sin consentimiento. Un recibo idempotente describe la acción original; podría haberse abierto una revisión después. `delivery-core.js` exige refrescar el estado tras cualquier respuesta y diferencia un rechazo de negocio HTTP 200 de una acción aceptada.

Límites: veinte intentos por minuto por cuenta y tres emisiones por minuto; también cuentan QR inválidos/rechazos autorizados. Máximo cinco reportes diarios. Las lecturas siguen bajo RLS. Deben sumarse controles de infraestructura y monitorización al escalar; el límite SQL no sustituye protección global contra denegación de servicio.

## Cancelaciones y desacuerdos

- Antes de registrar recepción, cualquiera puede cancelar una entrega lista o pendiente. Se revocan QR y se conserva el historial.
- Cambiar/reprogramar/cancelar la cita o cambiar el estado de la solicitud invalida una entrega pendiente. La siguiente entrega requiere una revisión confirmada nueva; no se reabre el código anterior.
- Una entrega registrada no se elimina ni se cancela retrospectivamente. Una operación en revisión o registrada conserva el acuerdo; los intentos de modificar su cita se rechazan. Usar un reporte para discutir lo ocurrido.
- Un desacuerdo puede pausar la operación para revisión. Si la confirmación y el reporte son simultáneos, los bloqueos establecen el orden: pausa primero impide confirmar; reporte posterior conserva la fecha registrada y añade revisión, sin borrar el hecho declarado.

## Reporte discreto y revisión humana

Hay dos acciones distintas, sin NIP:

- **Guardar reporte privado:** `p_pause=false` por defecto. Solo lo leen autor y administrador. No genera mensajes de chat, eventos compartidos ni cambios visibles para el otro participante. **No pausa la entrega** y no promete atención inmediata.
- **Detener confirmación y pedir revisión:** `p_pause=true`. Revoca los códigos y coloca la operación en revisión. La otra persona verá que está pausada, aunque no el motivo, autor o detalles. La pausa puede hacer inferible que existe un problema: no prometer invisibilidad.

La revisión inicial será manual por el propietario de la base, mediante `review_delivery_incident`, **sin permiso para anon, authenticated o service_role**. Su ejecución se concede solo a `postgres`; no usa un campo del perfil o metadatos editables como prueba de ser administrador. Permite reconocer, cerrar un reporte y reanudar/cancelar una entrega aún no registrada en revisión. Cada decisión exige justificación y queda en una bitácora privada. No permite revertir `recorded_at` ni mover dinero. Si hay otros reportes con pausa pendientes, no reanuda unilateralmente la entrega.

La bitácora identifica el rol de base de datos de la sesión, no inventa el nombre del revisor humano. Falta definir responsables, acceso individual, tiempos de atención y panel administrativo. La cola técnica no significa que haya personal disponible permanentemente. El reporte no es un botón de protección física, respuesta policial o atención de emergencias.

## Verificaciones y pendientes

- `npm run test:deliveries:setup` crea seis artículos y acuerdos técnicos reales y prepara un fixture administrativo privado en .cache para situarlos en la ventana de prueba. No ejecutar repetidamente sobre una base comercial sin necesidad.
- `npm run test:deliveries` prueba roles, QR falsificados/rotados, idempotencia concurrente, confirmaciones, persistencia, cancelación, reprogramación, reportes y subastas. Respeta los límites del servidor. Para continuar pruebas aún pendientes se usó --remaining tras ajustar solo sus citas técnicas; los casos ya registrados no se reabren.
- `npm run test:deliveries:security` verificó Realtime para A y exclusión de C, y que intentos rechazados consumen el límite global.
- `npm test`, `npm run test:sql`, lint y build cubren sintaxis, contrato, renderizado y regresiones. No prueban una cámara física.

Evidencia remota: 13 comprobaciones iniciales, siete adicionales distintas al reanudar y dos finales de seguridad. Los dos checks de sesión/creación se repitieron al reanudar y no se cuentan dos veces. Se esperaron 91.5 segundos reales para comprobar caducidad, sin alterar el token ni su plazo. La entrega de precio fijo y la de subasta quedaron registradas por ambos participantes. Se probó el acceso y recepción de eventos de C, las funciones administrativas denegadas, las escrituras directas bloqueadas y los reportes privados. No se ejecutaron pagos ni se modificaron publicaciones comerciales.

Pendiente: prueba física de cámara, permisos, cambios de dispositivo y retorno desde suspensión; confirmación tardía de cinco minutos bajo prueba real; pérdida efectiva de red durante commit y casos de carga. El contrato sí tiene pruebas locales para respuestas perdidas y no supuesto éxito. La revisión administrativa está restringida al propietario, pero falta probar decisiones reales autorizadas, asignar responsables y construir un panel con acceso individual. No hay personal ni tiempo de respuesta garantizado por esta implementación.

Los detalles de la matriz de seguridad están en `docs/PRUEBAS-ETAPA-6.md`. La preparación del commit/push se realiza solo después de las verificaciones disponibles, sin incluir .env, fixtures ni secretos.
