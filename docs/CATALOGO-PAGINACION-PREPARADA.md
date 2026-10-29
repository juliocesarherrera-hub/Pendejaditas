# Preparación de catálogo paginado: pasos 1 y 2

> Estado al 29 de octubre de 2026: consultar la [guía vigente y trazabilidad](CATALOGO-ESTADO-Y-DOCUMENTACION.md). El código del catálogo está publicado como preparación; la 009 no está instalada y el catálogo paginado no está integrado. La edición por ID sí está implementada y publicada. Los resultados y estados Git de cada bloque son evidencia histórica, no pruebas nuevas de esta revisión documental. Este documento sigue pendiente de autorización para commit.

Servicio y edición publicados; el servicio paginado sigue separado de la pantalla. Este informe no autoriza instalar SQL, RPC, índices, dependencias ni cambios remotos. La migración 008 y el efectivo permanecen pendientes y deshabilitados.

## Edición por identificador

`edit/<id>` consulta el producto directamente por ID y propietario, con el cliente Supabase y su sesión actual. No requiere que el artículo figure en el catálogo ni que su descarga global termine correctamente. Se verifica nuevamente la identidad devuelta antes de montar `PublishPage`. Las subastas no abren el formulario.

Se reutilizan el formulario, fotografías, validación, comprobación autenticada de propietario al guardar, comparación optimista de `updated_at`, RLS y triggers existentes. Que aparezca el formulario no garantiza que un artículo pueda modificarse: la decisión final corresponde a RLS y a los triggers existentes. La revisión no encontró un bloqueo general del producto por tener únicamente una cita o reclamación; no se añade ni se anuncia esa regla. No se consultan expedientes privados para intentar inferir permisos. Un rechazo al guardar mantiene el formulario y comunica el error existente.

La consulta no se repite automáticamente al recuperar foco, para evitar perder texto o fotografías aún sin guardar. Cambiar el ID o la sesión cancela e invalida el resultado anterior. Las respuestas de red fallidas no se presentan como eliminación del producto. Perfil y favoritos conservan sus flujos actuales.

## Servicio preparado, sin conexión al catálogo visible

`createCatalogPages(client)` ofrece `page(input, {cursor, signal})` y `auctionUpdates(ids, {signal})`. No está importado por el catálogo visible. `createCatalogPageLoader(service, publish)` prepara cancelación, generación de solicitudes, reintentos, deduplicación y aviso de resultados cambiados. No crea suscripciones ni temporizadores.

- Páginas de 12 publicaciones y una fila de anticipación para `hasMore`.
- Orden predeterminado `created_at DESC, id DESC`, con timestamp completo del servidor, incluidos microsegundos.
- Categoría y modalidad se filtran en Supabase antes de limitar resultados.
- En modalidad explícita `fixed` u `offers`, admite precio mínimo/máximo y orden global `price ASC, id ASC` o `price DESC, id DESC`.
- El cursor incluye la clave normalizada de filtros, orden y ámbito de sesión. No puede reutilizarse con otra consulta. `sessionKey` solo invalida estado del cliente; no otorga permisos ni sustituye la sesión/RLS.
- La búsqueda no vacía, los filtros de precio que incluyan subastas y los órdenes mixtos por precio devuelven `unsupported / server_required` sin consultar. No se degradan a filtros locales ni a búsqueda que pierda acentos.
- Las subastas de cada página se consultan en un único lote de hasta 12 IDs, junto con una lectura de `auctions_health`. Nunca se usa `auction_snapshot`, ni se descarga historial o información de postores. Una subasta incompleta produce error recuperable; no se convierte en precio fijo.
- Cancelar evita consultas adicionales y descarta respuestas antiguas aunque un transporte ignore AbortSignal. Un fallo en páginas posteriores conserva los artículos y el cursor anteriores.
- No hay contador total global. `items.length` cuenta lo cargado, no todo el catálogo.

## Política acordada de actualización

Las tarjetas ya cargadas conservan su posición y pertenencia mientras se navega. `refreshAuctions(ids)` vuelve a consultar desde el servidor un lote de subastas ya cargadas y actualiza precio, estado, revisión y reloj en su lugar. No acepta regresiones de revisión. Las actualizaciones se conservan al agregar otra página.

`markChanged()` permite señalar cambios que podrían afectar filtros u orden. El controlador expone `resultsChanged` para el aviso futuro «Los resultados cambiaron. Actualizar lista». `refresh()` invalida solicitudes anteriores, reinicia el cursor y consulta la primera página con los mismos filtros. El aviso y la suscripción Realtime todavía no están conectados a la pantalla; no se anuncian como operativos. Lotes diferentes durante una actualización pendiente reciben `busy` y deben reintentarse, sin afirmar que fueron actualizados.

El servicio realiza consultas vivas independientes: **no garantiza una instantánea consistente entre páginas**. El desempate y la deduplicación no impiden todas las omisiones si se modifica un precio, un título o la pertenencia a un filtro entre consultas. Las nuevas publicaciones aparecen al actualizar desde el inicio. La estrategia completa de orden por precio cambiante depende del futuro contrato de servidor; no se crean snapshots ni versiones globales en estos pasos.

## Pendiente de servidor y próxima autorización

La RPC de precio efectivo, su normalización y el adaptador ya están redactados y publicados como borrador 009; véase la guía vigente. Faltan validación 17.11, rendimiento representativo, instalación e integración autorizadas. No se eligieron índices nuevos. Ninguna implementación sustituirá el catálogo visible hasta conservar búsqueda sin acentos y filtros/ordenamientos globales. No modificar el motor de pujas, Cron, citas, entregas, reclamaciones ni los triggers inmutables para añadir campos derivados de búsqueda sin revisar su compatibilidad.

## Validación local

Comandos de pruebas del código publicado, para una ejecución local autorizada. No se ejecutan en esta revisión documental:

```text
node scripts/catalog-preparation-checks.mjs
node scripts/public-collections-checks.mjs
node scripts/favorites-state-checks.mjs
npm test
npm run lint
npm run build
```

Los conjuntos grandes, identidades, errores de red y concurrencia se prueban con clientes inyectados; no crean publicaciones ni validan RLS instalado, triggers remotos o carga real. La compatibilidad de formularios se comprueba mediante renderizado y los contratos de guardado existentes. La tanda técnica remota de edición fue autorizada y completada después; véase el informe de edición de esta colección. El rendimiento real y cualquier nueva prueba remota requieren autorización independiente.

Resultado de esta preparación: 22 grupos nuevos y las suites previas de perfiles/favoritos, estado local y verificación general pasaron. Lint sin errores nuevos; conserva un aviso previo de `no-control-regex` en `scripts/backup/artifact-controls.mjs`, que no se modificó. La compilación inicial se detuvo por un rechazo de permisos y no se presentó como verificada en ese momento. Posteriormente el propietario reportó un build correcto; además, la selección exacta del commit 5 pasó build observado, según la guía vigente. No se eludió aquel rechazo.
