# Etapa 3: lugares públicos y citas privadas

## Estado actual

El frontend está implementado y el propietario confirmó la aplicación completa de las migraciones 002 y 003. Las cuatro tablas nuevas, los lugares públicos y las RPC responden. El flujo remoto pasó con tres cuentas: A y B como participantes y C como usuario ajeno. La concurrencia, revisión obsoleta, reprogramación, rechazo, cancelación, historial, privacidad y bloqueo de escrituras directas aprobaron.

## Corrección puntual 003

La migración 002 usó SQLSTATE 40001 para rechazar una revisión obsoleta. Es un código reservado para fallos de serialización; PostgREST puede reintentar estas transacciones y dejar la petición esperando. Esto se observó en la prueba real: la confirmación válida se guardó una sola vez y la petición obsoleta no terminaba. [Referencia del proyecto PostgREST](https://github.com/PostgREST/postgrest/issues/3673).

`202610240003_meetings_conflicts.sql` usa CREATE OR REPLACE únicamente para `respond_exchange` y `change_appointment`, sustituyendo esos dos códigos por P0001. Conserva firmas, restricciones, locks, RLS, tablas y datos. El analizador PostgreSQL comprobó ambos cuerpos. No repitas 001 ni 002: aplica únicamente 003 sobre el proyecto que ya tiene citas instaladas. También se limita la espera HTTP a 20 segundos.

El intento de prueba interrumpido se canceló y se eliminaron su artículo/fotografía temporales. El historial privado permanece por diseño. No se borraron citas o productos anteriores del usuario.

La consulta `supabase/diagnostics/check-meetings-installation.sql` se preparó para diagnosticar el primer fallo sin modificar datos. Ahora que 002 y 003 ya están instaladas, no se deben repetir. Para instalaciones parciales futuras, revisar los objetos existentes antes de aplicar correcciones puntuales.

El archivo actualizado es `supabase/migrations/202610240002_meetings.sql`. Contiene BEGIN, 29 instrucciones, cuatro funciones completas y COMMIT seguido de una marca END. No se debe ejecutar de nuevo `202610240001_marketplace.sql`.

```bash
npm run test:sql
npm run lint
npm test
npm run build
```

`test:sql` utiliza libpg-query 18.2.0 como herramienta de desarrollo: analiza el SQL, los tres cuerpos PL/pgSQL y el cuerpo SQL de la función de comprobación. Comprueba además que la variante original vuelve a producir el error. No ejecuta SQL en Supabase, no crea tablas ni garantiza por sí solo permisos o ejecución en la versión del servidor. El control remoto se hará después de aplicar la migración.

## Lugares investigados

| Establecimiento | Dirección verificada | Zona |
| --- | --- | --- |
| Antea Lifestyle Center | Carretera San Luis Potosí–Querétaro 12401, El Salitre, C.P. 76127, Santiago de Querétaro, Querétaro | El Salitre |
| Plaza Puerta La Victoria | Av. Constituyentes 40, Col. Villas del Sol, Querétaro, Querétaro | Villas del Sol |

Fuentes consultadas el 24 de octubre de 2026: [contacto oficial de Antea](https://antea.mx/contactanos/) y [contacto oficial de Puerta La Victoria](https://puertalavictoria.mx/contacto/). Los marcadores son referencias del establecimiento, no una entrada garantizada: Antea usa las [coordenadas publicadas en su artículo geográfico](https://en.wikipedia.org/wiki/Antea_LifeStyle_Center); Puerta La Victoria usa el centro del mapa de Google embebido en su página oficial de contacto.

La denominación es «Lugares públicos sugeridos». No hay autorización de intercambio o certificación de seguridad oficial. Revisar horarios y condiciones del establecimiento. Los enlaces Google Maps contienen el nombre completo y la dirección del establecimiento; no una zona genérica. Seleccionar un lugar en el mapa no crea ni confirma una cita.

## Mapa y proveedor

Se añadió Leaflet 1.9.4. El motor se carga de forma diferida; la capa inicial usa `tile.openstreetmap.org`, con atribución visible y caché normal del navegador. No necesita una clave de API ni se cobra una llamada de Google Maps desde el proyecto. Abrir el enlace de Google Maps no usa su API de JavaScript.

Los servidores públicos de OpenStreetMap no ofrecen garantía de servicio ni uso ilimitado. No se implementa precarga, descarga masiva u opción offline. Debe cumplirse su [política de mosaicos](https://operations.osmfoundation.org/policies/tiles/). Puede cambiarse la URL mediante `VITE_MAP_TILE_URL`; para un proveedor distinto también deberán adaptarse atribución, permisos y condiciones. Las claves web de proveedores futuros deben ser públicas y restringidas por dominio; las secretas permanecen en servidor. Un proveedor comercial puede tener costos.

El mapa permite navegar, ampliar, seleccionar marcadores y filtrar la lista por zona/nombre/dirección. Si los mosaicos fallan, siguen disponibles las direcciones y los enlaces. El mapa y su lista consultan los lugares activos de Supabase; si la consulta falla muestran error y reintento, sin presentar datos locales como si fueran una respuesta remota. Las citas solo aceptan lugares activos de la tabla del servidor.

## Flujo y reglas

No existe todavía una compraventa monetaria. Se añadió una solicitud de intercambio asociada a un artículo y a dos participantes:

1. El comprador abre un artículo de otra cuenta y pulsa «Solicitar intercambio y acordar cita».
2. El vendedor acepta o rechaza desde «Mis citas». Mientras tanto el comprador puede cancelar su solicitud. No se pueden solicitar artículos propios.
3. Después de aceptar el intercambio, cualquiera propone un lugar específico y una fecha/hora.
4. Quien propone acepta implícitamente su propuesta; solo la otra persona puede aceptarla o rechazarla.
5. Reprogramar restablece el estado pendiente; nunca arrastra la aceptación anterior.
6. Cualquiera puede cancelar antes de la fecha prevista, sin cargos ni movimiento de dinero. La cancelación cierra el intercambio; para empezar de nuevo se solicita otro.
7. Solo se admiten propuestas entre una hora y 90 días en el futuro. El servidor interpreta la fecha en America/Mexico_City y aplica su propio reloj.
8. Las citas pasadas no pueden modificarse; aparecen en el historial sin afirmar que existió una entrega.

Las funciones serializan cambios con FOR UPDATE, comprueban la revisión esperada y registran cada cambio. Dos respuestas simultáneas a la misma revisión no pueden confirmar dos veces la cita.

## Privacidad y permisos

Las nuevas tablas son `meeting_places`, `exchange_requests`, `exchange_appointments` y `appointment_events`. RLS permite leer solicitudes, citas y eventos solo al comprador o vendedor participante. Los clientes no tienen permisos directos INSERT/UPDATE/DELETE sobre esas tablas privadas; las mutaciones pasan por RPC con verificación de auth.uid(), participante, rol, estado y revisión. Las funciones SECURITY DEFINER fijan search_path vacío y solo se conceden a authenticated; la función de diagnóstico es de solo lectura.

El historial es append-only para los usuarios. Si el vendedor elimina su artículo, se conserva el título de referencia de la solicitud y su product_id queda nulo; no se elimina el historial privado ni se permite crear otra solicitud sobre un artículo inexistente. La eliminación administrativa de cuentas con historial requiere un diseño posterior de retención: no se implementa aquí.

No se solicita GPS ni se guardan coordenadas de usuarios. No existe prueba de entrega por ubicación. Los UUID de operación y cita y sus participantes sirven de base para futuros QR emitidos y verificados en servidor; todavía no se emiten QR, se confirma entrega ni se libera dinero.

## Pruebas con dos cuentas

Después de confirmar y aplicar únicamente la migración nueva:

```bash
npm run test:meetings
```

Usa las cuentas ya configuradas en `.env.test.local` (ignorado por Git), sin imprimir credenciales. La prueba comprueba solicitudes, rechazo antes de aceptación, propuesta y confirmación, respuestas concurrentes, revisión obsoleta, reprogramación, rechazo, cancelación, historial, privacidad frente a visitantes y bloqueo de escrituras directas. El artículo y la imagen temporales se eliminan; la cita de prueba cancelada conserva su historial privado por diseño. No borra citas existentes ni crea cuentas.

Para probar manualmente: A publica, B solicita el intercambio, A acepta; B propone Antea y una hora futura; A acepta. Después B reprograma a Puerta La Victoria y A acepta o rechaza. Revisar ambas sesiones al actualizar o recuperar el foco. Cancelar y consultar «Anteriores». El catálogo de citas se refresca cada 30 segundos mientras la página está visible; no se presenta como tiempo real.

Con solo dos cuentas, ambas son participantes de la cita de prueba. La exclusión de un tercer usuario autenticado se revisa en las políticas pero requiere una tercera cuenta para una prueba remota específica. No se debe afirmar que esa prueba ya pasó.

Para probar un tercero autenticado, la prueba usa opcionalmente `TEST_USER_C_EMAIL` y `TEST_USER_C_PASSWORD` en el archivo local ignorado. En esta sesión se proporcionó una tercera cuenta y se verificó que no leyera filas privadas de A/B ni respondiera por RPC o modificara sus citas. No se imprimieron credenciales ni tokens.

## Resultado final de verificación

- `npm run test:meetings`: **20 comprobaciones remotas aprobadas**, incluidas tres cuentas, concurrencia, revisión obsoleta, estados, privacidad y limpieza confirmada del artículo y la fotografía temporales. Se conserva el historial de las citas de prueba canceladas, únicamente visible para sus participantes.
- `npm run test:integration`: **15 comprobaciones remotas aprobadas** del marketplace previo, para verificar que las nuevas relaciones no rompen productos, perfiles, RLS o Storage.
- `npm test`, `npm run test:sql`, `npm run lint` y `npm run build`: aprobados.
- No se utilizaron claves administrativas ni se imprimieron credenciales; los pagos siguen deshabilitados. Las migraciones las ejecutó el propietario en SQL Editor.

Pendientes: comprobación visual en navegadores y dispositivos, notificaciones externas, moderación de lugares, chat, QR de entrega y pagos. Las herramientas de esta sesión no tienen navegador conectado: los estilos responsive y el renderizado se comprobaron en código, no se afirma haber probado físicamente iPhone, Android o plegables. Esta etapa no presenta lugares como seguros oficiales ni una solicitud como una compra pagada.
