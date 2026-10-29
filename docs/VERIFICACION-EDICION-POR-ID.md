# Verificación de edición independiente por ID

> Estado al 29 de octubre de 2026: consultar la [guía vigente y trazabilidad](CATALOGO-ESTADO-Y-DOCUMENTACION.md). El código del catálogo está publicado como preparación; la 009 no está instalada y el catálogo paginado no está integrado. La edición por ID sí está implementada y publicada. Los resultados y estados Git de cada bloque son evidencia histórica, no pruebas nuevas de esta revisión documental. Este documento sigue pendiente de autorización para commit.

**Actualización posterior autorizada:** la tanda remota de títulos se completó el 28 de octubre de 2026 con diez resultados esperados. El apartado final registra sus resultados y la única diferencia persistente. Los apartados previos conservan el alcance y los pendientes de la revisión inicial; ya no describen el estado actual de estas pruebas de escritura.

Revisión del 28 de octubre de 2026. Sin cambios en el código de la aplicación, RLS, migraciones, datos ni archivos de Supabase. El propietario confirmó que `npm run build` terminó correctamente desde su terminal de VS Code; es un resultado reportado por el propietario, no una nueva compilación observada por el agente.

## Permisos y restricciones revisados

| Capa/contexto | Regla existente | Alcance de la comprobación |
| --- | --- | --- |
| Apertura de edición | ID y propietario en SELECT; validación de la respuesta; sesión/ID delimitan el estado; subasta bloqueada antes de montar formulario | Código, pruebas locales y lecturas técnicas remotas |
| Guardado normal | `auth.getUser()`, propietario, ID, filtro `updated_at`; RLS owner UPDATE con USING y WITH CHECK | Código/modelo local; guardado remoto y restauración confirmados posteriormente |
| Campos | Grants limitados a título, descripción, categoría, estado, modalidad, precio, zona y foto; no owner_id ni created_at | Definiciones locales 001; no se ha consultado el catálogo administrativo actual |
| Subasta | `auction_product_immutable` conserva contenido y reglas, incluso si terminó | Definición 005; formulario bloqueado y PATCH rechazado en la tanda posterior; coexiste protección por entrega |
| Entrega | `delivery_product_preserve` impide cambios de contenido cuando existe alguna entrega no cancelada; una registrada sigue protegida | Definición 006; rechazos de PATCH confirmados en la tanda posterior |
| Entregas solo canceladas | La definición permite UPDATE del artículo si no existe otra entrega no cancelada; DELETE sigue protegido por cualquier entrega histórica | Revisión de código; no se intenta borrar nada |
| Cita sin entrega activa | No existe un bloqueo general del producto solo por tener cita confirmada | No se inventa ni añade una restricción nueva |
| Reclamación/pausa | Las pausas de 007 protegen intercambios, citas y entregas; no existe un trigger general de pausa sobre productos | Una reclamación sola no se presenta como congelación del artículo |
| C/D moderación | Nombramiento y MFA de moderación no conceden un permiso especial para editar productos ajenos en las reglas revisadas | Lecturas remotas con sesiones normales AAL1; no se elevó MFA |
| Fotografías | Sin archivo nuevo, se conserva image_path; reemplazo usa ruta nueva y solo limpia la anterior tras guardar; no elimina una foto aún referenciada | Modelo local; no se suben/descargan/eliminan fotos reales |

La protección optimista con updated_at pertenece al flujo de guardado del cliente, no sustituye RLS ni equivale a una regla obligatoria de todas las llamadas posibles a la API. Asimismo, el filtro owner_id de lectura ayuda a elegir publicaciones propias pero no concede permisos: la autorización efectiva de UPDATE corresponde a RLS y a los triggers del servidor.

La interfaz puede abrir el formulario de una publicación propia vinculada a una entrega; eso no prueba que el guardado esté permitido. El trigger conserva la decisión final. No se consultan reclamaciones o datos privados de terceros para intentar deducir si puede editarse.

## Resultados locales

`node scripts/editing-permissions-checks.mjs`: 18 grupos con identidades sintéticas A/B/C/D. Incluye guardado propio; rechazo de otros usuarios y propietario falsificado; sesión ausente; updated_at obsoleto; modelo de restricciones; conservación de campos; sustitución/limpieza segura de fotos; fallo previo y respuesta perdida; cancelación y respuesta tardía; lectura directa sin catálogo; comprobaciones de definiciones SQL locales. No ejecuta SQL ni prueba las políticas instaladas.

Se vuelve a ejecutar también `scripts/catalog-preparation-checks.mjs` para los 22 grupos ya existentes y su renderizado real de componentes. Los errores de conexión y las respuestas tardías se inyectan localmente; no se interrumpe la red de producción.

En una respuesta perdida tras guardar, el servicio no anuncia éxito supuesto. Conserva una foto que podría estar referenciada. Puede quedar una foto antigua pendiente de reconciliación; las pruebas no la eliminan a ciegas ni implementan limpieza nueva.

## Lecturas reales con las cuentas configuradas

Se usaron sesiones temporales independientes A/B/C/D, sin persistencia ni elevación MFA. El cliente de prueba permitió exclusivamente GET de tablas previstas y POST de inicio/cierre de sesión. Cualquier PATCH, INSERT, DELETE, RPC o llamada a Storage quedó fuera de la lista autorizada. No se usaron claves administrativas.

- Se verificaron siete publicaciones técnicas existentes mediante ID, título exacto, propietario y ruta de foto esperados; no se consultaron publicaciones comerciales para seleccionar candidatos.
- A: seis publicaciones propias abren datos editables; la subasta devuelve `blocked`.
- B/C/D: las siete consultas de edición propia devuelven `unavailable`; esto demuestra el flujo de lectura, **no un intento real de UPDATE rechazado por RLS**.
- C y D no recibieron metadatos de entregas privadas A/B, con sesiones AAL1.
- Los siete registros conservaron todos los campos consultados, incluidas fotos y timestamps, mediante comparación SHA-256 antes/después. No se descargaron bytes de fotografías ni se afirma haber recalculado sus hashes físicos.
- Se realizaron 44 solicitudes, incluidas autenticación y limpieza; todas las sesiones temporales se cerraron correctamente. No se enviaron escrituras de datos.

Inventario observado:

| Artículo técnico | Cita | Entregas existentes | Bloqueo esperado según definición 006 |
| --- | --- | --- | --- |
| fixed | Confirmada | Registrada | Sí |
| expiry | Confirmada | Dos canceladas | No por entrega |
| reprogram | Propuesta | Dos canceladas | No por entrega |
| cancel | Cancelada | Cancelada | No por entrega |
| incident | Confirmada | Cancelada y en revisión | Sí |
| auction | Confirmada | Cancelada y registrada; subasta ended_winner | Sí por subasta y entrega |
| hold | Confirmada | Pendiente y cancelada | Sí |

Las respuestas y la correspondencia de los alias con registros reales permanecen en los informes privados originales de lectura e inventario. No se publican ni se modifican. Este inventario describe el momento del ensayo, no el estado actual de esas operaciones. Cualquier prueba futura requiere verificar otra vez sus precondiciones y su autorización.

## Plan histórico de la tanda remota, ya completada

La tanda siguiente obtuvo autorización expresa antes de ejecutarse; su resultado consta más abajo. Repetirla requeriría una autorización nueva para escrituras técnicas e intentos que podrían revelar un fallo de RLS. No se usan cambios «sin efecto» como prueba de inmutabilidad: podrían modificar updated_at sin probar que un cambio de contenido se rechaza.

1. **Guardado permitido A:** caso técnico con alias `expiry`, sin publicar su UUID ni sus títulos literales. Se planificó cambiar únicamente el título por un valor temporal, leer el resultado y restaurar el original con control optimista. Sin cambiar fotos, precio, propietario, citas, entregas ni reclamaciones. Las dos actualizaciones legítimas de updated_at se conservarían, sin falsificar timestamps antiguos.
2. **Rechazo B/C/D:** intentar cambiar únicamente el título de ese artículo técnico mediante PATCH dirigido al ID real, para probar RLS además del rechazo del formulario. Leerlo como A después de cada intento. Una lectura vacía no se contará como prueba de rechazo de UPDATE.
3. **Rechazo A en subasta:** intentar cambio de título del caso `auction`. No cambiar pujas, modalidad, tiempos ni llamar a auction_snapshot.
4. **Rechazo A por entrega:** intentos de título sobre los casos `fixed` (registrada), `incident` (revisión) y `hold` (pendiente). No usar QR ni cambiar sus estados.
5. **Concurrencia de borradores:** un intento con el updated_at previo al guardado de prueba debe fallar sin sobrescribir el nuevo contenido.
6. **Fotografía:** en todos los casos, comparar image_path y confirmar que no se enviaron solicitudes de modificación a Storage. El reemplazo de fotografías reales queda fuera de esta propuesta.

Si un intento que debía rechazarse modifica algo o no puede confirmarse la restauración, detener las pruebas y registrar el estado sin repetir operaciones, borrar datos o sobrescribir un cambio concurrente. La reparación necesaria se consultará antes de continuar. Este plan histórico no autoriza un ejecutor nuevo ni la repetición de la tanda posterior.

## Pendientes de la revisión inicial y cierre posterior

Los guardados remotos y rechazos de UPDATE por RLS/triggers que inicialmente faltaban se comprobaron en la tanda descrita a continuación. Siguen fuera de esa evidencia las pruebas interactivas completas de `#edit/<id>` en navegador y la auditoría administrativa de definiciones instaladas. No se necesita ni se solicita permiso administrativo para las lecturas ya realizadas. Cualquier auditoría del catálogo administrativo requerirá un acceso de solo lectura autorizado aparte.

La búsqueda global, el precio efectivo y el diseño SQL del catálogo no formaron parte de esta tanda. Sus avances posteriores se identifican por separado en la guía vigente.

## Resultado de la tanda remota autorizada

El propietario autorizó expresamente las escrituras técnicas descritas. Se ejecutó primero una prevalidación de solo lectura y se repitieron las comprobaciones antes de la tanda y de cada intento negativo. Se verificaron los siete IDs, títulos exactos, propietario A, descripciones técnicas, fotografías esperadas, modalidad y precio originales. Los vínculos estaban limitados a las cuentas técnicas A/B; se verificaron sus citas, entregas, subasta, puja, resultado y reclamaciones de prueba sin publicar referencias de expedientes. No se detectaron vínculos con otros usuarios ni operaciones ajenas al conjunto técnico. No había conversaciones de chat vinculadas a esos intercambios.

`expiry` conservaba cita confirmada, dos entregas canceladas y ninguna reclamación o subasta propia. Se verificó que los otros artículos previstos conservaban la entrega registrada, en revisión o pendiente y la subasta terminada correspondiente. No se creó ni modificó ningún vínculo.

El ejecutor restringió cada PATCH a una autorización de un solo uso: cuenta, UUID exacto, timestamp esperado y cuerpo con **solo `title`**. Se prohibieron RPC, SQL, Storage, otros métodos de escritura y destinos distintos del proyecto autorizado. Los intentos B/C/D no incluían un filtro artificial owner_id que pudiera ocultar una RLS incorrecta: apuntaban al ID real conocido y su updated_at, y A volvió a leer el registro para verificar que no cambió. Las sesiones eran temporales AAL1; no se elevó MFA ni se asignaron permisos.

| Intento | Cuenta | Registro técnico | Resultado real | Diferencia persistente |
| --- | --- | --- | --- | --- |
| Cambio de título autorizado | A | expiry | Una fila actualizada y leída con el título de prueba | Cambio transitorio del título y updated_at |
| Restauración del título original | A | expiry, mismo ID | Una fila actualizada; título original recuperado | Solo updated_at final |
| Edición ajena | B | expiry, mismo ID | HTTP 200, cero filas; A confirmó igualdad completa | Ninguna |
| Edición ajena | C | expiry, mismo ID | HTTP 200, cero filas; A confirmó igualdad completa | Ninguna |
| Edición ajena | D | expiry, mismo ID | HTTP 200, cero filas; A confirmó igualdad completa | Ninguna |
| Borrador con updated_at anterior | A | expiry, mismo ID | HTTP 200, cero filas; contenido sin cambios | Ninguna adicional |
| Subasta terminada protegida | A | auction | Rechazo PostgreSQL `P0001`; registro intacto | Ninguna |
| Entrega registrada | A | fixed | Rechazo PostgreSQL `P0001`; registro intacto | Ninguna |
| Entrega en revisión | A | incident | Rechazo PostgreSQL `P0001`; registro intacto | Ninguna |
| Entrega pendiente | A | hold | Rechazo PostgreSQL `P0001`; registro intacto | Ninguna |

Ningún intento negativo fue aceptado. No se activó reparación automática ni se repitió una escritura incierta. El caso de subasta también tiene una entrega registrada: el rechazo demuestra la protección efectiva de ese artículo, pero no aísla experimentalmente qué trigger se ejecutó primero. No se alteraron los vínculos para aislarlo.

### Secuencia temporal del único registro modificado

Las marcas reales del servidor y sus microsegundos se conservan solo en el informe privado. Para el documento público:

- T0: valor original de `updated_at`.
- T1: valor después del cambio autorizado.
- T2: valor después de restaurar el título.

Se comprobó T0 < T1 < T2. No se publican fechas u horas que permitan correlacionar el registro.

El título final coincidió exactamente con el original del caso `expiry`; su valor literal permanece privado. No se falsificó updated_at para ocultar la prueba. El resto de sus campos, incluidos precio, modalidad, condiciones y image_path, coincidió con el original. Los otros seis productos conservaron todos sus valores originales al terminar la tanda.

### Comparación de operaciones y auditoría

Se compararon antes/después los intercambios, citas, entregas, subasta, puja, historial público de puja, resultado, foto de subasta, reclamaciones y pausas técnicas. Ninguno cambió. No se descargaron, subieron ni eliminaron fotografías. La conservación se verificó sobre los campos/rutas y la ausencia de solicitudes a Storage, no mediante una nueva descarga de bytes físicos.

Las bitácoras accesibles de citas, entregas y reclamaciones conservaron sus eventos: cero eventos nuevos y cero eliminados. Los inventarios detallados permanecen privados. Esto no acredita ausencia de registros internos: `auction_audit_events` y las bitácoras administrativas/infraestructura no se consultaron sin permisos. Los inicios y cierres de sesión pueden generar registros de Auth; sus contenidos internos no estaban accesibles mediante estas cuentas.

El informe técnico privado original de la tanda de títulos conserva intentos, respuestas, valores originales/finales, hashes y marcas de tiempo. La correspondencia de los alias se revisa allí con acceso autorizado, sin copiarla al repositorio. La ejecución realizó 180 solicitudes incluidas las comprobaciones de conservación y autenticación: diez fueron PATCH de título, de los que solo el cambio positivo y su restauración afectaron filas. Las cuatro sesiones temporales se cerraron correctamente. La prevalidación previa no envió PATCH.

### Límites que permanecen

- Las pruebas de servidor se hicieron mediante el SDK, no con clics en un navegador real. El renderizado y los cambios rápidos del formulario se probaron localmente.
- C y D actuaron con sesiones AAL1. No se concedió ni se elevó un permiso para esta tanda.
- El artículo con subasta tiene dos protecciones coexistentes; no se afirma haber aislado cada trigger.
- No se verificaron bitácoras internas que requieren acceso adicional de lectura.
- La regla observada de citas sin entrega activa permanece: no congela por sí sola una publicación. No se añadió una regla comercial nueva.

La revisión final conserva el código y el trabajo pendiente anterior, incluida la Fase 8 y la migración 008. En aquella tanda no se hizo commit, push ni cambio de infraestructura. Posteriormente se publicó la edición independiente; los avances del diseño SQL tienen su evidencia separada en la guía vigente.
