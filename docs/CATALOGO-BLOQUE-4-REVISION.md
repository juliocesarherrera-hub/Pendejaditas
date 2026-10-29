# Catálogo paginado: bloque 4, revisión de resultados y compatibilidad

> Estado al 29 de octubre de 2026: consultar la [guía vigente y trazabilidad](CATALOGO-ESTADO-Y-DOCUMENTACION.md). El código del catálogo está publicado como preparación; la 009 no está instalada y el catálogo paginado no está integrado. La edición por ID sí está implementada y publicada. Los resultados y estados Git de cada bloque son evidencia histórica, no pruebas nuevas de esta revisión documental. Este documento sigue pendiente de autorización para commit.

28 de octubre de 2026. **Revisión documental; no autoriza crear ni instalar una migración.** Se conservan las decisiones de [diseño](DISENO-RPC-CATALOGO-PAGINADO.md), los bloques [1](PRUEBAS-CONTRATO-CATALOGO.md), [2](PRUEBAS-CATALOGO-RESULTADOS-CAMBIANTES.md), [3](CATALOGO-BLOQUE-3-LABORATORIO.md), las decisiones de Fase 8 y el diseño geográfico aprobado, fuera de este conjunto documental.

## 1. Dictamen y calidad de la evidencia

La propuesta de lectura puede mantenerse separada del motor comercial **sin modificar sus tablas, triggers o RPCs**. No se encontró en la revisión estática una dependencia que obligue a instalar 008 para consultar el catálogo. Eso no acredita aún compatibilidad ejecutada en PostgreSQL 17.11 ni seguridad/rendimiento en destino de la RPC que hoy está publicada como borrador.

**La autorización posterior permitió preparar el bloque 5, pero no instalarlo. Siguen pendientes los requisitos del destino:** faltan validación del motor 17.11/ICU, RLS con roles reales del laboratorio, contrato SQL completo y mediciones con índices/constraints existentes. No se debe convertir el prototipo temporal en migración mediante copia directa. La cifra de 13.000 tuplas no justifica por sí sola instalar índices.

| Etiqueta | Significado usado en esta revisión |
| --- | --- |
| T3 | Demostrado en pruebas anteriores del bloque 3, con PGlite 18.6 y fixtures; no repetidas aquí |
| L4 | Confirmado por lectura de código/migraciones o recálculo descriptivo del JSON existente; no prueba remota |
| H | Hipótesis técnica que necesita un experimento comparable |
| P | Pendiente; no debe anunciarse como implementado o probado |

Fuentes locales: las ocho migraciones 001–008, permisos/restricciones/funciones y guards relacionados; prototipos `scripts/catalog-lab/{fixture,query}.sql`; referencia JS, controlador y corpus; runner local; artefacto de métricas RUN-B3-PERF-01 (informe sintético privado original, conservado sin modificar). El artefacto se leyó sin modificarlo. El estado instalado 001–007 y versión remota esperada 17.11 proceden del historial confirmado; no se hizo diagnóstico remoto nuevo. Las referencias oficiales siguientes sustentan mecanismos, no certifican el proyecto.

## 2. PostgreSQL 18.6/PGlite frente a 17.11

| Aspecto | Evidencia y diferencia | Regla para el catálogo |
| --- | --- | --- |
| Motor y plataforma | T3: PostgreSQL 18.6 WASM 32 bits, una instancia/cola local; destino esperado 17.11 administrado | No extrapolar planes, latencia, I/O, concurrencia o semántica completa de 18 a 17 |
| Parser | T3: libpg-query 18 analiza el SQL | Compilar/ejecutar el contrato completo en motor 17.11; parseo 18 no prueba compatibilidad 17 |
| normalize/lower/LIKE | PostgreSQL 17 dispone de normalización UTF-8 y conversión dependiente de colación; T3 solo verifica una combinación local | Usar funciones disponibles en 17, colación explícita y pruebas por corpus; sin fallback al locale del sistema |
| Funciones nuevas de 18 | 18 incorpora casefold y permite LIKE con colaciones no deterministas, entre otros cambios | No usar casefold, PG_UNICODE_FAST, UUIDv7 ni LIKE no determinista como requisitos de v1. No se usan en el prototipo aprobado |
| Optimización | El planner y las posibilidades de índices de 18 difieren de 17; PGlite tampoco reproduce el almacenamiento remoto | Medir PostgreSQL 17 con estadísticas, roles y esquema representativos, no suponer que el mismo EXPLAIN será elegido |
| Servicios | T3 no incluye Auth/JWT/PostgREST, pooler, workers ni Realtime | Probar esos límites en laboratorio compatible antes de integración/producción |

Las novedades de 18 no se convierten en dependencias por estar disponibles en el motor de prueba. [Cambios oficiales de PostgreSQL 18](https://www.postgresql.org/docs/18/release-18.html). En 17 la normalización requiere UTF-8; la conversión y los patrones dependen de la colación elegida. [Funciones de cadenas 17](https://www.postgresql.org/docs/17/functions-string.html).

### 2.1 Hallazgo Unicode concreto

T3: Node v24.21.0, Unicode 17.0, ICU 78.3; PGlite con UTF8, locale predeterminado C/C.UTF-8 y colación determinista `und-x-icu` cuya versión registrada/actual es `153.128`. Son identificadores locales, no propiedades verificadas de Supabase.

| Normalizador completo de la prueba | Diferencias frente a JS, 45 entradas | Ejemplos |
| --- | --- | --- |
| lower con ICU explícita, luego regla aprobada | 0 | Pokémon/pokemon, NIÑO/niño, n + tilde combinada y diéresis coinciden |
| lower con C | 15 | POKÉMON produce pokEmon; NIÑO produce niNo |
| lower predeterminado de esa instancia | 1 | ΟΣ produce οσ; JS/ICU producen ος |

La comparación literal `COLLATE "C"` **después** de normalizar no es el problema: ayuda a mantener diferencias exactas entre claves. El riesgo es usar C para convertir letras Unicode a minúsculas o heredar un locale sin revisión. Los datos combinados se componen a NFC antes de proteger ñ; eliminar marcas NFD indiscriminadamente convertiría ñ en n. No se utilizará unaccent como sustituto automático de la regla aprobada.

Cuarenta y cinco entradas no demuestran equivalencia universal. ICU, Node y PostgreSQL pueden usar versiones Unicode distintas; repetir corpus y registrar versiones ante actualizaciones. No cambiar títulos guardados, ni desplegar un cambio silencioso del helper versionado. Tampoco se afirma que quitar U+0300–U+036F quite toda marca Unicode o que lower sea case folding completo. [Colaciones y operaciones en PostgreSQL 17](https://www.postgresql.org/docs/17/collation.html).

**Recomendación H/P:** ICU determinista explícita para la conversión, comparación literal C para el LIKE normalizado, preservando el contrato `es-nfc-preserve-enye-v1`. Si falta ICU o no coincide el corpus en 17.11, detener y presentar alternativas. Ni cambiar de colación ni ampliar equivalencias se aprueba implícitamente.

### 2.2 Cómo comprobar reproducibilidad en Supabase, cuando se autorice

1. Diagnóstico SELECT acotado: versión/encoding reales, propiedades de pg_database y colaciones existentes, proveedor, determinismo y versiones registrada/actual. Usar catálogos, no depender de SHOW lc_collate. No consultar credenciales, títulos de usuarios o tablas privadas.
2. Confirmar que el motor 17.11 aislado use el proveedor y versiones pertinentes. Un cliente psql 17.11 no sustituye ese motor. Preparar solo datos sintéticos, sin credenciales de producción, correo o Cron real.
3. Comparar los 45 vectores y añadir sistemáticamente NFC/NFD, combinaciones de marcas, ñ/n, ü, sigma, I turca, ß, CJK, emoji y signos. Comparar bytes UTF-8 de salida, longitud normalizada y resultados literales, no solo cómo se ven en pantalla.
4. Antes de crear helpers remotos, una futura consulta SELECT puede evaluar el algoritmo sobre constantes del corpus, con expresiones/CTE y colaciones ya presentes. Su preparación/ejecución remota requiere autorización aparte; este bloque no la ejecuta ni crea archivos SQL nuevos.
5. Comprobar en el servidor el formato canónico exacto y el vector SHA-256 del bloque 1. `jsonb::text` con espacios no es automáticamente equivalente a JSON.stringify. Validar también ámbito real del llamador, ausencia de identidad suministrada por el cursor y rechazo uniforme de cursores incompatibles.
6. Tras una futura instalación autorizada, comprobar la función real por REST con anon/A/B/C/D y respuestas HTTP/error. No reducir el test a SQL Editor ejecutado como propietario. Guardar versiones, hashes de fixtures y salidas sintéticas reproducibles.
7. Ante actualización ICU/servidor/Node: revisar equivalencias y dependencias antes de reutilizar cursores o índices. No sobrescribir un helper indexado sin plan de reconstrucción. Refrescar solo el número de versión de colación no reconstruye sus índices. [Mantenimiento de versiones de colación](https://www.postgresql.org/docs/17/sql-altercollation.html).

## 3. Qué consultas examinaron 13.000 tuplas

L4: recálculo de las muestras guardadas, **sin ejecutar consultas nuevas**. Dataset: 10.000 publicaciones y 3.000 subastas, sin índices ni PK, caché caliente, un cliente. Cada caso tiene tres muestras; la mediana siguiente es descriptiva de tres valores, no un p50 estable de producción.

| Caso del runner | Mediana SQL observada, ms | Visitas aproximadas de scans | Filas de salida, con lookahead |
| --- | --- | --- | --- |
| recent | 20,263 | 13.000 | 13 |
| mixed-price | 18,608 | 13.000 | 13 |
| two-PS | 61,029 | 13.000 | 13 |
| two-PC | 60,383 | 13.000 | 13 |
| two-VR | 59,642 | 13.000 | 13 |
| two-DS | 59,131 | 13.000 | 13 |
| two-common | 59,513 | 13.000 | 13 |
| two-absent, ZZ | 54,516 | 10.000 | 0 |
| two-literal, %_ | 59,684 | 13.000 | 13 |
| three-plus, pokemon | 59,428 | 13.000 | 13 |
| combined | 13,984 | 13.000 | 13 |
| deep-recent | 1,636 | 13.000 | 13 |
| deep-price_asc | 8,553 | 13.000 | 13 |

En 36 de las 39 muestras de ese tamaño hubo 13.000 visitas: un scan de 10.000 productos y otro de 3.000 resúmenes de subasta. **No son 13.000 publicaciones ni un contador de lecturas físicas de disco.** La métrica aproxima filas procesadas por nodos scan, incluyendo descartadas y loops; no se suman indiscriminadamente todas las filas de cada nodo del árbol.

Ejemplos: para PS, el scan de productos produjo 834 y descartó 9.166; para el filtro combinado produjo 167 y descartó 9.833. Ambos recorrieron los 10.000 productos. Con ZZ no sobrevivió ningún producto y el scan de subastas tuvo cero loops. Las búsquedas sin resultados tampoco son necesariamente baratas.

### 3.1 Trabajo demostrado frente a explicación hipotética

- **T3/L4:** scans secuenciales, hash join, cálculo de precio derivado y sort. No se usó índice. Los sorts finales ocuparon aproximadamente 17–22 KiB; el tope 12 + 1 reduce la salida, no evita todos los scans.
- **L4:** el precio mixto depende de productos y subastas antes del límite; un índice simple en products.price no representa la puja vigente. La clave del cursor y el rango deben usar ese mismo precio efectivo.
- **H:** normalizar títulos y evaluar fragmentos explica parte del salto de aproximadamente 20 ms a 60 ms. No se midió CPU de cada función: no se afirma que sea el único cuello de botella ni cuántas veces la evaluó el optimizador.
- **H:** el filtro combinado probablemente evita conversiones/evaluaciones costosas de parte de las filas, aunque sus scans sigan visitándolas. Que tarde menos con el mismo contador muestra que ese contador solo no decide el coste.
- **P:** planes de la RPC real, cachés genérica/específica, costes RLS, ancho real de filas, I/O, red y escrituras concurrentes. El esquema temporal omite incluso índices/constraints existentes en producción. El RSS de Node/WASM, unos 694 MiB al final de la fase, no estima memoria por consulta o usuario de Supabase.

El orden lógico filtrar → ordenar → paginar no fija el orden físico de evaluación del planner. Un LIMIT previo a la búsqueda o una ordenación solo de tarjetas cargadas falsearía el resultado y queda descartado. [Lectura de EXPLAIN](https://www.postgresql.org/docs/17/using-explain.html).

## 4. Evaluación de índices sin instalarlos

| Candidato | Evidencia actual | Evaluación recomendada y límite |
| --- | --- | --- |
| (created_at DESC, id DESC) | L4: 001 ya declara products_created_idx solo por fecha; prueba temporal no tenía ninguno | H: desempate compuesto podría ayudar. Comparar primero el esquema real y páginas profundas; no duplicar por asumir que falta todo índice |
| Categoría/modalidad + fecha/ID | L4: existen índices simples de categoría/propietario; combined fue más rápido sin reducir visitas | H: beneficio según selectividad y planes. No construir todas las combinaciones de filtros |
| Precio/ID parcial para fixed/offers | No se ensayó ningún índice | H: puede ayudar a rama no subasta. No resuelve el orden mixto ni justifica reordenar por precio inicial |
| GIN de bigramas por expresión | T3: pares cortos y signos funcionan semánticamente, pero con scan | P: demostrar helper versionado/inmutable, tamaño y coste de mantenimiento; conservar recheck LIKE literal. Los pares frecuentes pueden seguir devolviendo casi todo |
| GIN trigramas por expresión | Sin pg_trgm instalado en este ensayo | P: probar términos con trigramas útiles y patrones que no los tengan. No prometer aceleración para %PS% o signos |
| Índice de precio en auctions / ramas UNION | T3: join/orden mixto funciona sin copiar precio | H: comparar ramas disjuntas y merge global de candidatos suficientes. Medir impacto sobre cada puja; no denormalizar products ni crear reloj paralelo |

Un índice de expresión solo puede usar funciones que cumplan los requisitos de inmutabilidad; el candidato temporal STABLE no los cumple. Declararlo IMMUTABLE para silenciar el error sería una corrección inválida. Revisar toda dependencia, colación, versiones y plan de reconstrucción antes de optar por esa forma. Tampoco un índice en products puede mirar otra tabla para capturar highest_amount. [Índices de expresión](https://www.postgresql.org/docs/17/indexes-expressional.html), [requisitos de CREATE INDEX](https://www.postgresql.org/docs/17/sql-createindex.html).

Patrones sin trigramas extraíbles pueden degenerar en scan completo del índice; tres caracteres tampoco garantizan selectividad. No se cambia el mínimo de dos ni se instala pg_trgm preventivamente. [pg_trgm oficial](https://www.postgresql.org/docs/17/pgtrgm.html).

### 4.1 Criterios objetivos propuestos para decidir

Los criterios se propusieron en esta revisión histórica. Después se aprobaron como orientaciones, no umbrales absolutos: mejora de 25% en latencia o 40% en recursos y límite orientativo de 10% en degradación de escrituras. Toda excepción requiere resultados y justificación; no son SLA ni resultados obtenidos:

1. Comparar **baseline PostgreSQL 17 con índices/constraints actuales y RLS activa**, no el fixture sin índices, bajo igual hardware, dataset, estadísticas, roles y caché. Cubrir 100/1.000/10.000, 0/30/80% subastas, categorías uniformes/sesgadas, fragmentos frecuentes/ausentes/signos y cursores de inicio/final.
2. Obtener al menos 200 observaciones por celda y preferiblemente 1.000 para estudiar colas; 1/5/10/20 conexiones independientes. Registrar todas las cancelaciones y fallos, p50/p95/p99 y variación. No estimar concurrencia real mediante Promise.all sobre una cola PGlite.
3. Mantener los objetivos ya propuestos en el diseño: a 10 clientes, p95 DB ≤250 ms en 1.000 y ≤500 ms en 10.000; p99 por debajo del presupuesto de 2 s. Comprobar también latencia REST y colas. Si se cumplen con margen de recursos, **no añadir un índice por el mero número de tuplas**.
4. Si la baseline no cumple o satura CPU/I/O/colas dentro de la carga aprobada, identificar la rama costosa con planes. Como umbral técnico inicial **propuesto**, pedir mejora repetible de al menos 25% en p95 de la rama problemática, o 40% de CPU/buffers por consulta cuando ese sea el recurso limitante. Excluir mejoras dentro del ruido. El porcentaje no reemplaza conseguir el presupuesto final.
5. No aceptar un beneficio de lectura que degrade más de 10% el p95 de pujar o crear/editar publicaciones frente a la misma baseline; cero fallos nuevos de atomicidad, anti-snipe, permisos o historial. Estos porcentajes de balance lectura/escritura requieren aprobación y pueden revisarse antes del ensayo, no después para ocultar un fracaso.
6. Registrar tamaño del índice, WAL por operación, tiempo/bloqueo de construcción, recursos de mantenimiento y recuperación ante fallo. Presupuesto de espacio concreto pendiente del laboratorio/plan real; no inventar capacidad disponible. Aceptar solo lo necesario. B-tree/trigramas/bigramas tienen autorizaciones de ensayo e instalación separadas.

Construcción regular y CONCURRENTLY tienen efectos y recuperación distintos; CONCURRENTLY no cabe dentro de una transacción única de migración y puede dejar un índice inválido tras un fallo. La autorización de escribir una migración futura no habilitará su ejecución ni una construcción en vivo. [CREATE INDEX y concurrencia](https://www.postgresql.org/docs/17/sql-createindex.html).

## 5. Seguridad de la futura RPC

### 5.1 RLS, datos públicos y permisos mínimos

- Mantener el contrato aprobado: RPC nueva SECURITY INVOKER, STABLE, search_path vacío, nombres cualificados y SELECT con proyección explícita; sin SQL dinámico procedente del usuario. Si se usa una vista, también debe respetar permisos del invocador. No introducir un definer para arreglar un error de permisos.
- Fuentes: products, campos públicos necesarios de profiles y resumen público de auctions. Precio inicial o highest_amount válido, según bid_count. **No necesita auction_bids, auction_results, intercambios, citas, chat, entregas, tokens, incidentes, reclamaciones, holds ni orders.** MAX de un ledger filtrado por RLS podría dar un precio distinto por usuario y queda descartado.
- El DTO excluye correos, teléfonos, documentos, localización exacta, buyer_id, bidder_id, highest_bid_id, nonces, datos de pago, motivos privados y notas administrativas. Solo importe/estado/revisión/tiempos públicos de subasta y datos de tarjeta previstos.
- Matiz de privacidad: owner_id y seller_name ya aprobados son identificador y nombre de perfil público para enlazar al vendedor. No constituyen anonimato total y pueden ser datos personales, aunque sean públicos. No se puede prometer «ningún dato personal». Si se exigiera anonimato absoluto, cambiaría el contrato y los enlaces de perfiles y requeriría una decisión expresa distinta; no se hace aquí.
- Revocar EXECUTE de PUBLIC de la **firma nueva** dentro de su futura transacción y conceder lo mínimo a anon/authenticated; helper invoker en namespace propio no expuesto `catalog_private`, con permisos mínimos requeridos y entradas acotadas. No otorgar escritura, roles administrativos ni acceso a esquemas privados. Namespace no expuesto no sustituye privilegios.
- Comparar anon/A/B/C/D y AAL1/AAL2 donde corresponda: moderación no concede acceso adicional al catálogo. Comprobar roles efectivos, propiedad y BYPASSRLS; ejecutar como postgres/propietario no demuestra RLS. Ensayar filas ocultas del laboratorio y errores sin filtración de existencia.

Invokers y RLS son el mecanismo recomendado; un definer propietario puede saltarse esas políticas. [Funciones de Supabase](https://supabase.com/docs/guides/database/functions), [RLS en PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

### 5.2 Límite heredado que no resuelve la nueva RPC

**L4, no comprobación remota de filtración:** 001/005 declaran SELECT a nivel de tabla para products/profiles/auctions, con políticas de lectura pública. 005 también concede auction_snapshot a anon/authenticated y esa función devuelve to_jsonb de la fila de auctions. El cliente actual la utiliza en su servicio de subastas. La nueva RPC puede omitir campos, pero no elimina el acceso más amplio por esas rutas.

RLS restringe filas, no columnas. Por tanto, no afirmar que limitar el DTO elimina de todo el proyecto la exposición de identificadores internos como highest_bid_id. Debe clasificarse cada columna como pública/interna/privada y comprobarse el destino real antes de anunciar esa garantía. Revisar también `auction_bid_history`, cuya lectura pública de historial/alias es una decisión existente distinta del ledger privado; no se necesita para tarjetas.

Recomendación: auditoría acotada de proyecciones/grants y de la respuesta snapshot **antes de producción**, en tarea separada. No revocar SELECT general ni modificar snapshot dentro de la migración de catálogo: rompería clientes por ID, perfiles, favoritos o detalle de subasta sin un plan de compatibilidad. Mantener un grant de tabla y revocar solo uno de columna tampoco logra la restricción esperada. [Seguridad de columnas de Supabase](https://supabase.com/docs/guides/database/postgres/column-level-security).

### 5.3 Cursores, parámetros y coste

| Control | Exigencia del servidor futuro | Evidencia actual |
| --- | --- | --- |
| Solicitud | Objeto con allow-list de claves; tipos/rangos; máximo 4 KiB, búsqueda 90 puntos/512 bytes antes de normalizar, página 1–12 | T3 prueba parte del contrato mediante JS, no validación RPC SQL |
| Búsqueda | Vacío explora; uno devuelve ayuda; dos o más buscan fragmento literal. Escape !, %, _, sin regex ni concatenación de SQL | T3: Unicode/LIKE locales; coste y transporte reales P |
| Cursor | Versión/forma exactas; 1,5 KiB; fecha UTC válida con microsegundos o precio; UUID canónico; fingerprint compatible con filtros/orden/tamaño/ámbito | Pruebas previas JS; serialización/verificación SQL P |
| Cursor alterado válido | Solo cambia una posición pública; no es autorización ni MAC | No consultar si su ID existe/está oculto; RLS se reevalúa; errores neutrales |
| Cambios durante navegación | Precios en sitio; aviso y more bloqueado; refresh confirmado desde primera página; sesión nueva limpia datos | Bloque 2 probado con clientes sintéticos; integración visible/Realtime P |
| Páginas | Tope duro y lookahead; sin total_count ni indicadores de investigaciones | Prototipo cumple en fixtures, no limita endpoints directos ya autorizados |
| Abuso | Límite de cuerpo antes de parsear, tasa/concurrencia en capa confiable, cancelación y presupuesto DB | Validar parámetros y debounce en React no detiene peticiones directas o saturación |

Presupuesto aprobado como objetivo: 2 s, timeout recuperable, sin reintentos ilimitados. Supabase documenta configuración a nivel de función para REST; se debe probar la ruta exacta, cancelación y reutilización de conexiones. La transacción READ ONLY + SET LOCAL del runner no acredita por sí sola ese comportamiento en PostgREST/pooler. No aumentar timeouts globales ni modificar roles compartidos para acomodar el catálogo. [Timeouts oficiales](https://supabase.com/docs/guides/database/postgres/timeouts).

La futura RPC no debe llamar auction_snapshot, settle_auction_locked, advance_auction_clock, place_auction_bid o wrappers de negocio transitivos. L4: snapshot obtiene locks y llama settle; settle puede escribir ganador/notificaciones/estado. STABLE y un nombre que parezca lectura no sustituyen revisar el árbol de llamadas. auctions_health actual sí es una lectura; la RPC puede obtener su propia hora sin llamarla por tarjeta.

## 6. Compatibilidad revisada por migración

Revisión de archivos locales; las definiciones efectivamente instaladas deben contrastarse mediante diagnóstico autorizado antes de una futura instalación.

| Migración | Dependencias/restricciones observadas | Regla de compatibilidad y prueba pendiente |
| --- | --- | --- |
| 001 marketplace | products.price numeric(12,0), perfil FK, created_at/UUID, índices simples; set_updated_at y validate_product_image; SELECT público y escritura por propietario | Solo leer columnas públicas. No UPDATE de normalización, columna nueva ni cambio de imagen/updated_at. Comparar detalle, edición, perfiles y favoritos |
| 002 meetings | product_title conserva contexto, product_id puede quedar null por borrado; citas con unicidad por exchange; RLS por participante; lugares públicos activos | No unir esos estados privados para inferir disponibilidad; no reescribir títulos de citas ni reinterpretar registros huérfanos históricos |
| 003 conflicts | Reemplaza respond_exchange/change_appointment; serializa intercambio y luego cita/revisión | Catálogo no toca firmas ni adquiere locks de filas/advisory. No restaurar accidentalmente la versión antigua de 002 |
| 004 chat | Miembros/reads/bloqueos/reportes con RLS; funciones de conversación y locks propios | No consultarlos desde catálogo ni inferir investigación/bloqueo por sus errores. No nuevas suscripciones privadas |
| 005 auctions | products admite auction; auction.product_id único; resumen de pujas y precio inicial; grants públicos; guards completos; Cron y snapshot pueden cerrar | SELECT del resumen, sin ledger ni cierres. Guard compara to_jsonb de la fila salvo excepciones: no backfill/columna derivada. No alterar anti-snipe: puja en último minuto inclusive añade 120 s al deadline anterior |
| 006 delivery QR | Slot único por producto no cancelado; delivery_lock usa producto → intercambio → cita → entrega; cambios de contexto invalidan tokens; producto protegido por to_jsonb | No activar guards con escrituras, no leer tokens ni tratar entrega como pago/disponibilidad pública. Preservar QR/historial y comparar huellas en laboratorio |
| 007 claims | claim_lock añade entregas ordenadas y reclamación al orden de locks; holds por operación, MFA; historial/snapshots y evidencias privadas | Sin joins de claims/holds ni llamadas a moderación. El estado privado no se publica como badge de catálogo. Comparar snapshots, auditoría y lecturas autorizadas |
| 008 cash, pendiente | Nueve tablas, app_private y preflight exclusivo; product_updated_at en términos; cash_product_guard; nuevas proyecciones y snapshots; reemplaza respond_exchange/change_appointment con producto antes de intercambio | No crear app_private, orders, nombres cash_* o columnas en productos; no activar efectivo/pagos. Usar namespace de catálogo independiente. No copiar firmas anteriores sobre 008. Probar dos secuencias lógicas en laboratorio, manteniendo efectivo apagado |

Un SELECT ordinario no ejecuta triggers de UPDATE/INSERT/DELETE, ni necesita los locks de fila de esos RPCs. Eso evita introducir un nuevo orden de locks comercial. **No garantiza ausencia absoluta de bloqueo:** SELECT usa locks ordinarios de relación y una construcción DDL de índice sí puede bloquear escrituras. Los problemas de concurrencia existentes tampoco quedan resueltos por añadir esta RPC.

Pruebas de independencia: 001–007 → objetos de catálogo y copia con 001–007 → 008 deshabilitada → catálogo; también revisar el orden lógico inverso como ensayo, no como instrucción de instalación. La numeración y el historial reales se revisarán antes de preparar un archivo nuevo. No renombrar/marcar aplicada 008 ni usar db push indiscriminado que pueda arrastrarla. Cambios de tipos de fila o snapshots no son parte de esta solución.

### 6.1 Geografía futura

Conservar todo Querétaro como cobertura de lanzamiento aprobada y expansión por estados, todavía no implementada. El área actual y profiles.city no sustituyen municipio canónico. No añadir filtros municipales, GPS, backfill de ubicación o índices geográficos al catálogo v1.

Cuando se implemente: incorporar estado/municipio y versión de política pública a filtros/cursores, invalidar cursores previos y definir qué se muestra de una subasta pausada. La suspensión de pujas/reloj/adjudicación seguirá siendo responsabilidad del motor del servidor, no de ocultar tarjetas. La RPC deberá leer los futuros campos públicos aprobados sin cerrar subastas ni consultar motivos administrativos privados. Retomar geografía después de Fase 8 con su autorización propia.

## 7. Tabla de problemas, riesgos y decisiones

Las recomendaciones mantienen el contrato comercial ya aprobado. No se solicita de nuevo aprobar dos caracteres, ñ/n, máximo 12, más recientes, separación financiera o ausencia de snapshot.

| Problema / evidencia | Riesgo | Solución recomendada | Alternativas | Pruebas necesarias | ¿Requiere autorización? |
| --- | --- | --- | --- | --- | --- |
| P: sin motor 17.11 probado | Migración aparentemente válida en 18 que falle o cambie resultados en destino | Esperar laboratorio 17 compatible y diagnóstico SELECT del destino | Posponer bloque 5; proyecto remoto aislado solo si se autoriza y evalúa coste | Corpus, contrato, RLS y carga en 17 | Sí para laboratorio/conexión; no autorizados aquí |
| T3: C/default difieren de JS | ñ/acentos o Unicode inconsistentes | ICU determinista explícita como candidato; fallo cerrado si no coincide | Helper Unicode versionado alternativo, solo tras demostrar semántica/coste; no fallback ASCII | Corpus ampliado y versiones reales | Confirmar enfoque técnico condicionado; colación/extensión nueva requiere permiso aparte |
| P: helper STABLE no indexable | Declaración IMMUTABLE falsa o índice incorrecto tras actualización | Sin índice de expresión inicialmente; justificar y versionar antes | Baseline calculada; implementación realmente inmutable revisada | Volatilidad transitiva y mantenimiento ICU/índices | Sí si cambia implementación o se ensaya/instala índice |
| T3/L4: scans de 13.000 tuplas | CPU/carga acumulada, aunque una consulta local sea rápida | Baseline 17 con índices existentes y criterios de §4.1 | Comparar ramas/índices concretos tras medir | 1/5/10/20 conexiones, percentiles y recursos | Aprobar criterios propuestos; ensayos de índices después |
| P: orden mixto con precio cambiante | Omitir o duplicar tarjetas entre páginas | Precio efectivo servidor; orden total/cursor; política de aviso ya aprobada | Snapshot persistente sería otra arquitectura, fuera de alcance | Pujas durante páginas, rango y orden global | Regla actual ya aprobada; snapshot necesitaría nueva decisión |
| P: fingerprint/validación solo JS | Cursores aceptados indebidamente, trabajo excesivo o fuga en errores | Validación completa y canónica dentro del servidor | Cursor firmado no sustituye RLS y añade gestión de secretos innecesaria aquí | Vectores, tipos hostiles, cambio de ámbito, transporte inválido | Autorizar preparación del bloque 5 solo tras requisitos; sin ejecutar DDL ahora |
| L4: SELECT amplio y snapshot completo heredados | DTO mínimo interpretado falsamente como privacidad de todas las rutas | Inventario/proyección de columnas en tarea separada antes de producción | Grants por columna o API/vista compatible, después de revisar consumidores | Anon/A/B/C/D, detalle de subasta, llamadas directas, errores y Realtime | Sí para cualquier cambio de grants/RPC existente; nada cambia aquí |
| L4: nombre/UUID públicos del vendedor | Prometer anonimato inexistente | Mantener solo perfil público aprobado y no prometer ausencia total de datos personales | Rediseñar anonimato y enlaces si el propietario lo desea | DTO y recorrido a perfiles; revisión de privacidad | Conservar diseño ya aprobado no requiere nueva decisión; cambiarlo sí |
| P: RLS no ensayada en prototipo | Bypass por propietario/definer o vistas | Invoker, roles reales y pruebas negativas de laboratorio | No usar definer para evitar errores | Roles efectivos, grants, campos y filas ocultas, MFA sin privilegio extra | Mecanismo ya aprobado; ejecutar pruebas/configurar laboratorio requiere permiso |
| L4: comparación de fila completa y preflight 008 | Guards rechazando backfill, choque de namespace o reinstalación accidental | Sin cambios de fila/tabla histórica; catálogo independiente de app_private | Rediseños aditivos separados solo si fueran necesarios | Ambos esquemas, hashes de historia y firmas 003/008 | Sí antes de nueva migración; 008 sigue sin instalar |
| P: timeout/tasa no verificados por REST | API directa satura recursos o sigue trabajando tras abort del cliente | Presupuesto DB probado y protección confiable para todas las rutas | Capa de acceso con cuotas, diseño de producción separado | Cancelación real, pooler, body grande, abuso y reintentos acotados | Sí para configuración remota/infraestructura; no elevar globalmente |
| P: índice útil pero costoso al escribir | Puja lenta, WAL/locks o fallo de construcción | Medir balance lectura/escritura; construir solo lo demostrado | Mantener baseline o revisar consulta primero | p95 de puja, anti-snipe, almacenamiento y recuperación DDL | Sí para ensayo e instalación, por separado |

## 8. Decisiones históricas antes del bloque 5 y resolución posterior

1. **No saltar los requisitos pendientes:** inicialmente se propuso aplazar la redacción del bloque 5. La autorización posterior permitió prepararlo y publicarlo, conservando validación 17.11, RLS y mediciones representativas como condiciones previas a instalar. El laboratorio sigue sujeto a autorización; este documento no solicita instalar Docker/WSL2. Cualquier diagnóstico remoto de lectura necesitará autorización concreta propia.
2. **Ratificar el enfoque técnico del normalizador:** ICU determinista explícita como candidato, C solo para la comparación literal posterior, sin fallback ni cambio de reglas si falla la equivalencia. No equivale a autorizar crear colaciones o extensiones.
3. **Aceptar la estrategia mínima de índices:** comenzar comparando el esquema existente; no incluir índices de búsqueda/precio nuevos en una migración por defecto. La lista final de objetos del bloque 5 dependerá de las mediciones. No convertir hipótesis de bigramas/trigramas en decisiones instaladas.
4. **Aprobar o ajustar los criterios técnicos propuestos de §4.1:** conservar objetivos previos y decidir si los umbrales de beneficio 25%/40% y límite de degradación de escritura 10% son adecuados para el ensayo. Son criterios de laboratorio, no garantías públicas.
5. **Separar la revisión de exposición heredada antes de producción:** autorizar posteriormente su diagnóstico y alcance, sin tocar ahora grants ni auction_snapshot. No mezclar cambios de esa API con una migración de catálogo sin identificar consumidores y pruebas. El inventario documental realizado aquí no autoriza corregirla automáticamente.

Las cinco decisiones se aprobaron posteriormente y se autorizó redactar y publicar el bloque 5 sin esperar al laboratorio; las validaciones del destino se conservaron como requisito para instalar. Instalarlo será otra autorización; no ejecutar 008, crear entornos o publicar por arrastre. Si el propietario decide aplazar el laboratorio, conservar esta revisión como punto de reanudación.

## 9. Trabajo efectivamente realizado en este bloque

Lectura de documentos, código y ocho migraciones; consulta de documentación oficial; recálculo descriptivo del JSON existente; nuevo informe documental. **No se ejecutó SQL, ni local ni remoto, ni se repitió rendimiento o una prueba funcional.** Los resultados T3 son evidencia anterior identificada, no resultados nuevos.

No se modificó código, migraciones, configuración, PostgreSQL 18 o respaldos, ni se instalaron herramientas/extensiones. No tiene sentido presentar un lint/build anterior como ejecutado en esta revisión de documentación.

Comprobación histórica al terminar el bloque 4: SHA-256 de los **230 archivos registrados al inicio**, incluidos los archivos privados locales comprobados, sin cambios ni faltantes. Solo se añadió este informe; se validaron UTF-8, espacios finales y los cinco enlaces relativos de aquella versión. Sin coincidencias de valores privados de los archivos de entorno en el documento. Se generó un manifiesto interno de huellas bajo `.cache`, sin contenido de credenciales. HEAD era `70dcf6b199ecb9df2954f90d1994f8f1161678b3` y el índice estaba vacío. En aquel bloque no hubo commit ni push; el estado posterior figura en la guía vigente.
