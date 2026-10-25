# Motor de subastas conectado

Alcance: únicamente subastas reales y coordinación. Sin cobros, depósitos, billeteras, QR de entrega, liberaciones o reclamaciones.

La migración 005 fue aplicada por el propietario. **No volver a ejecutar ninguna migración ya aplicada.** El formulario, catálogo, detalle, historial, avisos y reloj están conectados al motor. Se conservan React, Vite, Tailwind, Lucide y las versiones instaladas; no se añadieron dependencias.

## Verificación de la instalación

El propietario ejecutó el SELECT de auditoría y compartió sus resultados: nueve tablas con RLS, permisos de lectura delimitados, ninguna escritura directa de clientes, funciones internas sin ejecución pública, search_path fijo, tarea Cron activa cada minuto y solo auctions/auction_bid_history/auction_notifications publicadas por Realtime. Las condiciones y definiciones coincidieron con la migración local. Se comprobaron operativamente los triggers mediante intentos de manipulación rechazados.

Pasaron **21 comprobaciones remotas**: trece de publicación/pujas/seguridad y ocho del reloj/cierre. A creó tres subastas técnicas identificadas claramente en el título, B y C pujaron con sus sesiones reales. No se presentaron como artículos comerciales. Su historial y fotos se conservan conforme a las reglas de auditoría; no se borraron publicaciones existentes.

El propietario ejecutó una vez el fixture administrativo `.cache/auction-clock-test.sql`, limitado a dos IDs de las subastas técnicas, para acortar sus plazos y registrar el ajuste. No es una migración ni una puerta trasera pública. Se verificó una extensión anti-snipe de **120 segundos**, la misma fecha de cierre para A/B/C y el cierre autónomo con/sin pujas. Durante la espera se usaron solo lecturas directas: ninguna llamada a auction_snapshot o puja pudo provocar el cierre. Después se verificaron el ganador, el rechazo de pujas tardías y la coordinación autorizada por chat/citas. Ningún resultado declaró un pago o una entrega.

La tarea `pendejaditas-auction-clock` ejecuta `public.advance_auction_clock()` cada minuto en lotes de hasta 200. Puede persistir el cierre hasta aproximadamente un minuto después del plazo (más si hay atraso o fallos). Las pujas se rechazan desde el plazo exacto usando la hora del servidor. La consulta de detalle también puede completar un cierre vencido. Monitorear Cron en el panel y su historial de ejecuciones; una prueba favorable no garantiza disponibilidad futura.

## Cómo probar desde la página

1. Ejecutar `npm run dev` y abrir la dirección que muestre Vite. Usar dos perfiles de navegador para A y B.
2. Desde A, Publicar artículo → Subasta. Subir la fotografía principal, completar datos, precio inicial, incremento, duración, inicio y condiciones. Opcionalmente elegir hasta cuatro fotos adicionales.
3. Confirmar la publicación. Desde B, abrir Subastas, seleccionar el artículo y enviar una puja igual o mayor que el mínimo indicado. Confirmar el importe; no se solicita tarjeta ni se cobra.
4. Consultar el historial desde A y B sin recargar. A no puede pujar sobre su artículo. Para superar a B se necesita C: el mejor postor no puede aumentarse a sí mismo.
5. Consultar Avisos de subastas para ver cuándo se supera una puja o finaliza una subasta. Los avisos solo se leen desde su cuenta y el estado de lectura persiste.
6. Una puja válida en el último minuto añade dos minutos al cierre anterior. Al vencer, consultar el resultado provisional; vendedor y ganador pueden abrir la coordinación por chat. Las citas conservan su aceptación y reglas actuales.

El precio del catálogo y el detalle se actualizan por Realtime; el detalle tiene sincronización de respaldo cada diez segundos. El contador usa una referencia de hora del servidor y tiempo monotónico del dispositivo: no calcula ganadores o autorizaciones con el reloj del navegador. Al llegar a cero indica que verifica el cierre hasta obtener el estado persistido.

Publicar usa dos pasos del motor existente: guardar artículo/fotos y convertirlo a subasta. Si falla el segundo, la interfaz conserva el identificador para reintentar y avisa expresamente que el artículo base está guardado pero la subasta no está confirmada. No anuncia éxito sin confirmación. El artículo base puede permanecer como precio fijo si se abandona ese intento; revisar el perfil. Una futura RPC de publicación integral podrá hacer esos pasos en una sola transacción.

Los datos y reglas quedan fijos al publicar. Se oculta editar/eliminar para subastas, y el servidor también lo impide. La cancelación con motivo solo aparece sin pujas y antes del plazo. Las modalidades de precio fijo y precio negociable se conservan; la negociación monetaria sigue pendiente.

## Cambios de esquema, sin borrar datos

Nueve tablas nuevas: `auctions`, `auction_photos`, `auction_bids`, `auction_bid_history`, `auction_results`, `auction_bid_attempts`, `auction_notifications`, `auction_audit_events` y `auction_risk_flags`. Todas con RLS. Sin permisos de escritura directa para clientes.

La migración reemplaza **solo la restricción CHECK** `products_sale_type_check` para ampliar las modalidades a `fixed`, `offers` y `auction`. No borra columnas, tablas o publicaciones, y todos los valores existentes siguen siendo válidos. No reemplaza las políticas actuales. Añade triggers para impedir cambiar o borrar artículos de subastas y para impedir solicitudes de intercambio ajenas al ganador provisional. Añade una política restrictiva a Storage que conserva las fotos referenciadas por galerías de subastas.

La transacción evita confirmar una instalación parcial si hay un error. Se comprueban previamente las tablas base, Realtime, Cron y la ausencia de una tarea con el mismo nombre. No se usa `CREATE TABLE IF NOT EXISTS` para ocultar una instalación incompleta. El archivo no se debe repetir si ya terminó correctamente.

Solo `auctions`, `auction_bid_history` y `auction_notifications` se añaden a Realtime. Mantener **`user_blocks` excluida**, como se configuró durante el chat. Los datos privados de pujas, resultados, auditoría y riesgos no se publican en Realtime.

## Reglas del motor

- El vendedor convierte un artículo propio sin solicitudes pendientes/aceptadas a subasta mediante `create_auction`. Una subasta por publicación. Publicación y fotos deben existir realmente; galería de una a cinco imágenes del vendedor, la principal primero.
- Precio inicial entre 1 y 1,000,000 MXN; incremento de 1 a 100,000 MXN, siempre enteros. Duraciones de 1, 24, 48, 72 o 168 horas. Inicio inmediato o programado mediante demora de hasta 24 horas calculada por el servidor. Condiciones públicas de 20 a 3,000 caracteres.
- Reglas, título, descripción y fotos de la publicación quedan fijos desde que se publica. Esta versión es más estricta que bloquear solo después de la primera puja, para evitar que cambie lo que ya vieron los participantes. No se puede reconvertir ni borrar una subasta cancelada para ocultar su historial.
- Primera puja mínima igual al precio inicial; siguientes al menos la puja más alta más el incremento. El mejor postor no puede pujar otra vez hasta ser superado. No hay pujas propias ni importes fraccionarios o fuera de límite.
- El cliente propone un importe y un nonce UUID; no envía una identidad confiable, hora de aceptación, contador, mejor postor o ganador. El servidor usa `auth.uid()`, hora PostgreSQL, bloqueo por usuario y bloqueo del artículo/subasta. El orden de aceptación queda registrado mediante secuencias del servidor.
- Puja válida dentro del último minuto: **sumar dos minutos al cierre anterior**, guardarlo, incrementar revisión y auditar la extensión. No hay extensiones por intentos rechazados. Una puja al llegar el cierre ya no se acepta. No se impone un máximo oculto de extensiones.
- Nonce repetido por el mismo postor y subasta devuelve la puja original; cambiar su importe con el mismo nonce se rechaza. Los intentos rechazados no crean pujas. Hasta cinco intentos por diez segundos y treinta por minuto por usuario, contando rechazos, sin depender del navegador. Máximo veinte subastas creadas al día por vendedor.
- Se respetan bloqueos entre vendedor y postor. No hay identificación de dispositivos ni uso del GPS como prueba.
- El vendedor solo cancela mientras la subasta no haya vencido y tenga cero pujas, con motivo de 10 a 500 caracteres. Después de recibir pujas, la intervención administrativa queda pendiente de un proceso posterior; no se permite al vendedor cancelar para evitar un precio que no le guste.

Las RPC de pujas devuelven `{accepted:false, code:...}` en rechazos de negocio para poder conservar los intentos auditados dentro de la transacción. Un HTTP 200 **no significa** una puja aceptada. `src/lib/auctions-core.js` contempla esa distinción y no actualiza importes ni ganadores localmente.

## Estados y privacidad

Estados: `scheduled`, `active`, `ended_no_bids`, `ended_winner`, `cancelled`. El resultado con ganador lleva además `formalization_status='pending'`: pendiente de formalización, sin pago. Al abrir coordinación pasa a `coordination`; tampoco representa compra, pago o entrega.

El público ve importes, secuencias, fechas y alias por subasta. No ve nonces ni IDs privados de postores. Cada postor puede leer su propio registro completo; el vendedor puede leer las pujas de su subasta. El resultado nominal se reserva al vendedor y ganador. Notificaciones solo para su destinatario, con avisos al ser superado y al cerrar. Intentos, auditoría y señales de riesgo solo para el servidor/administración, sin permisos de lectura del navegador.

El cierre obtiene el ganador del último registro válido bajo bloqueo y conserva su importe. No hay una RPC para que el usuario se declare ganador. El ganador provisional y el vendedor pueden crear o recuperar la solicitud de coordinación; las funciones existentes de chat y citas comprueban después sus participantes y reglas. Las solicitudes sobre el artículo durante la subasta o de otro comprador después del cierre son rechazadas por un trigger, incluso usando la API anterior.

### Señales de posible coordinación

Se marca para revisión una alternancia rápida de dos cuentas: al menos seis pujas en noventa segundos y exactamente dos postores en esa ventana. Es una **heurística**, puede señalar competencia legítima y no prueba fraude. No sanciona ni invalida resultados automáticamente. Faltan el panel y proceso de investigación, revisión humana y medidas contra múltiples cuentas; no se anuncia detección infalible de colusión.

## Pruebas y límites

- `npm run test:auctions`: publica subastas técnicas reales y prueba A/B/C, Realtime, incremento, simultaneidad, no leídos privados, suplantación, APIs internas, cancelación y límites. Conserva sus registros. Cada ejecución crea nuevas subastas y consume el límite diario del vendedor; no ejecutar repetidamente sin necesidad.
- `npm run test:auctions:clock`: requiere el estado y fixture de la ejecución anterior; espera el ajuste administrativo solo de esas subastas y observa anti-snipe y Cron. No debe ejecutarse sobre subastas comerciales ni repetirse sobre fixtures ya cerrados.
- `npm test`: validación de reglas, contador con referencia de servidor, contrato de RPC, renderizado y regresiones del marketplace/chat. `npm run test:sql` analiza sintaxis, no aplica migraciones.
- `npm run lint` y `npm run build`: comprobaciones locales. La revisión mecánica de interfaz no detectó incidencias.

No hay navegador conectado disponible en esta sesión: falta verificar visualmente e interactuar en iPhone, Android, tablets y escritorio reales. El renderizado local no sustituye esas pruebas. También faltan pruebas de carga a escala, activación programada a largo plazo, interrupciones prolongadas y casos límite adicionales del reloj bajo estrés.

La detección de coordinación sigue siendo una heurística privada pendiente de panel y proceso humano; no una garantía contra cuentas múltiples. No se probó ni se activó un flujo financiero.

## Contratos para etapas posteriores, sin implementarlas

- **QR dinámico:** partir de una operación de compra formalizada y sus participantes, no de un bid ganador. Tokens firmados de corta duración, uso único, revocación y aceptación de ambas partes en servidor. No liberar dinero solo por escanear un QR.
- **Reclamaciones:** referenciar operación, auction/bid/result y pruebas con acceso privado; registrar plazos, respuestas y eventos inmutables.
- **Intervención administrativa:** autorización de servidor separada de perfiles públicos o metadatos editables; revisión de señales, motivos, evidencia y bitácora. No conceder privilegios administrativos desde el frontend.
- **Pagos protegidos en México:** evaluar proveedor e integración permitida antes de contratar. Orden y estado de pago separados del resultado de subasta; webhooks autenticados e idempotentes, conciliación y almacenamiento de importes/moneda del servidor. No llamar «depósito retenido» o «escrow» a funciones que el contrato del proveedor no ofrezca.
- **Reembolsos y contracargos:** operaciones autorizadas por proveedor y estado financiero independiente; eventos y conciliación, sin modificar retroactivamente el historial de pujas o asumir que el QR elimina un contracargo.
