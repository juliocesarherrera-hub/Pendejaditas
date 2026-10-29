# Catálogo: bloque 3, preparación y pruebas locales disponibles

> Estado al 29 de octubre de 2026: consultar la [guía vigente y trazabilidad](CATALOGO-ESTADO-Y-DOCUMENTACION.md). El código del catálogo está publicado como preparación; la 009 no está instalada y el catálogo paginado no está integrado. La edición por ID sí está implementada y publicada. Los resultados y estados Git de cada bloque son evidencia histórica, no pruebas nuevas de esta revisión documental. Este documento sigue pendiente de autorización para commit.

28 de octubre de 2026. Alcance: prototipo efímero con herramientas existentes. No se ha instalado la RPC, una migración, índice, extensión ni laboratorio persistente. Supabase no se consultó. El [diseño aprobado](DISENO-RPC-CATALOGO-PAGINADO.md) y los bloques [1](PRUEBAS-CONTRATO-CATALOGO.md) y [2](PRUEBAS-CATALOGO-RESULTADOS-CAMBIANTES.md) permanecen intactos.

## 1. Herramientas verificadas y separación

| Componente local | Comprobación real | Uso en este bloque |
| --- | --- | --- |
| Clientes privados 17.11 | psql, pg_dump, pg_restore y pg_dumpall muestran 17.11 desde `%LOCALAPPDATA%\Pendejaditas\Tools\PostgreSQL-17.11-5\bin` | Solo `--version`; ninguna conexión, exportación ni credencial |
| Motor nativo 17 | `postgres.exe` no existe en esa carpeta de clientes | No hay servidor 17.11 preparado allí; los clientes no sustituyen al servidor |
| PostgreSQL nativo 18 | Servicio `postgresql-x64-18` Running/Automatic antes y después; existen postgres/initdb y el cliente psql muestra 18.6 | Sin conexión al servicio, inicio/parada, cambios de puerto, roles o configuración. No se presupone su versión SQL menor por la versión del cliente |
| PGlite ya instalado | Paquete 0.5.12; `version()` devuelve PostgreSQL 18.6, WASM 32 bits | Instancia nueva `new PGlite()` sin dataDir, extensiones, credenciales ni sockets |
| Node existente | v24.21.0; Unicode 17.0, ICU 78.3 | Orquestación, referencia JS, medidas del proceso y archivos de resultados sintéticos |
| libpg-query existente | 18.2.0, parser de PostgreSQL 18 | Parseo del fixture y las tres ramas SELECT; no certifica sintaxis de 17 por sí solo |
| Docker / WSL | Docker no encontrado en PATH; existe wsl.exe como comando de Windows | No se ejecutó WSL ni se comprobó una distribución; no se instaló/configuró ninguno |

PGlite permite una base efímera en memoria sin otro servicio. No es una máquina Linux ni un clon completo de Supabase. En este bloque no se usa persistencia, se cierra con `finally`, y el proceso termina al acabar. Los únicos archivos generados son código/documentación y JSON de métricas sintéticas bajo `.cache`. No se abren respaldos ni perfiles de conexión. [Documentación oficial de PGlite](https://pglite.dev/docs/about), [opciones de almacenamiento](https://pglite.dev/docs/api#datadir).

La versión remota **esperada según el historial** es 17.11; no se volvió a consultar. Por tanto **no se declara equivalencia 17.11 validada**, aunque muchos mecanismos SQL sean comunes.

## 2. Archivos nuevos y cómo ejecutar

| Archivo | Propósito |
| --- | --- |
| `scripts/catalog-postgres-local.mjs` | Runner cerrado a PGlite efímero: sondeo, comparación Unicode, pruebas SQL y mediciones opcionales |
| `scripts/catalog-lab/fixture.sql` | Dos tablas temporales, normalizador candidato y escape literal. Guard exige PGlite y marcador local; no es una migración ni debe pegarse en SQL Editor |
| `scripts/catalog-lab/query.sql` | SELECT parametrizado con tres órdenes estáticos; únicamente `pg_temp`, filtros antes de paginar y máximo 12 más una fila |
| `scripts/support/catalog-postgres-corpus.mjs` | Casos Unicode, solicitudes y generador determinista de publicaciones/subastas sintéticas |
| Este informe | Disponibilidad, hallazgos, métricas, índices candidatos y trabajo pendiente |

No hay cambios de package.json, lockfile, configuración, UI ni de los scripts antiguos. El runner no admite host, URL, cadena de conexión, credenciales ni ruta de una base existente. No importa scripts de efectivo ni carga las migraciones 001–008.

```text
node scripts/catalog-postgres-local.mjs
node scripts/catalog-postgres-local.mjs --performance
```

El primer comando ejecuta pruebas funcionales. El segundo repite esas pruebas y mide 100/1.000/10.000 filas, 30% subastas, distribución uniforme, sin índices. Cada ejecución crea un JSON nuevo con creación exclusiva (`wx`), sin sobrescribir informes anteriores. `.cache` está excluida de Git.

También queda preparado `--matrix`: 18 combinaciones de tamaño, 0/30/80% subastas y categorías uniformes/sesgadas (90% Consolas). **No se ejecutó esa matriz de rendimiento**. Sí se comprobó en JavaScript que los 18 generadores producen las proporciones indicadas.

## 3. Normalización y comparación con JavaScript

Se conservó exactamente la referencia aprobada: NFC, minúsculas, separar/proteger ñ, NFD del resto, quitar marcas U+0300–U+036F y volver a NFC. No se modifican títulos históricos. El prototipo usa una colación ICU determinista **ya presente**, `und-x-icu`, para `lower`; no crea colaciones ni instala ICU. El LIKE posterior usa comparación literal `COLLATE "C"` y escape `!`. Es importante distinguir la colación de conversión a minúsculas de la de comparación del patrón. PostgreSQL documenta que las colaciones influyen en `lower` y en las comparaciones; `normalize` necesita UTF-8. [Cadenas en PostgreSQL 17](https://www.postgresql.org/docs/17/functions-string.html), [colaciones en PostgreSQL 17](https://www.postgresql.org/docs/17/collation.html).

Motor medido: UTF8, proveedor predeterminado libc, datcollate=C, datctype=C.UTF-8. ICU `und-x-icu` y `unicode`: deterministas, versión registrada/actual `153.128`. Ese identificador se conserva tal como lo entrega PostgreSQL, sin convertirlo en una supuesta versión de Supabase.

| Comparación del normalizador completo | Resultado sobre 45 entradas |
| --- | --- |
| ICU explícita frente a JS | 0 diferencias en el corpus |
| `lower` con C frente a JS | 15 diferencias; por ejemplo POKÉMON → pokEmon y NIÑO → niNo |
| `lower` predeterminado de esta instancia frente a JS | 1 diferencia: ΟΣ → οσ, frente a ος de JS/ICU |

Incluye NFC/NFD, ñ/Ñ y tilde combinada, diéresis, acentos españoles, griego, cirílico, I turca, ß, CJK, emoji/ZWJ/selectores de variación, ancho completo y signos. Las búsquedas sin acentos no convierten n en ñ, ß en ss ni ancho completo en ASCII. Cuarenta y cinco entradas no prueban equivalencia de todo Unicode ni de todas las versiones de ICU.

Conclusión técnica: **no usar C para la conversión Unicode a minúsculas ni depender silenciosamente del locale de la base**. ICU explícita es un candidato coherente con el corpus, condicionado a comprobar su existencia y resultados en PostgreSQL 17.11. La función candidata se declara STABLE, no IMMUTABLE: todavía no se afirma que sea utilizable correctamente en un índice. Esa decisión requiere revisión de dependencia/versionado de colaciones; no se cambia la semántica aprobada para evitar una diferencia.

## 4. Qué SQL se probó y qué no es una RPC

Se crearon únicamente objetos temporales del nuevo motor. `products.price` se modeló como numeric(12,0), siguiendo 001; importes de subasta como bigint, siguiendo 005. Se omitieron constraints, índices, triggers y columnas ajenas a la consulta. No hay PK/índices implícitos. Este esquema angosto no representa el coste de filas reales con descripción y demás columnas.

La consulta construye precio efectivo desde publicación/subasta, comprueba correspondencia de vendedor y resumen, filtra búsqueda/categoría/modalidad/rango, aplica cursor y orden y limita la respuesta. No consulta el ledger de pujas, ganadores, mensajes, QR, reclamaciones ni datos financieros. No llama RPCs del motor ni adjudica subastas.

| Prueba realmente ejecutada | Resultado |
| --- | --- |
| 45 entradas de normalización | ICU coincide con referencia JS; diferencias alternativas registradas |
| 48 pares de LIKE reales | PS/PC/VR/DS, ñ, Unicode, %, _, !, barra inversa y texto con comillas coinciden literalmente |
| 143 páginas comparadas contra referencia | Correctas; datasets 0/1/12/13/100, tres órdenes, filtros, búsqueda y empates con microsegundos; sin duplicados en recorridos estáticos |
| Precio global | Fijo, ofertas, subasta inicial y puja más alta coinciden con referencia en las páginas verificadas |
| Dos filas anómalas de subasta | Excluidas antes del límite, sin fallback a precio fijo |
| Siete solicitudes inválidas | Detenidas por el runner JS antes de ejecutar SELECT |
| Totales antes/después de lecturas | Conteos/importes/revisiones de fixtures iguales; no mutación de dominio |
| Parser local | Fixture y ramas recent/price_asc/price_desc correctas con parser 18; ejecución real en PGlite 18.6 |

**Límite de este prototipo histórico:** las siete validaciones de solicitud/fingerprint son las del bloque 1, ejecutadas en Node; este runner no implementa una RPC completa. Después se preparó y publicó la validación de p_request y del fingerprint en el borrador 009, ensayada en PGlite, sin instalarla en Supabase. El destino real sigue pendiente de verificación. Estas pruebas del prototipo no justifican confiar en React: su SELECT acota la salida, pero no reemplaza el contrato del servidor.

Los recorridos completos SQL llegan a 100 registros; las mediciones de 1.000/10.000 verifican muestras de primera y últimas posiciones contra JS, **no un recorrido exhaustivo de todas sus páginas**. No se promete snapshot entre llamadas.

En la preparación se corrigieron dos problemas locales: el primer sondeo intentaba leer lc_collate como parámetro de sesión, y se pasó a consultar pg_database; el SELECT inicial dejaba sin tipo una clave de cursor no utilizada por cierta rama (42P18), y ahora tipa ambas claves explícitamente. Las ejecuciones posteriores completas pasaron. Los informes anteriores se conservan.

## 5. Rendimiento observado, sin índices instalados

Ejecución final de referencia: RUN-B3-PERF-01 (informe sintético privado original, conservado sin modificar). 13 casos por tamaño, un calentamiento por caso y tres muestras de EXPLAIN: **117 muestras**, sin errores ni timeout. Concurrencia 1, memoria/caché caliente, 30% subastas, distribución uniforme. Casos: recientes, precio mixto, PS/PC/VR/DS, par frecuente, par ausente, signos literales, búsqueda de tres o más, filtro combinado y cursor cercano al final en recientes/precio ascendente.

| Publicaciones | Subastas | Máximo SQL observado entre esos casos | RSS de Node al terminar la fase | Máximas visitas aproximadas de tuplas de scans |
| --- | --- | --- | --- | --- |
| 100 | 30 | 1,227 ms | 607,676 MiB | 130 |
| 1.000 | 300 | 9,047 ms | 616,273 MiB | 1.300 |
| 10.000 | 3.000 | 61,952 ms | 693,539 MiB | 13.000 |

**No son tiempos de Supabase, un SLA ni percentiles fiables.** Tres repeticiones por celda solo permiten observar variación inicial. El RSS incluye Node, WASM, inicialización y fixtures, no solo tablas; es una muestra final, no un pico de memoria certificado. Al cerrar el proceso no queda un laboratorio ni servicio nuevo en segundo plano.

El planner usó scans secuenciales y ordenamientos; no apareció ningún índice. Para 10.000 publicaciones se llegó a recorrer 10.000 productos y 3.000 resúmenes de subasta para devolver hasta 13 filas. Una búsqueda sin coincidencias también puede recorrer todos los productos. LIMIT reduce respuesta, no garantiza poco trabajo. Los buffers medidos fueron de la instancia en memoria: no sirven para estimar I/O de SSD, red o servicio administrado.

### Métricas registradas y métricas futuras

| Métrica | Cómo se registra/interpreta |
| --- | --- |
| Planning/Execution Time | EXPLAIN ANALYZE JSON; ejecución instrumentada del SELECT, no latencia HTTP |
| wallMs | Reloj Node alrededor de inicio de transacción/timeout/EXPLAIN; excluye rollback final. No equivale al tiempo SQL puro |
| Scan visits | Suma por nodos scan de (Actual Rows + Rows Removed by Filter) × Actual Loops. Aproximación con redondeo de EXPLAIN; no filas únicas ni suma de todos los nodos del plan |
| Índices/planes | Nombres de índice, tipos de nodos, loops, filas devueltas/filtradas; cero índices en esta baseline |
| Ordenamiento | Método, espacio utilizado y memoria/disco del sort |
| Buffers | Valores del nodo raíz, separados en shared/local/temp; no sumar ancestros e hijos duplicando contadores |
| Recursos de proceso | RSS/heap Node y CPU de la fase, que incluye validación JS y WASM; no CPU exclusiva del servidor ni consumo nativo de PostgreSQL 18 |
| Relación | pg_total_relation_size de las tablas temporales, no tamaño del proyecto/backups |
| Timeouts | SET LOCAL statement_timeout=2s en lecturas de calentamiento y EXPLAIN; cada transacción termina con ROLLBACK. Fallos se registran separados y provocan salida no exitosa, no lista vacía ni reintento ilimitado |

EXPLAIN ANALYZE sí ejecuta la sentencia. Aquí solo se usa con el SELECT propio sobre fixtures; no se debe aplicar indiscriminadamente a RPCs con efectos. [EXPLAIN oficial](https://www.postgresql.org/docs/17/sql-explain.html), [interpretación de planes](https://www.postgresql.org/docs/17/using-explain.html).

Para el laboratorio real: al menos cientos de muestras por celda, y preferiblemente 1.000 para explorar colas, reportando p50/p95/p99, máximos, cantidad de errores y timeout por separado. Repetir con 1/5/10/20 conexiones independientes y pausas/ráfagas, datos anchos y categorías sesgadas; comparar caché fría/caliente e índices existentes. Las metas anteriores de dos segundos y p95 del diseño siguen siendo objetivos por validar, no conclusiones de este ensayo.

## 6. Búsquedas de dos caracteres e índices candidatos

Se mantienen permitidas PS/PC/VR/DS y otras parejas. No se introduce mínimo de tres, prefijos ni diccionario de siglas. Pares frecuentes y sin coincidencias pueden examinar muchas filas; aquí la búsqueda de tres o más también normaliza títulos durante el scan. El resultado no demuestra que los términos cortos sean baratos bajo carga.

| Candidato, todavía NO instalado | Posible beneficio | Coste/riesgo y criterio futuro |
| --- | --- | --- |
| B-tree fecha DESC + ID DESC | Continuación reciente sin OFFSET | Comparar con products_created_idx real, selectividad de filtros y join; no duplicar índices por intuición |
| Categoría/modalidad + fecha/ID | Filtros frecuentes y páginas recientes | Depende de distribución; almacenamiento, WAL y mantenimiento en escritura |
| B-tree precio/ID para fijo/ofertas | Orden directo de modalidades no subasta | No resuelve precio efectivo mixto ni precio variable de otra tabla |
| GIN por expresión de bigramas | Candidatos de fragmentos de dos puntos de código | Helper versionado realmente inmutable; tamaño de postings, pares frecuentes y coste por edición. Recheck literal y orden siguen siendo necesarios |
| GIN trigramas | Posible mejora de fragmentos con trigramas útiles | Requiere pg_trgm y autorización; patrones sin trigramas extraíbles degeneran en scan completo del índice. No prometer solución a %PS% |
| Índice sobre precio de subasta | Puede ayudar a una rama de UNION/merge bien medida | Toda puja cambia la clave: medir latencia, WAL y contención; no copiar precio a products ni activar cierres |

La documentación de pg_trgm explica la pérdida de eficacia cuando no hay trigramas extraíbles; eso requiere medición específica, no instalar la extensión como solución automática. [pg_trgm oficial](https://www.postgresql.org/docs/17/pgtrgm.html).

**Recomendación actual: no instalar ningún índice nuevo todavía.** La baseline sirve para identificar trabajo y comparar después; omite incluso índices/constraints que producción ya tiene. No es una comparación antes/después ni evidencia suficiente para escoger bigramas, trigramas o ambos. La fase siguiente deberá medir beneficio y coste de escritura en el entorno autorizado. No se cambia la declaración de volatilidad de un helper solo para que PostgreSQL acepte un índice.

## 7. Dependencias de subastas, RLS y compatibilidad

- 001: products, campos públicos de profiles, tipos y permisos SELECT. No normalizar/actualizar filas almacenadas. Fotografías quedan fuera de esta prueba.
- 005: unicidad de auctions.product_id y resumen persistido highest_amount/bid_count/revision son dependencias reales. El prototipo no lee auction_bids ni resultados privados; tampoco verifica la integridad criptográfica de pujas. No se cambian anti-snipe, Cron, deadlines ni guard de productos. La cardinalidad 1:1 debe comprobarse en el diagnóstico autorizado del destino; no se instala esa unicidad en este fixture.
- 002–007: ninguna función de citas, chat, QR, reclamaciones o moderación se reemplaza ni ejecuta. No usar datos de investigaciones privadas para ocultar productos o revelar disponibilidad.
- 008 pendiente: no se ejecutó ni importó. No se crean app_private, órdenes, columnas de producto, precios financieros ni backfills. El prototipo temporal no cambia fingerprints de product_updated_at, guards o registros históricos. La prueba aislada de compatibilidad con 008 en ambos órdenes lógicos del diseño sigue pendiente; no implica autorizar su instalación.
- RPC futura: SECURITY INVOKER, STABLE, search_path vacío, proyección pública explícita y validación del servidor. Roles/grants/RLS actuales deben leerse y comprobarse bajo anon/A/B/C/D, no como postgres. Ser moderador no debe ampliar el catálogo a campos privados.

**No se probó RLS en este bloque.** Las tablas temporales pertenecen al runner y no reproducen Auth, JWT ni políticas del proyecto. PostgreSQL permite bypass de RLS a propietarios/superusuarios en ciertos contextos: una prueba como propietario no demuestra privacidad. [RLS oficial](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

Casos preparados para el laboratorio compatible: comparación de catálogo público entre anon/A/B/C/D; filas ocultas expresas y resúmenes de subasta no visibles; intento de cursor de otro ámbito; ausencia de ledger, chat, reclamaciones y datos financieros en DTO/errores; permiso retirado durante paginación; igualdad de precio público; consulta simultánea con puja y cierre controlados; huellas antes/después de tablas de dominio. No usar cuentas reales ni credenciales de producción allí.

## 8. Lo pendiente y las herramientas necesarias

| Comprobación | Estado / necesidad |
| --- | --- |
| Preparación SQL y corpus local | Realizada con lo ya instalado; sin herramienta adicional |
| PostgreSQL 17.11 + colación/ICU del destino | Pendiente. Clientes 17 no bastan: hace falta motor 17 aislado y autorizado, o stack local compatible cuando se retome el laboratorio con SSD |
| RPC SQL completa y fingerprint canónico en servidor | Pendiente; este SELECT no es la RPC ni una migración preparada para instalar |
| RLS/Auth/JWT/PostgREST | Pendiente en entorno compatible con roles de laboratorio y pruebas de privilegios mínimos; no simularlo como validado por estas tablas temporales |
| Realtime/Cron/citas/QR/reclamaciones | Pendiente; workers, correos, notificaciones externas y salidas de red deberán quedar aislados/desactivados |
| Matriz 0/30/80%, sesgo y todos los cursores 10.000 | Generadores preparados; rendimiento completo y recorrido exhaustivo aún no ejecutados |
| Índices alternativos y coste de escritura | Pendiente de autorización para ensayarlos solo en laboratorio; pg_trgm no se necesita para la baseline actual |
| Carga real, concurrencia, I/O y red | Pendiente en motor 17/stack local; PGlite de una conexión no mide transacciones concurrentes reales aunque se lance Promise.all |
| Restauración aislada y respaldos | Fuera del alcance; no se restauró ni alteró ninguno. Las pruebas del catálogo no certifican recuperación |

No se necesita instalar nada para repetir estos ensayos efímeros. Para cerrar el bloque con garantías del destino sí hará falta el laboratorio 17 compatible que sigue sujeto a autorización; no conviene usar el servicio PostgreSQL 18 existente como sustituto silencioso. No se propone crear un proyecto Supabase ni conectar los scripts a producción.

## 9. Conservación y cierre

Solo se añadieron los cinco archivos de este bloque. La comprobación final SHA-256 de los **225 archivos registrados al inicio** no encontró modificaciones ni archivos faltantes: conserva los 73 cambios anteriores, bloques 1/2, configuración privada y migraciones. Al concluir aquel bloque, el índice estaba vacío y HEAD era `70dcf6b199ecb9df2954f90d1994f8f1161678b3`. Los JSON de resultados están ignorados por Git; no contienen credenciales ni datos reales. La comprobación local de los cinco archivos nuevos no encontró coincidencias de valores privados de los archivos de entorno.

Se repitieron y pasaron las **28 pruebas del bloque 1 y 34 del bloque 2**. Lint final sin errores ni avisos nuevos; queda el aviso previo de `scripts/backup/artifact-controls.mjs:7:98`, sin modificarlo. Después del último ajuste del directorio de informes volvió a pasar la prueba funcional SQL; la medición de referencia anterior no cambia porque no se modificó la consulta ni el método de medición. No se ejecutaron build ni suite general en este bloque al no cambiar aplicación o scripts existentes; sus resultados anteriores no se presentan como nuevos. El servicio nativo 18 permanece Running/Automatic, sin conexión desde el runner ni cambios de configuración.

Estado: preparación y ensayo local preliminar realizados; **bloque 3 no certificado contra Supabase 17.11**. Detener antes de instalar herramientas, crear el laboratorio persistente, ejecutar una migración o modificar Supabase. Sin commit ni push.
