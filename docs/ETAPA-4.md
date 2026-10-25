# Etapa 4: chat privado y voz

Estado: migración 004 instalada por el propietario, chat conectado y 22 comprobaciones remotas aprobadas con las cuentas A, B y C. Interfaz integrada con el diseño existente. Audio pendiente de proveedor: el botón de teléfono está deshabilitado y etiquetado «Voz pendiente».

## Instalación existente: no repetir migraciones

El propietario confirmó la aplicación completa de `supabase/migrations/202610240004_private_chat.sql`. No repetir esta migración ni las anteriores.

La migración crea siete tablas nuevas, nueve funciones y políticas RLS. No reemplaza funciones o tablas anteriores ni borra datos existentes. Es una transacción: un error impide confirmar sus cambios. Si las tablas nuevas ya existen, no repetirla: revisar primero la instalación. La función de desbloqueo contiene una eliminación limitada al bloqueo creado por quien la invoca; esa operación no se ejecuta al instalar la migración.

La 004 añadió cinco tablas a `supabase_realtime`. Posteriormente el propietario retiró **solo `user_blocks`** desde Database → Publications y conservó la tabla y sus datos. Esta configuración forma parte de la instalación: para un despliegue nuevo, retirar también esa tabla después de instalar la 004. No se reescribió la migración aplicada. Supabase no aplica RLS a eventos DELETE; no transmitir esa tabla evita revelar los identificadores de un bloqueo al desbloquear. El cliente consulta bloqueos por RPC/lectura autorizada y no necesita sus eventos. La prueba remota confirmó que los cambios de bloques no llegan por Realtime y que los mensajes sí llegan.

El tráfico Realtime está sujeto a las cuotas y facturación del proyecto Supabase existente; no se contrató un plan adicional.

## Chat operativo

- «Contactar al vendedor» crea o recupera una solicitud pendiente y abre su conversación; la interfaz lo explica. No compra ni reserva el artículo.
- Bandeja «Mensajes» con nombre público, artículo, último mensaje, fecha y no leídos. Historial de cincuenta mensajes por página y carga de anteriores.
- Recepción mediante Postgres Changes con RLS; sincronización al reconectar y respaldo cada quince segundos mientras la página está visible. No es una promesa de conexión del destinatario ni de recepción en segundo plano.
- Notificaciones internas sin mostrar el contenido del mensaje fuera de la conversación. No se registran números telefónicos.
- Accesos al producto y a la solicitud/cita concreta. Acceso al chat desde las solicitudes pendientes y aceptadas.
- Bloquear/desbloquear y reportar desde la conversación. No hay edición ni eliminación de mensajes por el cliente.

## Modelo y permisos comprobados

- Una conversación por solicitud de intercambio, con sus compradores y vendedores reales; ningún usuario puede añadir participantes arbitrarios.
- Mensajes y cursores de lectura persistentes. Secuencias asignadas por servidor y nonce para evitar duplicados al reintentar.
- Consultas privadas mediante RLS. Escrituras directas revocadas; las RPC verifican la identidad del JWT, pertenencia y estado de la operación.
- Envíos permitidos en solicitudes pendientes o aceptadas; después del cierre permanece el historial de sus participantes.
- Bloqueo en cualquiera de los dos sentidos impide nuevos mensajes y aperturas. El historial no se borra por bloquear.
- Límite por remitente de cinco mensajes en cinco segundos y sesenta por minuto, serializado para resistir solicitudes simultáneas.
- Reportes privados, máximo cinco diarios por usuario. Se almacenan para revisión: todavía no existe panel ni equipo de moderación o atención inmediata.
- Base de estados de llamadas sin permisos de escritura del cliente y sin RPC para iniciarlas o incorporarse. Crear la tabla no habilita audio.

Validación local: `npm run test:sql` analiza las instrucciones SQL, todos los cuerpos SQL/PL/pgSQL y el bloque de publicación con libpg-query. Comprueba límites estructurales de la migración, pero no resuelve objetos del catálogo remoto ni sustituye pruebas reales de RLS.

### Pruebas reales

`npm run test:chat` usa solo las credenciales de A/B/C de `.env.test.local` excluido de Git. No imprime contraseñas, claves ni respuestas privadas. Las 22 comprobaciones verifican salud, siete tablas, apertura idempotente, dos participantes, recepción Realtime de B, ausencia de eventos de mensajes para C, reintentos sin duplicados, no leídos, persistencia tras volver a iniciar sesión, respuestas, denegaciones de C/anónimo, suplantación y escrituras directas prohibidas, bloqueos bidireccionales, exclusión de bloqueos de Realtime, desbloqueo propio, reportes privados, voz deshabilitada y límites de envío.

Se retiraron únicamente el producto y la fotografía creados por la prueba; las solicitudes canceladas, mensajes y reportes de prueba quedan en el historial privado por diseño. Los reportes están marcados como pruebas, no denuncias reales. La prueba limita su alcance a las operaciones ejercitadas; no equivale a una auditoría de penetración completa ni a una lectura administrativa del catálogo de políticas del servidor.

La comprobación local incluye renderizado de estados vacíos, nombres escapados, no leídos, bloqueo/reporte y botón de voz deshabilitado. No hubo navegador conectado disponible en esta sesión: falta comprobación visual e interacción completa en navegadores y dispositivos reales; el renderizado de servidor no las sustituye.

### Probar desde la página con dos cuentas

1. Ejecutar `npm run dev` y abrir la dirección que indique Vite. Usar dos perfiles de navegador o uno normal y otro privado; iniciar sesión en A y B.
2. Publicar desde A un artículo y, desde B, abrirlo y pulsar «Contactar al vendedor». Enviar un mensaje.
3. En A abrir «Mensajes». Debe aparecer la conversación, su contador y el mensaje. Responder y comprobar recepción en B sin recargar.
4. Cerrar sesión y volver a entrar: el historial debe permanecer. Leer la conversación debe bajar el contador propio.
5. Usar «Ver solicitud y cita»; A puede aceptar la solicitud y coordinar una cita con B. Volver por «Abrir chat del intercambio».
6. Bloquear desde una cuenta: no deben aceptarse mensajes desde ninguna de las dos. Desbloquear desde la cuenta que creó el bloqueo. Se conserva el historial.
7. Con C, abrir la URL de conversación de A/B: no debe aparecer su historial ni permitir escribir.

Al cerrar o cancelar el intercambio se conserva su conversación como historial, pero no se permiten nuevos mensajes. Para comunicar un problema, usar Reportar; todavía falta el panel y proceso de moderación.

## Voz: opciones antes de activar servicios

Revisión de documentación oficial del 24 de octubre de 2026; confirmar tarifas en el panel antes de contratar.

| Opción | Configuración y costos |
| --- | --- |
| LiveKit Cloud, propuesta para esta aplicación | Transporte WebRTC administrado. Build anuncia USD 0/mes, 5,000 minutos de participantes WebRTC y 50 GB de salida incluidos; Ship parte de USD 50/mes, incluye 150,000 minutos y 250 GB, con excedentes anunciados de USD 0.0005/minuto y USD 0.12/GB. No son minutos de llamada entre dos personas: dos participantes conectados diez minutos consumen veinte minutos de participantes. Confirmar límites, impuestos y tarifas antes de activar. |
| Infraestructura propia | Operar LiveKit o WebRTC con señalización, STUN y TURN. Requiere servidor, TLS, puertos, monitoreo y ancho de banda; el software abierto no elimina los costos de operación ni garantiza conectividad móvil sin TURN. |

No se ha contratado ni activado un proveedor. No se usará telefonía convencional, SIP ni números personales.

Para LiveKit se necesitará un proyecto, su URL y credenciales de API almacenadas exclusivamente como secretos de una función de servidor (por ejemplo, Supabase Edge Functions). Nunca usar variables `VITE_` para secretos. La función deberá verificar el JWT con Supabase, consultar participantes, bloqueos, estado y límites de llamadas y emitir un token de sala con permisos mínimos y vigencia breve. El navegador no decidirá por sí mismo quién puede entrar.

Cuando decidas habilitar voz: crear un proyecto LiveKit Cloud en el plan elegido y revisar su facturación/límites; guardar `LIVEKIT_URL`, `LIVEKIT_API_KEY` y `LIVEKIT_API_SECRET` exclusivamente en Supabase → Edge Functions → Secrets. No copiarlos al chat, a Git ni a variables VITE_. Después habrá que desarrollar y desplegar el servidor de autorizaciones, estados de llamada, revocación y SDK de audio del navegador. Añadir los secretos por sí solo no activa llamadas y todavía no se deben pulsar pruebas con consumo. Los permisos del micrófono requerirán HTTPS o localhost.

La caducidad del token controla la entrada inicial; no basta para expulsar a alguien ya conectado o impedir reconexiones. Bloquear, cancelar o finalizar exigirá invalidar el estado de la llamada, impedir nuevas autorizaciones y cerrar la sesión en el proveedor. Esto debe implementarse y probarse antes de anunciar llamadas operativas.

No se habilitarán grabaciones automáticas ni se anunciará cifrado de extremo a extremo. Las llamadas inicialmente requerirán que ambos usuarios tengan la página abierta. Push, llamadas con aplicación cerrada y la integración nativa con Capacitor requerirán trabajo y pruebas adicionales.

Fuentes: [tarifas LiveKit](https://livekit.com/pricing), [medición de consumo](https://docs.livekit.io/deploy/admin/billing/), [tokens y permisos](https://docs.livekit.io/frontends/reference/tokens-grants/), [Realtime y RLS de Supabase](https://supabase.com/docs/guides/realtime/postgres-changes).

## Pendiente

1. Elegir y configurar el proveedor de audio antes de instalar su SDK o desplegar el servidor de tokens. Probar aceptación, rechazo, micrófono, silencio, finalización, reconexión, acoso y aislamiento de C.
2. Verificar interacción y diseño en dispositivos reales; probar teclado móvil, suspensión/reanudación y redes inestables.
3. Implementar el panel y proceso de revisión de reportes. No se promete moderación automática.

No hay cambios en pagos, pujas ni liberación de dinero.
