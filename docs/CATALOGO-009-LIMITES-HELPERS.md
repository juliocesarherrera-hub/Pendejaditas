# Catálogo 009: límites de llamadas directas a helpers

> Estado al 29 de octubre de 2026: consultar la [guía vigente y trazabilidad](CATALOGO-ESTADO-Y-DOCUMENTACION.md). El código del catálogo está publicado como preparación; la 009 no está instalada y el catálogo paginado no está integrado. La edición por ID sí está implementada y publicada. Los resultados y estados Git de cada bloque son evidencia histórica, no pruebas nuevas de esta revisión documental. Este documento sigue pendiente de autorización para commit.

29 de octubre de 2026. **Corrección publicada en el commit 5; no instalar ni integrar todavía.** Conserva el [modelo de permisos](CATALOGO-009-PERMISOS.md), las decisiones de búsqueda y los gates de PostgreSQL 17.11, RLS real, rendimiento, compatibilidad y recuperación.

## Alcance y revisión de los cinco helpers

Se revisaron todas las funciones auxiliares. La RPC pública `catalog_page_v1` es la sexta función de 009; sus validaciones no bastan como protección de llamadas directas a helpers. No se cambiaron sus filtros, ordenamientos, contrato, permisos o cuerpo.

| Helper | Parámetros / límite anterior | Validación local actual |
| --- | --- | --- |
| `search_key_v1(value text)` | 90 caracteres y 512 bytes, comprobando caracteres antes que bytes | Bytes primero: máximo 512; después máximo 90 caracteres. Mantiene NFC, lower con ICU y ñ diferenciada. Salida normalizada limitada a 512 caracteres y 2.048 bytes |
| `trim_v1(value text)` | Sin límite propio; btrim directo | Máximo 512 bytes y 90 caracteres de entrada, antes de btrim. Conserva exactamente la lista de espacios Unicode aprobada |
| `pattern_v1(value text)` | Máximo 2.048 bytes | Bytes primero: máximo 2.048; después máximo 512 caracteres. Tres reemplazos fijos para escapar !, % y _, sin aceptar regex ni ejecutar SQL |
| `cursor_time_v1(value text)` | Regex y conversión de fecha antes de un límite explícito de tamaño | Exactamente 27 bytes antes del regex; solo ASCII con formato UTC `YYYY-MM-DDTHH:mm:ss.ffffffZ`, año 0001–9999, fecha/hora válidas y roundtrip exacto |
| `fingerprint_v1(category,sale_type,term,low,high,sort,page_size)` | Sin validaciones propias de dominio/tamaño; JSON/hash directo | Límites por argumento antes de JSON/hash, valores enumerados, rangos y tamaño de página según la tabla siguiente |

Caracteres significa puntos de código tal como los cuenta char_length, no grafemas visibles. Bytes significa octet_length en UTF8. Las comparaciones de tamaño se separan de operaciones caras para no depender del orden de evaluación de un OR que contenga normalización o escaneos largos.

| Argumento del fingerprint | Dominio aceptado |
| --- | --- |
| `category text` | NULL o una de Consolas, Videojuegos, Accesorios, Componentes, Coleccionables; barreras previas de 64 bytes y 32 caracteres |
| `sale_type text` | Obligatorio; all, fixed, offers o auction; máximo siete bytes antes de comparar |
| `term text` | Obligatorio; vacío para explorar o 2–512 caracteres, máximo 2.048 bytes; no se normaliza ni trunca de nuevo |
| `low integer`, `high integer` | Cada uno NULL o entero 0–1.000.000; si ambos están presentes, low no supera high |
| `sort text` | Obligatorio; recent, price_asc o price_desc; máximo diez bytes antes de comparar |
| `page_size integer` | Obligatorio; 1–12 |

El tipo integer ya limita la representación numérica que llega al cuerpo. Los errores de tipo, UTF8 inválido o NUL que PostgreSQL rechace antes de invocar la función no pueden interceptarse dentro del helper. Su tratamiento HTTP/logs sigue siendo una validación del transporte pendiente. No se añaden overloads para aceptar entradas arbitrarias ni casts dinámicos.

## Unicode, formatos y errores

El límite mayor para texto normalizado **no aumenta los 90 caracteres permitidos en una búsqueda original**. Unicode puede expandirse en una normalización canónica: las pruebas incluyen 90 repeticiones de U+0F43 y U+1D160, cuya salida tiene más de 90 puntos de código. Aplicar otra vez el límite original al patrón o al fingerprint rompería esas búsquedas. Se conserva un margen acotado y se verifica que el hash coincide con el contrato JavaScript ya publicado.

El fingerprint recibe el término ya normalizado de la RPC. En una llamada directa acepta texto acotado sin plegarlo de nuevo: su hash no autoriza acceso, no firma cursores y no modifica filtros del servidor. Las cadenas con comillas, saltos de línea, acentos o caracteres especiales son datos, nunca SQL. La RPC conserva la responsabilidad de normalizar el término original. No se introduce transliteración, NFKC ni casefold nuevo.

Se preservan PS/PC/VR/DS, búsquedas sin acentos, ñ distinta de n, diéresis y Unicode combinado. El escape de patrones sigue tratando % y _ literalmente. No es un escape genérico para concatenar SQL: la consulta de la RPC permanece estática y usa el patrón como valor.

- search_key, trim y pattern rechazan entradas fuera de sus límites mediante SQLSTATE **22023**, mensaje fijo `Entrada no admitida.`, sin DETAIL/HINT personalizados ni valores proporcionados por el usuario.
- cursor_time devuelve **NULL** ante formato, tamaño o fecha inválidos, conservando el comportamiento anterior. La RPC convierte ese resultado en invalid_cursor.
- fingerprint usa el mismo rechazo 22023 para argumentos obligatorios nulos, filtros inválidos, rangos incompatibles o entradas excesivas.
- Los cuatro helpers de un argumento conservan STRICT: NULL devuelve NULL sin ejecutar el cuerpo. El fingerprint no es STRICT porque categoría y precios admiten NULL.
- Un término de un carácter sigue generando query_too_short desde la RPC antes de calcular su fingerprint. Un fingerprint directo de un carácter se rechaza con 22023.

PostgreSQL puede añadir nombre de función/línea en CONTEXT de un error. No se promete que el transporte SQL o REST elimine toda información de diagnóstico; estas validaciones no consultan ni incluyen datos privados en el mensaje. El saneamiento del cliente no sustituye una revisión de respuestas/logs del servidor real.

## Trabajo acotado y ausencia de efectos secundarios

Los límites se comprueban antes de ICU, btrim, los tres replace, regex de fechas o JSON/SHA-256. No hay regex del usuario, SQL dinámico de búsqueda ni bucles sobre entradas sin límite. La concatenación del normalizador está acotada por 90 caracteres originales; el patrón trabaja sobre máximo 2 KiB y su salida tiene como cota conservadora 4.098 bytes. El arreglo canónico del fingerprint tiene once posiciones fijas y devuelve 64 caracteres hexadecimales.

trim y fingerprint pasan de cuerpo SQL a PL/pgSQL para poder rechazar explícitamente; mantienen sus firmas, volatilidad y permisos. trim continúa IMMUTABLE y STRICT; fingerprint continúa STABLE y dependiente de auth.uid del llamador. Todos mantienen **SECURITY INVOKER y search_path vacío**. No se añadió una función ni permiso y no se cambian RLS, roles, membresías, default privileges o propietarios anteriores.

Los helpers no leen tablas comerciales ni escriben datos. El fingerprint únicamente consulta la identidad de su sesión mediante auth.uid, como antes. Se probaron llamadas directas dentro de transacciones READ ONLY con anon/authenticated; se conservaron snapshots de datos/sentinelas y las definiciones/ACL anteriores. Los 13 grupos de permisos siguen pasando, incluidos los rechazos por herencia no autorizada y las 36 ejecuciones denegadas.

**Esto no es un rate limiter.** La petición ya ha viajado y puede haberse convertido al tipo PostgreSQL antes de entrar al cuerpo. Recibir/serializar entradas enormes, descomprimirlas o repetir miles de llamadas puede consumir recursos aunque el helper las rechace. El esquema auxiliar debe seguir fuera de la API expuesta, con controles futuros de tamaño HTTP, frecuencia, concurrencia, timeouts y monitoreo. No se modifica esa infraestructura aquí.

Las validaciones también añaden trabajo a cada evaluación válida, especialmente al normalizar títulos. No se midió el coste nuevo de la RPC completa con 1.000/10.000 publicaciones ni escrituras concurrentes; sigue siendo necesario hacerlo con índices/RLS representativos antes de instalar. No se añaden índices ni se afirma una mejora de rendimiento por esta corrección.

## Pruebas realizadas localmente

`scripts/catalog-draft-checks.mjs` se amplió, sin añadir archivos ejecutores ni modificar los tests publicados del contrato.

| Comprobación | Resultado |
| --- | --- |
| Borrador completo en PGlite 18.6 | 16 grupos correctos; 252 lecturas RPC y 246 llamadas directas a helpers |
| Llamadas directas | Cinco helpers bajo anon/authenticated, casos límite, NULL, listas permitidas, precios, tamaños y errores neutros |
| Entradas grandes | 16 llamadas con 1 MiB por argumento probado: rechazo 22023 o NULL para cursor; después siguen funcionando solicitudes válidas |
| Medición de esa tanda | Aproximadamente 102 ms por tanda de ocho llamadas en la ejecución registrada, incluidos bindings/copia WASM y savepoints. Es una muestra local, no un umbral garantizado ni un benchmark de producción |
| Unicode expandido | Dos familias de caracteres repetidas 90 veces conservan salida y fingerprint conforme a JS, sin truncamiento |
| RLS y contrato previo | 218 páginas equivalentes bajo identidades sintéticas anon/A/B/C/D; dato protegido y estados conservados |
| Fingerprint / cursores | Vector dorado anterior, equivalencias Unicode, microsegundos y cursores inválidos siguen correctos |
| Permisos / revisión final / adaptador | 13 / 4 / 12 grupos correctos respectivamente |
| Contrato / controlador publicados | 28 / 34 grupos correctos, archivos intactos |
| `npm test` | Suite local general correcta; no instalación ni llamadas remotas |
| `npm run lint` | Sin errores ni avisos nuevos; permanece el aviso previo de `scripts/backup/artifact-controls.mjs:7:98`, sin modificarlo |
| `npm run build` | Correcto; no despliegue ni activación financiera |

Los casos negativos usan SAVEPOINT y ROLLBACK TO SAVEPOINT dentro de READ ONLY: un error esperado de PostgreSQL aborta la subtransacción, no debe invalidar el siguiente caso de prueba. Al terminar se hace ROLLBACK y se cierra el cluster efímero. No se rebajan controles para hacer pasar un rechazo.

Las barreras de tamaño anteriores a operaciones costosas también se revisan en el texto de las cinco funciones. Las mediciones de 1 MiB demuestran el comportamiento para ese conjunto finito, no resistencia ilimitada a DoS ni memoria constante para toda la petición.

## Archivos y estado

- Modificado: `supabase/drafts/202610280009_catalog.sql`, únicamente cuerpos de los cinco helpers.
- Modificado: `scripts/catalog-draft-checks.mjs`, pruebas directas y contadores.
- Modificado: `docs/CATALOGO-009-PERMISOS.md`, nota de actualización que conserva los resultados anteriores.
- Nuevo: este documento.

SHA-256 histórico anterior a retirar la línea vacía final al preparar el commit 5: `ea5696094ea949851946a2da1fb34150aee76998bd4fce0fb4f7213d813d46c6`. El diagnóstico existente calcula hashes desde los cuerpos, por lo que no requiere modificar su SELECT. El hash exacto publicado figura en la guía vigente. Los hashes anteriores quedan como antecedentes y no aprueban una instalación.

Las pruebas se ejecutaron sobre la copia de trabajo completa, que contiene integraciones anteriores pendientes de efectivo; sus archivos no se modificaron y no se activaron funciones remotas. Después se extrajo y probó la selección independiente del commit 5 con el código publicado, sin efectivo ni 008. Sus resultados están en la guía vigente. No se presentan las pruebas iniciales de la copia completa como si fueran esa selección.

Preservación comprobada por SHA-256: de 242 archivos registrados al inicio, solo cambiaron los tres archivos existentes autorizados enumerados; los otros 239 coinciden y no falta ninguno, incluidos los archivos de entorno. Este documento es el único archivo nuevo. Se conservan los 90 pendientes iniciales, con esas tres modificaciones permitidas; ahora aparecen 14 modificados y 77 nuevos por la guía añadida. Al concluir aquel bloque, el índice estaba vacío y HEAD era `867f6f17f24e03580ac1281cf91bc5750ae23b18`. No se abrieron ni modificaron los respaldos privados.

Pendiente: PostgreSQL **17.11**/ICU real, roles/JWT/PostgREST, límites del transporte y carga concurrente, compatibilidad completa con 008 deshabilitada/ausente y restauración aislada. El corpus no demuestra equivalencia de todo Unicode ni de futuras versiones de ICU. Si cambian las reglas o una validación falla en 17.11, detener y presentar alternativas sin modificar silenciosamente el contrato.

No se ejecutó SQL remoto, no se tocó el servidor PostgreSQL 18, no se instalaron herramientas/extensiones/dependencias ni las migraciones 008/009. El borrador permanece fuera de supabase/migrations, sin integración visible ni instalación. El código fue posteriormente publicado por autorización expresa; esta documentación aún espera su propia autorización.
