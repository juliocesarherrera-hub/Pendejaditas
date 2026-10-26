# Etapa 7: reclamaciones y moderación — verificación funcional

Estado del 25 de octubre de 2026: el diagnóstico compartido por el propietario confirma las once tablas con RLS, 26 funciones, catorce políticas, diez triggers y bucket privado. Los 26 cuerpos instalados coinciden con el archivo local. **007 ya está instalada: no repetirla.** El agente no ejecutó migraciones ni concedió roles. Se realizaron doce comprobaciones reales A/B/C sobre una operación técnica existente; no se modificaron operaciones comerciales. La función Edge ya fue desplegada por el propietario y pasó doce comprobaciones adicionales de archivos con A/B/C. El propietario verificó MFA y el panel autorizado de C; D se activó temporalmente para probar apelaciones y fue desactivada al terminar. El propietario autorizó publicar estos cambios mediante commit y push normales a `main`, después de las verificaciones.

`npm run test:claims` ejecuta la prueba remota optativa con las credenciales ignoradas de `.env.test.local`. Conserva el caso y el PDF técnicos identificados como pruebas, sin incidente real. Usa `.cache/delivery-test-cases.json` para verificar el contexto técnico y guarda los resultados sin credenciales en `.cache/claims-integration-result.json`. Este guion requiere fixtures en el estado de apertura previsto: el expediente utilizado ya está resuelto tras la apelación. No volver a ejecutarlo sobre ese expediente cerrado ni automáticamente con `npm test`; para otra ronda se deben preparar fixtures técnicos nuevos y respetar las cuotas.

Resultado real: sesiones distintas A/B/C; apertura e idempotencia; versión de B visible para A con autor del servidor; aislamiento de ocho tablas frente a C y visitante; rechazo de escritura y suplantación; historial sin edición/eliminación; panel/resolución/autoasignación administrativos rechazados sin rol y MFA; objetivo de entrega inválido rechazado; PDF privado con bytes conservados y sin acceso de B/C/visitante; overwrite/eliminación/sellado falsificado bloqueados; persistencia después de cerrar y abrir sesión. Posteriormente pasaron doce comprobaciones adicionales: CORS correcto en localhost:5174; PDF privado e imagen compartida con sellado real; hash calculado sobre bytes reales; descargas Edge íntegras; exclusión de C/visitante; privacidad frente a B cuando no se compartió; rechazo de suplantación administrativa y sellado ajeno; bloqueo de reemplazo/eliminación tras sellado. Se verificaron después la revisión y resolución con C, la respuesta del comprador, la apelación, la exclusión de C con MFA, una segunda resolución con D y la retirada del acceso de D. También se verificaron pausas superpuestas, bloqueo de A/B, retiro individual, bloqueo residual y recuperación de coordinación sin reactivar la entrega cancelada. No se probó una revisión humana independiente, el vencimiento natural de una pausa durante una hora completa, la concurrencia real entre dos moderadores con MFA ni dispositivos físicos.

## Funcionalidad implementada

- Rutas `#claims`, `#claims/new`, `#claims/ID` y `#moderation`. Acceso desde Mis reclamaciones y cada operación de Mis citas. Sin datos ficticios. Si falta la instalación, se informa del error y no se supone un guardado.
- Casos sobre publicación, cita o entrega, siempre vinculados a una solicitud donde el autor es comprador o vendedor. Si la publicación ya se eliminó, puede usarse el contexto de la solicitud conservada. Esto no sustituye una denuncia general de un anuncio por un visitante sin operación.
- Motivos: producto falso, defectuoso, diferente al anunciado, entrega incumplida, robo reportado, amenazas y otro. El motivo expresa una denuncia, no un hecho probado.
- Versiones de ambas partes, solicitudes de información y respuestas, resoluciones y apelaciones. Estados: abierta, esperando respuesta, en revisión, resuelta y apelada. Apelación hasta siete días después de la resolución, una aportación por parte y resolución; otro moderador debe revisarla.
- Fotografías JPG/PNG/WebP y PDF de hasta 5 MB. Reserva de subida de quince minutos, límite de veinte adjuntos por autor y expediente. Archivo privado para autor y moderadores por defecto; compartir con la contraparte exige elegirlo al subir. La visibilidad no se cambia posteriormente.
- Adjuntar uno de los últimos cincuenta mensajes del chat relacionado. El servidor copia contenido, emisor y fecha originales. No concede acceso al historial completo a los moderadores.
- Panel administrativo, matrícula de personal controlada por SQL y segundo factor TOTP. Un usuario puede configurar MFA en el panel, pero eso **no le concede** un nombramiento. Se necesita rol activo `reviewer` o `supervisor` y sesión `aal2`. No se acepta `user_metadata` como autorización.
- Pausas preventivas justificadas, entre una y 72 horas, del intercambio o una entrega específica. No se suspenden cuentas automáticamente. Las pujas, los relojes de subasta y los resultados provisionales no se alteran.
- Confirmación de acciones por servidor, revisión para evitar actualizaciones administrativas obsoletas y nonces para apertura/versiones/apelaciones. Error de conexión significa consultar el expediente antes de reintentar. No hay cola offline ni borradores privados en localStorage.
- Consultas privadas al abrir, actualizar o recuperar foco. No se añaden las reclamaciones a Realtime. La interfaz usa una columna en móvil y dos en escritorio; no se han probado dispositivos físicos ni se ha validado visualmente con un navegador en esta sesión.

## Migración nueva

Archivo: `supabase/migrations/202610250007_claims.sql`.

Crea once tablas:

| Tabla | Acceso de clientes autenticados |
| --- | --- |
| `claims` | Participantes o moderador autorizado sin conflicto |
| `claim_statements` | Mismo acceso al expediente; histórico sin edición |
| `claim_information_requests` | Mismo acceso al expediente; histórico sin edición |
| `claim_resolutions` | Mismo acceso al expediente; histórico sin edición |
| `claim_events` | Mismo acceso al expediente; histórico sin edición |
| `claim_evidence` | Autor, moderador autorizado o contraparte si se compartió y selló |
| `claim_admin_audit` | Solo moderador autorizado sin conflicto |
| `claim_holds` | Participantes y moderadores autorizados; motivo visible |
| `moderation_staff` | Sin lectura ni escritura directa desde clientes |
| `moderation_staff_events` | Sin acceso directo; histórico del nombramiento |
| `claim_attempts` | Sin acceso directo; control de frecuencia |

Todas tienen RLS; las tablas internas sin políticas de clientes deniegan por defecto. Ninguna tiene permisos directos INSERT/UPDATE/DELETE para `authenticated` o `anon`. Ocho políticas de lectura acotan los datos. Las funciones definer tienen `search_path` vacío y autorización explícita; la lista de permisos usa firmas exactas. Hay 26 funciones nuevas, diez triggers nuevos contando los seis del historial creados por el bloque SQL, y seis políticas nuevas de Storage.

Crea el bucket **privado** `claim-evidence`. No usa ni convierte el bucket público `product-images`. Las políticas restrictivas del nuevo bucket impiden que una política permisiva más amplia habilite reemplazos, eliminaciones o acceso indebido de clientes autenticados. Otros buckets conservan sus reglas. El cliente no recibe URLs públicas de pruebas ni la aplicación crea enlaces firmados.

La migración no borra tablas o filas, no sustituye funciones existentes ni repite migraciones anteriores. Añade triggers a solicitudes, citas y entregas: **sí cambian deliberadamente su comportamiento futuro cuando un moderador aplica una pausa**. La instalación por sí sola no crea pausas, reclamaciones o administradores, ni cambia registros previos. `BEGIN`/`COMMIT` agrupa la instalación. Si existe `claims`, falla para evitar una repetición; no se debe convertir el archivo en una migración repetible a ciegas.

Los locks siguen el orden producto → solicitud → cita → entregas → reclamación. Pausar invalida QR y cancela las entregas pendientes relacionadas, conservando las registradas/en revisión. Las cancelaciones y reportes de desacuerdo siguen pudiendo detener una operación; las reglas de la etapa 6 permanecen. Retirar o vencer una pausa no revive un QR ni una entrega cancelada: será necesaria una nueva revisión de cita confirmada. Resolver un caso tampoco retira silenciosamente pausas de este u otros expedientes.

## Archivos y Edge Function

`supabase/functions/claim-evidence/index.ts` es la fuente de la función desplegada por el propietario desde el archivo único generado. El sellado y la descarga ya pasaron pruebas reales. Acciones:

1. `seal`: valida JWT con Auth, comprueba reserva y autor, descarga el archivo mediante credenciales del servidor, verifica tamaño y cabecera de formato, calcula SHA-256 sobre los bytes reales y sella mediante una función exclusiva de `service_role`.
2. `download`: autoriza al usuario en la base de datos, registra esa autorización, descarga y comprueba tamaño, formato y hash antes de devolver bytes como adjunto. Un moderador necesita MFA y no ser parte interesada. Storage no le concede un acceso directo alternativo a pruebas de otros usuarios.

Claves privadas solo en el entorno de servidor que Supabase proporciona a la función (`SUPABASE_SERVICE_ROLE_KEY`); nunca en variables `VITE_*`, `.env.local` del navegador ni solicitudes del cliente. El navegador usa su JWT y clave pública actuales. No se piden claves privadas por chat.

Se debe configurar `ALLOWED_APP_ORIGINS` en los secretos de la función con los orígenes exactos permitidos, separados por coma, por ejemplo el origen local y el dominio HTTPS final. No usar `*`. Sin esta configuración, las solicitudes de navegador se rechazan. La función verifica autenticación también para clientes sin cabecera Origin; CORS no es un mecanismo de autorización.

Después de autorizar la etapa y revisar el proyecto destino, se desplegará únicamente `claim-evidence`. Si se utiliza Supabase CLI ya instalada/autorizada, el comando es `supabase functions deploy claim-evidence --project-ref REFERENCIA_DEL_PROYECTO`. No ejecutes un `db push` que pueda repetir migraciones manuales. No se instaló CLI ni se desplegó nada como parte de esta preparación. El runtime Deno y su despliegue deben verificarse antes de anunciar pruebas adjuntas operativas; el lint local analiza el TypeScript, pero no sustituye `deno check` ni una prueba en Edge.

No se contrató ningún proveedor. Archivos, tráfico y ejecución consumirán las cuotas de tu proyecto Supabase y pueden generar costos según su plan. No se habilitó un plan de pago.

## Seguridad y límites reales

- Nadie puede elegir desde el cliente el autor, administrador o fecha de un registro. La relación de operación/objetivo y las identidades se validan en SQL. C no debe poder acceder al caso A/B ni a sus pruebas, aun con los identificadores exactos.
- Moderación excluye comprador y vendedor, aunque tengan rol. Las apelaciones excluyen al autor de la resolución apelada, incluso después de iniciar su revisión. Un supervisor tampoco evita estos conflictos.
- El historial de versiones, resoluciones, peticiones y auditoría rechaza UPDATE/DELETE. Las pruebas selladas y objetos no se reemplazan desde clientes. Los accesos administrativos mediante el panel y autorizaciones de archivo se registran; **no se audita cada SELECT directo** de un moderador autorizado.
- El propietario de la base de datos y las credenciales de servicio son una frontera de confianza: pueden cambiar políticas o triggers. Esta bitácora no es una prueba externa inalterable frente al dueño del servidor. Para ello faltarían exportaciones y anclaje independientes y controles operativos.
- El hash prueba integridad **desde la subida**, no autenticidad del contenido anterior. Un archivo puede estar manipulado antes de subirlo. Validar MIME/cabecera no es un antivirus ni garantiza que un PDF no sea malicioso. Se descarga como adjunto, sin incrustarlo. Falta evaluar análisis de malware, retención, límites agregados de almacenamiento y limpieza supervisada de reservas/archivos pendientes.
- Un usuario autorizado puede guardar o divulgar bytes que ya descargó. No se puede garantizar confidencialidad absoluta frente al destinatario. Tampoco se debe copiar documentación privada al bucket público, chat, capturas de soporte o logs.
- Las versiones y solicitudes del expediente se comparten entre ambas partes; el expediente no es un reporte discreto. Los reportes privados de la etapa 6 conservan su mecanismo y **no se incorporan automáticamente** a un caso compartido.
- Las resoluciones y notas de pausa compartidas no deben contener secretos o datos de terceros. Los archivos privados por defecto pueden requerir una solicitud adicional de información para permitir una respuesta justa de la contraparte.
- Faltan las reglas operativas de moderación: personal real, tiempos de atención, criterios de resolución, accesibilidad, tratamiento de datos y procedimiento de apelación. El software no implica que haya un equipo atendiendo inmediatamente.
- No hay intervención policial prometida, protección física garantizada, detección automática de culpabilidad por GPS/QR, cobros, reembolsos ni liberación de dinero.

## Referencia de instalación inicial (ya completada para SQL 007)

**No repetir los pasos 1–4: el diagnóstico ya confirma SQL 007 instalada.** Se conservan como referencia histórica. Continúan pendientes las comprobaciones y configuraciones posteriores:

1. Verificar el proyecto Supabase correcto y que 001–006 ya estén instaladas; no volver a ejecutarlas.
2. Abrir `supabase/migrations/202610250007_claims.sql` y copiarlo completo, desde `BEGIN` hasta `COMMIT` y el marcador final. No seleccionar solo una parte.
3. Supabase → SQL Editor → New query. Pegar solo 007. Revisar el nombre del proyecto y pulsar Run **una vez**.
4. Si aparece un error, detenerse y compartir el error sin credenciales; no repetir ni borrar objetos. Si termina con Success, confirmar ese resultado.
5. Ejecutar el SELECT de `supabase/diagnostics/audit-claims.sql`. Su resultado contiene definiciones y permisos, no expedientes ni archivos. Verificar once tablas con RLS, funciones/permisos, triggers y bucket privado antes de las pruebas.
6. Configurar y desplegar la Edge Function del apartado anterior, exclusivamente con secretos en servidor. Verificar orígenes locales/HTTPS permitidos.
7. Nombrar administradores reales desde SQL Editor usando la función `set_moderation_staff`. No editar el rol en el navegador ni concederlo mediante metadatos de usuario. Ejemplo, **solo después de elegir una cuenta distinta de los participantes**:

   ```sql
   select public.set_moderation_staff(
     'UUID_REAL_DE_LA_CUENTA_AUTORIZADA'::uuid,
     'reviewer', true,
     'Nombramiento autorizado para revisar expedientes de reclamaciones.'
   );
   ```

   La función solo permite ejecución al rol administrativo de base de datos `postgres`; registra el nombramiento. Desactivar usa la misma función con `false`. No se crea ningún administrador predeterminado.
8. Esa cuenta abre Mis reclamaciones → Acceso de moderación → Configurar mi autenticador, escanea su QR privado con una aplicación TOTP y verifica el código. En ingresos posteriores verifica el código existente. Registrar MFA no concede el nombramiento. No compartir QR TOTP, códigos, contraseñas o claves por chat.
9. Ejecutar la matriz siguiente antes de publicar o anunciar la función real. Dos revisores independientes son necesarios para probar una apelación completa. C puede ser ajeno para pruebas de aislamiento y después, mediante nombramiento explícito, actuar como primer revisor; conservar una cuenta ajena adicional para aislamiento posterior.

## Comprobaciones

Locales: `npm test`, `npm run lint`, `npm run build`. El parser valida SQL, cuerpos PL/pgSQL y el diagnóstico de solo lectura; las pruebas de servicio verifican rechazo de respuestas fallidas, ausencia de identidad/rol/hora en el payload, controles de formato/hash/tamaño y conservación de bytes de descargas. SSR comprueba carga privada y que no se rendericen controles administrativos antes de autorizar. **Nada de esto sustituye RLS remoto, concurrencia PostgreSQL o pruebas físicas de dispositivos.**

Matriz remota pendiente de autorización e instalación:

| Caso | Resultado esperado |
| --- | --- |
| A abre caso de su operación con B; B inicia sesión después | Ambos ven el mismo historial persistente y B aporta su versión |
| C y un cliente sin sesión consultan IDs exactos | Sin filas privadas y RPC de escritura/descarga rechazados |
| C combina cita/entrega de otra operación con un intercambio propio | Rechazo del objetivo; sin caso creado |
| A/B envían autor o fecha falsos por REST, editan o borran históricos | Sin permiso; autor y hora proceden del servidor |
| Reserva, subida y sellado real de foto/PDF | Bytes en bucket privado; SHA-256 calculado en Edge; archivo visible según su permiso |
| B/C intentan leer un archivo solo para autor y moderadores | Acceso denegado; ni URL pública ni reemplazo |
| Reserva vencida, archivo >5 MB, MIME falso, overwrite o DELETE | Rechazo; no anunciar prueba sellada |
| Admin sin MFA, usuario sin rol con MFA, admin participante | No pueden resolver ni descargar pruebas privadas de moderación |
| Revisor ajeno solicita información, parte responde, revisor resuelve | Registros originales conservados, cambios y resolución auditados |
| Dos moderadores actúan sobre la misma revisión | La revisión obsoleta se rechaza; no hay dos resoluciones de la misma versión |
| Parte apela; autor original intenta revisar/resolver apelación | Rechazo; otro revisor ajeno puede resolverla |
| Admin pausa coordinación o entrega | QR pendientes invalidados; escritura afectada rechazada; sin cambios en dinero, pujas ni cuentas |
| Pausa vencida o retirada; caso resuelto con otra pausa vigente | Revalidación de servidor; QR anterior no revive; otras pausas se conservan |
| Conexión perdida durante apertura o envío | Consultar primero; mismo nonce no duplica una acción ya aceptada |
| iPhone/Android/tablet/PC, teclado y lector de pantalla | Formularios accesibles, sin desbordamientos ni archivos expuestos; comprobar físicamente |

Referencias oficiales para Storage: [control de acceso](https://supabase.com/docs/guides/storage/security/access-control), [propiedad de objetos](https://supabase.com/docs/guides/storage/security/ownership), [descargas privadas](https://supabase.com/docs/guides/storage/serving/downloads). La aplicación no presenta almacenamiento privado ni un hash como prueba de veracidad de un hecho.
