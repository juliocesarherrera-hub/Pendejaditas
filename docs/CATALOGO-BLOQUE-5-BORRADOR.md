# Catálogo: bloque 5 preparado localmente

> Estado al 29 de octubre de 2026: consultar la [guía vigente y trazabilidad](CATALOGO-ESTADO-Y-DOCUMENTACION.md). El código del catálogo está publicado como preparación; la 009 no está instalada y el catálogo paginado no está integrado. La edición por ID sí está implementada y publicada. Los resultados y estados Git de cada bloque son evidencia histórica, no pruebas nuevas de esta revisión documental. Este documento sigue pendiente de autorización para commit.

**Actualización autorizada de permisos:** se endurecieron exclusivamente las ACL de las seis funciones nuevas y el diagnóstico de lectura. Consultar [permisos 009](CATALOGO-009-PERMISOS.md) para la versión vigente y los nuevos tests. Los resultados y siete archivos del bloque original se conservan como evidencia anterior; no implican instalación.

28 de octubre de 2026. **Borrador y adaptador sin instalar ni integrar en el catálogo visible.** La autorización más reciente permite preparar este bloque antes de completar el laboratorio 17.11; mantiene todas las validaciones como condición previa a instalar. Sustituye únicamente el aplazamiento de la redacción indicado en [bloque 4](CATALOGO-BLOQUE-4-REVISION.md), no sus reglas de privacidad, compatibilidad o pruebas.

## Decisiones conservadas y alcance

- ICU explícita sigue siendo candidata. Ñ y n distintas, acentos ignorados, Unicode combinado, fragmentos de dos caracteres y signos literales. Ante una diferencia en 17.11, detener; no degradar a otro locale, ILIKE, mínimo de tres o cambio de reglas.
- Medir primero con índices existentes. No se incluye ningún índice nuevo, extensión, columna, tabla, política RLS ni backfill en el borrador.
- Mejoras 25% de latencia o 40% de recursos y degradación de escrituras no mayor del 10% son **orientaciones aprobadas, no cortes absolutos**. Considerar máximos, estabilidad, frecuencia, espacio y mantenimiento. Cualquier excepción necesita resultados medidos y justificación explícita; no basta ajustar la meta después de fallar.
- La auditoría de grants SELECT y respuestas antiguas sigue separada y es condición previa al lanzamiento. No se modifican esos permisos ni auction_snapshot. La RPC solo devuelve el DTO público aprobado; nombre e ID públicos del vendedor no equivalen a anonimato.
- Efectivo, pagos digitales y geografía siguen fuera del alcance. 008 no se instala ni se modifica.

## Numeración y archivos

Se inspeccionó el directorio local: 001–007 y `202610260008_cash.sql`. **En aquella revisión 009 estaba libre localmente; hoy su borrador está publicado fuera de migrations**. No se consultó historial remoto; puede requerir otra numeración si el destino contiene cambios no conocidos.

| Archivo preparado en este bloque | Contenido |
| --- | --- |
| `supabase/drafts/202610280009_catalog.sql` | Borrador transaccional, un esquema privado y seis funciones nuevas; fuera del descubrimiento automático de migraciones |
| `src/lib/catalog-rpc.js` | Validador UX, consulta RPC, traducción del DTO a tarjetas y reutilización del lote de subastas de solo lectura |
| `supabase/diagnostics/audit-catalog.sql` | Una sentencia SELECT de metadatos para antes/después de una instalación futura |
| `scripts/catalog-draft-checks.mjs` | Parseo y ensayo SQL/RLS/atomicidad en PGlite nuevo y desechable |
| `scripts/catalog-rpc-checks.mjs` | Contratos del adaptador con transporte inyectado y compatibilidad con controlador preparado |
| Este informe | Resultados, límites y decisiones pendientes |
| [INSTALAR-CATALOGO-RECUPERACION.md](INSTALAR-CATALOGO-RECUPERACION.md) | Procedimiento futuro con instalación bloqueada y recuperación sin borrar historia |

No se añade nada a `supabase/migrations`. No usar db push para publicar este trabajo: podría incluir la 008 pendiente. No se modifican package.json, lockfile, App, hooks, páginas, servicios previos ni los bloques 1–4.

## Borrador SQL

Objetos nuevos, exclusivamente:

| Objeto | Responsabilidad y propiedades |
| --- | --- |
| `catalog_private` | Namespace no destinado a exponerse en Data API; solo USAGE/EXECUTE mínimos, sin CREATE para clientes |
| `search_key_v1(text)` | Normalización candidata ICU, STABLE/INVOKER, sin modificar títulos; no falsamente IMMUTABLE para crear un índice |
| `trim_v1(text)` | Trim explícito/versionado, IMMUTABLE/INVOKER |
| `pattern_v1(text)` | Escape literal !/%/_, IMMUTABLE/INVOKER |
| `cursor_time_v1(text)` | Fecha UTC estricta con seis decimales, STABLE/INVOKER |
| `fingerprint_v1(...)` | Array canónico compacto y SHA-256 con auth.uid real, STABLE/INVOKER; sin identidad suministrada por el usuario ni secreto de firma |
| `public.catalog_page_v1(jsonb)` | Validación del servidor, tres ramas estáticas y DTO público, STABLE/INVOKER, search_path vacío y timeout candidato de función 2 s |

El guard de borrador exige un marcador de validación aislada. Sin él falla antes de crear objetos. Solo admite el motor objetivo 17.11 o el PGlite 18.6 conocido para pruebas preliminares. **El marcador es una barrera contra ejecución accidental, no autorización ni control de seguridad. No debe configurarse en Supabase para forzar este borrador.** Su revisión para una versión instalable requiere todos los gates y autorización nueva.

Preflight: dependencias products/profiles/auctions/auth.uid, RLS habilitada en fuentes, columnas requeridas, UTF8, ICU determinista con versión registrada/actual coincidente y ausencia de nombres previos. No presupone que 17.11 esté probado por aceptar su número. No reemplaza objetos existentes; repetición falla cerrada. No crea app_private ni consulta orders/claims/delivery_operations.

La validación rechaza claves desconocidas, tipos inválidos, rangos invertidos, más de 12, búsqueda excesiva y cursores incompatibles. Uno normalizado devuelve query_too_short. El servidor normaliza término y título, aplica filtros antes del límite y utiliza precio inicial o puja vigente del resumen público. No usa el ledger privado ni funciones de cierre, tampoco locks de fila/advisory o contadores de visitas.

Orden reciente por fecha/ID descendentes; precio por valor efectivo/ID ascendente o descendente. Se obtiene una fila adicional para has_more, sin total_count. El cursor se deriva de la última tarjeta enviada, mantiene microsegundos y no consulta si su ID existe. Fingerprint sin firma: una posición pública válida reconstruida puede aceptarse, siempre sujeta a límites y RLS.

La corrección posterior limpia ACL iniciales no propietarias de las seis funciones, no solo PUBLIC, y concede EXECUTE sin delegación a anon/authenticated; aborta ante herencia o ACL de esquema inesperadas. Son permisos de **objetos nuevos**, sin cambios de grants/RLS actuales. El propietario de funciones no transforma al invoker en definer. La implementación sigue la [recomendación oficial de invoker](https://supabase.com/docs/guides/database/functions).

Errores de permiso y cancelación/timeout se propagan para clasificar el transporte; otros errores no previstos devuelven unavailable sin nombres de tablas ni datos. El timeout de función está documentado para REST por Supabase, pero todavía debe demostrarse en la ruta real y pooler, no por su presencia en proconfig. No se cambiaron timeouts globales/roles. [Timeouts oficiales](https://supabase.com/docs/guides/database/postgres/timeouts).

## Adaptador para React, todavía aislado

`createCatalogRpcPages(client)` usa un cliente existente inyectado. No carga .env, importa claves, crea clientes administrativos o monta efectos. `page(input,{cursor,signal})` acepta los filtros UI preparados (`category,type,sort,query,min,max,sessionKey`) y manda exclusivamente `{p_request:...}` a catalog_page_v1. sessionKey solo forma una clave local; no se envía como usuario/rol autorizado.

El adaptador:

- Rechaza un carácter o datos inválidos antes de consultar por UX; la validación de seguridad se repite en SQL.
- Envía el texto original para que el servidor normalice; no crea patrones SQL ni filtros PostgREST con texto del usuario.
- Verifica versión, normalización, consistencia, banderas financieras apagadas, tamaño, forma del cursor, ausencia de duplicados y campos exactos del DTO. Datos privados/extra o precios de subasta contradictorios causan error neutro.
- Mapea explícitamente a la forma actual de tarjetas; conserva precio efectivo y reloj. La imagen procede del bucket público product-images por ruta validada, no de archivos privados.
- Distingue invalid_request/query_too_short/invalid_cursor, conexión, permisos, timeout y not_installed. No degrada a descargar todo el catálogo si falta la RPC.
- Pasa AbortSignal al SDK y descarta resultados si fue cancelado. No guarda listas/caché por cuenta, no añade reintentos, timers o suscripciones. La generación de estado sigue siendo tarea del controlador.
- Reutiliza auctionUpdates del servicio existente: lote máximo 12, SELECT de resumen y lectura auctions_health. Sin auction_snapshot, llamadas por tarjeta o modificaciones de subasta.

Se probó el controlador del bloque 2 con el adaptador inyectado para precio mixto, carga siguiente y bloqueo por cambio. No se modifica su validador anterior: antes de una integración visible deberá usar la clave de catalogRpcQuery y mostrar los nuevos códigos de error/ayuda. Esa preparación de UX pertenece al bloque de integración; el ensayo de compatibilidad no acredita esa pantalla como operativa.

## Diagnóstico futuro

`audit-catalog.sql` tiene una sola sentencia SELECT. No ejecuta catalog_page_v1, no recorre registros de productos, pujas o usuarios ni consulta documentos/tokens. Revisa:

- Versión/encoding y colaciones; tablas fuente, columnas, índices y políticas actuales.
- Presencia de las seis firmas, invoker/volatilidad/configuración, EXECUTE de PUBLIC y de roles previstos.
- SHA-256 del cuerpo de cada función nueva para compararlo con el borrador revisado, no solo su nombre.
- Presencia de orders/app_private como metadatos, **sin inferir si efectivo está habilitado**.
- Publicación Realtime actual y límite explícito: exposición de schemas en API, runtime RLS y equivalencia 17 aún no quedan certificados.

Antes de instalar se esperan funciones ausentes; no es un fallo que justifique repetir 001–008. Después, presencia/hash/permisos correctos no sustituyen llamadas de prueba por los roles reales. No se ejecutó el diagnóstico en Supabase.

## Pruebas realmente realizadas y límites

Las pruebas SQL crean un **cluster PGlite nuevo en memoria**, roles anon/authenticated sin SUPERUSER/BYPASSRLS y tablas mínimas con RLS. auth.uid lee una identidad sintética de laboratorio. No son JWT reales ni las cuentas configuradas de producción. Se ejecutan las sentencias del borrador allí; no se aplica una migración a un proyecto ni se ejecutan 001–008. El motor se cierra en finally.

| Grupo local | Resultado al preparar el informe |
| --- | --- |
| `catalog-draft-checks.mjs` | 13 grupos correctos; 252 lecturas RPC, 218 páginas comparadas con JS; Unicode, tres órdenes, filtros y RLS de fixtures anon/A/B/C/D |
| Fingerprint SQL | Coincide con vector dorado del bloque 1 y casos Unicode/comillas/escapes/ámbitos; antes solo se había probado en JS |
| Atomicidad | Guard sin marcador rechazado; error intermedio revierte todos los objetos nuevos; repetición rechazada; datos y grants de fuentes iguales |
| Diagnóstico | Parseado como SELECT único y ejecutado antes/después en memoria; hashes de los seis cuerpos coinciden con el archivo |
| Datos privados | Filas y perfiles ocultos por políticas sintéticas; resumen de subasta oculto no revela tarjeta; acceso a orders denegado; sin columnas privadas en DTO |
| Permisos | Rol no propietario, sin bypass; UPDATE de productos y CREATE en catalog_private rechazados; ninguna escritura o permiso administrativo añadido |
| Compatibilidad 007/008 | Sentinelas privados, app_private y firmas antiguas conservados; **no es una ejecución de las restricciones/triggers completos de 008** |
| `catalog-rpc-checks.mjs` | 12 grupos correctos, transporte inyectado: errores, cancelación, signos, validación DTO, cursor y controlador preparado |

RLS se ejecutó realmente en PostgreSQL **PGlite 18.6 sobre fixtures**, algo distinto de afirmar que RLS instalada en Supabase 17.11 ya pasó. No se utilizó el servicio PostgreSQL 18 ni se abrió conexión TCP. No se ensayó rendimiento representativo de esta RPC completa ni se compararon índices nuevos. El máximo de 12 y el timeout escrito no prueban protección contra abuso en producción; los endpoints SELECT actuales siguen existiendo.

Comprobaciones finales adicionales:

| Verificación | Resultado |
| --- | --- |
| Contrato bloque 1 | 28 grupos correctos, archivo original intacto |
| Controlador bloque 2 | 34 grupos correctos, archivo original intacto |
| Preparación de catálogo/edición | 22 grupos correctos |
| `npm test` | Suite general correcta; sus archivos SQL solo se analizan localmente, no se instalan |
| `npm run lint` | Sin errores ni avisos nuevos; permanece el aviso previo de `scripts/backup/artifact-controls.mjs:7:98`, sin modificarlo |
| `npm run build` | Correcto; compilación del catálogo visible actual, no despliegue ni activación del adaptador todavía no importado |
| Preservación | SHA-256 de los 231 archivos registrados al inicio, sin cambios ni faltantes; solo los siete archivos nuevos enumerados |
| Privacidad/Git | Sin coincidencias de valores privados de .env en los archivos añadidos; enlaces/UTF-8/espacios revisados; índice vacío y HEAD sin cambios |

Los subprocesos locales de Vite necesarios para regresión/build se ejecutaron con la autorización adicional concedida; no se eludieron rechazos. No hubo pruebas remotas ni instalación. Un manifiesto interno de huellas queda bajo `.cache`, sin contenido de credenciales. El servicio PostgreSQL 18 permanece Running/Automatic; estas pruebas no abrieron una conexión con él.

## Riesgos y decisiones todavía pendientes

1. Validar motor 17.11/ICU y corpus en el entorno aislado autorizado. Si no reproduce las reglas, parar y proponer alternativas, sin instalar ni cambiar búsqueda.
2. Validar Auth/JWT/PostgREST, grants/roles reales, exposición de schemas y cancelación/timeouts por REST. El guard del archivo no demuestra esos controles.
3. Ejecutar matriz representativa con esquema/índices reales, RLS y concurrencia; justificar cualquier excepción a los objetivos orientativos. No instalar índices automáticamente.
4. Probar compatibilidad funcional completa con 001–007 y copia con 008 deshabilitada cuando se autorice el laboratorio; comparar guards, firmas y registros históricos en ambos órdenes lógicos previstos. Los sentinelas no sustituyen esa prueba.
5. Acordar selección e historial de una instalación 009 sin arrastrar 008; comprobar numeración remota con permiso de lectura. No renombrar 008 ni marcarla aplicada ficticiamente.
6. Antes de lanzamiento, completar la auditoría separada de exposición heredada. Ninguna aprobación de este borrador cambia esos permisos.

La siguiente autorización no debe confundirse con dinero real, publicación, instalación o integración visible. Mantener este borrador fuera del flujo automático y seguir el [procedimiento de instalación y recuperación](INSTALAR-CATALOGO-RECUPERACION.md). Detención actual: **sin instalación ni integración remota**.
