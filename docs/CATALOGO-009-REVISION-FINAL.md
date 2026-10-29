# Catálogo 009: revisión final de compatibilidad y seguridad

> Estado al 29 de octubre de 2026: consultar la [guía vigente y trazabilidad](CATALOGO-ESTADO-Y-DOCUMENTACION.md). El código del catálogo está publicado como preparación; la 009 no está instalada y el catálogo paginado no está integrado. La edición por ID sí está implementada y publicada. Los resultados y estados Git de cada bloque son evidencia histórica, no pruebas nuevas de esta revisión documental. Este documento sigue pendiente de autorización para commit.

**Actualización posterior autorizada:** el hallazgo de EXECUTE por default privileges se corrigió en el borrador y el diagnóstico locales. El estado vigente, hash, matriz de permisos y pruebas están en [CATALOGO-009-PERMISOS.md](CATALOGO-009-PERMISOS.md). Las descripciones siguientes del diagnóstico limitado, hash anterior y archivos intactos conservan la evidencia de la revisión previa; ya no describen la versión actual de esos archivos. Instalación y demás gates siguen pendientes.

28 de octubre de 2026. **Preparación local revisada; instalación NO autorizada ni validada todavía.** Complementa el [bloque 5](CATALOGO-BLOQUE-5-BORRADOR.md) y el [procedimiento de instalación y recuperación](INSTALAR-CATALOGO-RECUPERACION.md). No sustituye las condiciones aprobadas ni cambia el orden de instalación.

El borrador sigue en `supabase/drafts/202610280009_catalog.sql`, fuera de `supabase/migrations`. SHA-256 histórico de la revisión inicial, no del archivo publicado: `76bd1940ee7a0f01f93be2cdf21e6c012aefb2a9185814d83b0de7c2549ebe70`. No se modificaron ese archivo, 001–008, el adaptador ni el diagnóstico. Se añadieron este informe y `scripts/catalog-final-review-checks.mjs`.

## 1. Evaluación ejecutiva

No se encontró una dependencia SQL de la 009 que obligue a instalar la 008 para leer el catálogo. El diseño evita reemplazos, escrituras comerciales, acceso a tablas privadas y llamadas de cierre de subastas. Esas propiedades y las pruebas preliminares son favorables; **no equivalen a una aprobación para instalar**.

En la revisión inicial se reprodujo una limitación concreta, después corregida localmente como documenta el informe de permisos: las concesiones por defecto del propietario pueden añadir EXECUTE para un rol distinto de anon/authenticated. En aquella versión el REVOKE no eliminaba concesiones a todos los roles posibles y el diagnóstico no las enumeraba. La versión publicada limpia las concesiones iniciales no propietarias e inventaría ACL y permisos efectivos; la comprobación del destino real sigue pendiente. Antes de instalar, debe ampliarse la comprobación de ACL y revisar cada concesión efectiva. No se cambió ningún permiso ni el borrador para corregirlo en esta revisión.

Permanecen bloqueantes la validación 17.11/ICU, RLS por las rutas reales, rendimiento de la RPC completa, compatibilidad funcional del esquema completo con/sin 008 y restauración aislada. La auditoría de exposición heredada sigue siendo una condición adicional de lanzamiento, separada de los permisos del catálogo nuevo.

## 2. Relación exacta con la 008 pendiente

| Dependencia o punto de contacto | Resultado de lectura | Alcance de la evidencia |
| --- | --- | --- |
| Fuentes directas de 009 | `public.products`, `public.profiles`, `public.auctions`, `auth.uid()`; catálogos PostgreSQL en el preflight | Proceden de 001/005/Auth; no requieren tablas de efectivo |
| Namespaces | 008 crea `app_private`; 009 crea `catalog_private` | Nombres distintos; no se comparte ni reemplaza el esquema privado |
| Tablas nuevas de 008 | Opciones, órdenes, declaraciones, enlaces, eventos y tablas privadas de política/contexto/recibos | 009 no las consulta, altera, crea ni necesita sus grants |
| RPC reemplazadas por 008 | `respond_exchange` y `change_appointment`, con producto antes de intercambio en el orden de locks | 009 no define ni llama estas firmas; no restaura sus versiones anteriores |
| Producto y términos | 008 vincula términos a `product_updated_at` y añade `cash_product_guard` | 009 no escribe el producto ni cambia `updated_at`, título, precio, fotos o términos |
| Citas, QR y reclamaciones | 008 añade guards/proyecciones sobre esas operaciones | Las lecturas directas de 009 no ejecutan triggers de INSERT/UPDATE/DELETE; no consultan tokens, holds o expedientes |
| Subastas | Precio derivado del resumen de 005 | No depende de opciones de efectivo ni cambia anti-snipe, Cron, pujas o adjudicación |
| RLS y permisos de fuentes | 008 añade permisos/políticas para sus objetos; no reemplaza los SELECT del catálogo en products/profiles/auctions | Confirmación estática del archivo local, pendiente contrastar con metadatos del destino |
| Versiones financieras del DTO | 009 devuelve `payments_enabled=false` y `cash_enabled=false` | Compatible con la decisión actual de mantenerlas deshabilitadas; no es una consulta de disponibilidad financiera ni un interruptor de 008 |

**Con 008 ausente:** la nueva prueba ejecutó el borrador en un cluster PGlite desechable sin `orders` ni `app_private` y leyó el catálogo en transacciones READ ONLY bajo anon y cuatro identidades sintéticas. Eso demuestra independencia de esos objetos en los fixtures; no acredita toda la instalación 001–007 en 17.11.

**Con 008 instalada pero deshabilitada:** la lectura del código indica compatibilidad, sin colisiones nominales. Las pruebas actuales usan sentinelas privados, no los nueve modelos y todos los triggers/RPC reales de 008. **No se ejecutó 008 en esta revisión, ni siquiera en PGlite.** La prueba funcional completa sigue pendiente.

**Con efectivo activado en el futuro:** no queda certificado este contrato. El flag fijo false no reflejaría esa activación y la v1 no informa si un vendedor acepta efectivo. Antes de activarlo habrá que revisar el contrato/adaptador y la fuente de disponibilidad autorizada, sin convertir el QR en verificación de pago. No se autoriza esa integración ahora.

### Orden de instalación

Se conserva el orden numérico previsto 008 → 009; esta revisión no ordena instalar ninguna. La ausencia de dependencia técnica no autoriza saltarse el historial. Si se quisiera instalar catálogo antes de efectivo, se necesitaría una decisión expresa sobre numeración/historial y selección del archivo, sin marcar 008 aplicada ficticiamente, renombrarla automáticamente o ejecutar `db push` sobre todo el directorio. El historial remoto no fue consultado. 009 solo se considera disponible según los archivos locales.

En el laboratorio futuro: probar primero 001–007 → 009; en otro destino desechable, 001–007 → 008 deshabilitada → 009. Probar también añadir 008 a una copia que ya tenga catálogo, exclusivamente como ensayo de independencia; no como autorización para invertir el orden de producción. Comparar filas, firmas, ACL, restricciones, triggers y flujos QR/citas/reclamaciones antes/después.

## 3. Seguridad de la RPC y límites del diagnóstico

| Control | Comprobación actual | Pendiente antes de instalar |
| --- | --- | --- |
| SECURITY INVOKER | Seis funciones invoker; `search_path=''`; sin SQL dinámico de entrada del usuario | Rol efectivo, membresías, ownership, RLS y grants reales por JWT/PostgREST |
| RLS | Se ejecutó en el motor PGlite con roles sin SUPERUSER/BYPASSRLS y políticas de fixtures; filas ocultas no aparecen | Las políticas sintéticas no sustituyen las instaladas. Probar como anon y A/B/C/D, nunca solo como propietario |
| DTO público | Proyección explícita de 15 campos de tarjeta y ocho del resumen público de subasta; adaptador rechaza campos adicionales | Verificar respuesta real, sensibilidad y necesidad de cada campo; nombre/UUID público del vendedor siguen siendo datos personales/pseudónimos |
| Datos excluidos | Sin bio, correos, teléfonos, mensajes, identidades de pujadores, `highest_bid_id`, motivos de cancelación, expedientes ni archivos privados | Revisar por separado endpoints/grants heredados; el DTO nuevo no los protege automáticamente |
| Permisos nuevos | PUBLIC sin EXECUTE; anon/authenticated tienen USAGE y EXECUTE necesarios, sin CREATE ni nuevas escrituras de negocio | Inventario completo de ACL, default privileges, grant options, membresías y exposición API de schemas |
| Cursor | Forma/tamaño/versión/fechas/rangos/fingerprint validados; sin consulta de existencia del ID del cursor | Fingerprint SHA-256 no firmado: vincula contexto pero no acredita integridad criptográfica ni secreto; no usarlo como autorización |
| Lectura de subastas | SELECT del resumen; no llama `auction_snapshot`, `settle_auction_locked`, `place_auction_bid` ni al reloj | Comprobar llamadas reales y ausencia de efectos de lecturas con el baseline completo |
| Coste | Página máxima 12 + una fila de lookahead, sin total_count; filtros antes de paginar; entrada acotada; timeout candidato 2 s | El límite de salida no limita filas examinadas ni cantidad de peticiones. Medir timeout REST, carga concurrente y controles de abuso |
| Errores | Entradas inválidas tienen códigos neutros; otros fallos inesperados devuelven unavailable. Permisos y cancelaciones se propagan al transporte | Revisar errores HTTP, mensajes/contextos y logs; el adaptador clasifica errores, pero eso no sanea por sí solo lo que recibe un cliente directo |

Invoker conserva los privilegios del llamador; no obliga al propietario, superusuario o BYPASSRLS a sufrir las mismas restricciones de los usuarios. Los permisos de moderación tampoco conceden acceso privado mediante esta RPC. [RLS oficial de PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

### Hallazgo histórico reproducido y corregido localmente: ACL adicionales

En un cluster nuevo se configuró un rol sintético `catalog_review_extra` como destinatario de EXECUTE por defecto. Después se ejecutó **el borrador sin cambios**. `has_function_privilege` siguió devolviendo true para ese rol. El diagnóstico solo informó anon/authenticated y PUBLIC, por lo que no reflejó ese permiso adicional.

Es una cobertura incompleta del control de permisos, **no evidencia de una filtración actual en Supabase ni de bypass de RLS**. No se inspeccionaron roles o credenciales reales. Puede corresponder a un rol de servicio legítimo, un rol personalizado o una concesión inesperada; no debe asumirse ninguna de esas situaciones sin inventario. Los defaults del rol que crea los objetos influyen en sus ACL iniciales. [Documentación oficial](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

El diagnóstico SELECT ampliado ya está preparado y publicado. La lista siguiente conserva los requisitos que motivaron la corrección; todavía falta verificar su resultado en el destino autorizado:

- ACL completas de funciones/esquema y defaults del propietario instalador, incluyendo roles distintos de anon/authenticated, PUBLIC, grantor y grant option.
- USAGE/CREATE efectivos del esquema, propietarios y membresías heredadas; no basta inspeccionar el texto REVOKE.
- Todas las sobrecargas con nombres de catálogo y firmas/configuración/tipos/valores por defecto esperados. El guard ya impide reutilizar el namespace o nombre RPC; el diagnóstico inicial solo enumeraba seis firmas; el publicado también detecta funciones y sobrecargas inesperadas.
- Exposición real de schemas en PostgREST/otras APIs. `catalog_private` necesita USAGE para los helpers, pero no debe estar expuesto como API pública por su nombre de privado. El diagnóstico publicado sigue reconociendo que no comprueba esta configuración.

Resolver una diferencia requerirá otra autorización y un cambio acotado sobre los objetos nuevos; no revocar permisos existentes de la aplicación ni modificar default privileges globales como atajo. Conceder EXECUTE a una función no concede SELECT sobre sus tablas al ser invoker.

### Coste y preflight

El patrón escapado usa `!` como escape, trata `%` y `_` literalmente y compara con COLLATE C. No admite expresiones regulares del usuario. Sin embargo, dos caracteres frecuentes o ausentes pueden recorrer muchas filas; los cursores válidos también pueden ser reconstruidos para repetir trabajo. Se necesitan límites de peticiones/carga medidos, sin prometer que un timeout sea un rate limiter.

La configuración de timeout a nivel de función está documentada por Supabase para la API REST, pero su presencia en `proconfig` no prueba que se cancele a los dos segundos por cada ruta SQL/REST/pooler. Debe medirse con solicitudes controladas en laboratorio y comprobar recuperación del pool y clasificación del error. No cambiar timeouts globales ni roles aquí. [Timeouts oficiales](https://supabase.com/docs/guides/database/postgres/timeouts).

El preflight verifica RLS habilitada y referencia nombres de columnas con WHERE false; **no compara exhaustivamente sus tipos, constraints, políticas o grants**. Hay que confrontar el diagnóstico con el esquema esperado. No aceptar la creación de funciones como demostración de que todas las ramas PL/pgSQL ya resolvieron sus dependencias y planes en el destino.

## 4. PostgreSQL 17.11 frente a PGlite 18.6

| Área | Confirmado / fundamento | Prueba pendiente |
| --- | --- | --- |
| Funciones SQL utilizadas | normalize, lower, sha256, JSONB, agregados, UUID, timestamptz y keysets están documentados para PostgreSQL 17; no se depende de casefold ni otras novedades exclusivas de 18 | Compilar y ejecutar las seis funciones y todas las ramas en 17.11 exacto |
| UTF8 y Unicode | NFC/NFD requieren UTF8. El borrador protege ñ después de NFC/lower antes de retirar marcas U+0300–U+036F | Corpus completo SQL/JS: ñ y n combinadas, acentos, diéresis, signos, scripts adicionales y fechas/cursores |
| ICU | lower usa `pg_catalog."und-x-icu"` determinista explícita; guard comprueba versión registrada frente a actual | Existencia/permisos/versiones del ICU real; igualdad registrada/actual no demuestra igualdad con ICU de PGlite/Node ni semántica idéntica |
| Locale | LIKE final fuerza C; lowercase fuerza ICU; el resto del helper incluye regex sobre marcas y texto intermedio | Comparar salida y bytes con locale de origen/laboratorio y colaciones relevantes; no suponer reproducibilidad total por forzar solo lower |
| Collations no deterministas | No se usan. PostgreSQL 17 restringe pattern matching con ellas; soporte de PostgreSQL 18 no debe introducirse accidentalmente | Mantener la estrategia determinista aprobada; cualquier alternativa requiere nueva decisión |
| Optimizador y recursos | PGlite es WASM 18.6; sus planes, memoria y entorno no representan PostgreSQL 17 nativo/Supabase | EXPLAIN y mediciones de la RPC completa con índices/RLS reales y carga representativa |
| Servicios | PGlite no es Auth, PostgREST, Supavisor, Realtime ni Cron de producción | JWT/roles reales, límites HTTP, schema cache, cancelación/reconexión y aislamiento de servicios en laboratorio |

El guard admite exactamente 170011 y el PGlite conocido 180006. No prueba compatibilidad por aceptar el número. Un parche/versionado distinto debe detener el proceso y revisarse; no editarlo silenciosamente para continuar.

Las reglas aprobadas siguen intactas: sin texto muestra recientes; un carácter pide otro; dos permite PS/PC/VR/DS como fragmentos literales; sin acentos ni diferencias de mayúsculas; ñ distinta de n incluso en forma combinada. No se promete cobertura de todo Unicode por un corpus finito ni se transforma esto en transliteración universal.

Fuentes: [strings/normalización en PostgreSQL 17](https://www.postgresql.org/docs/17/functions-string.html), [ICU y collations en 17](https://www.postgresql.org/docs/17/collation.html), [cambios del motor 18](https://www.postgresql.org/docs/18/release-18.html). Si 17.11 no reproduce el contrato, detener y presentar alternativas; no degradar a ASCII, ignorar ñ/n o imponer tres caracteres.

## 5. Instalación, interrupción y recuperación

El borrador crea un esquema y seis funciones nuevas en BEGIN/COMMIT. No hay backfill, DML comercial, ALTER TABLE, CREATE OR REPLACE, nuevas políticas, índices, extensiones, triggers, tareas o suscripciones. No modifica registros históricos ni añade un nuevo orden de locks de filas. Sí adquiere locks DDL de catálogos; las lecturas usan locks de relación y pueden esperar a DDL concurrente. No se afirma ausencia absoluta de bloqueos.

Los permisos nuevos se ajustan en la misma transacción: no hay una ventana entre commits en que el EXECUTE inicial de PUBLIC deba quedar expuesto. Un fallo antes de COMMIT revierte el conjunto al abortar/cerrar la transacción. Se volvió a probar el error artificial antes del final y el rechazo de repetición; no se probó una caída real de red/proceso ni DDL concurrente en 17.11. [Creación y permisos transaccionales de funciones](https://www.postgresql.org/docs/17/sql-createfunction.html).

| Incidente futuro | Respuesta requerida |
| --- | --- |
| Falla el guard, sintaxis, permiso o lock timeout antes de COMMIT | Detener, concluir la transacción abortada y diagnosticar; no quitar el guard ni copiar fragmentos |
| Se pierde la respuesta del COMMIT | No repetir la 009. Nueva consulta de metadatos autorizada para comparar firmas, hashes, ACL e historial; distinguir aplicado/no aplicado/inconsistente |
| Commit correcto con catálogo visible antiguo | Mantenerlo; las funciones nuevas pueden seguir siendo invocables directamente. No confundir falta de integración UX con endpoint inaccesible |
| Riesgo de seguridad o abuso de la RPC nueva | Solicitar contención específica del objeto nuevo; no modificar grants/RLS antiguos sin autorización. Conservar evidencia y preparar corrección versionada |
| Desalineación PostgREST | NOTIFY solo solicita recarga; verificar REST/schema cache. No repetir DDL para intentar refrescar |
| Problema posterior a instalación registrada | Corrección nueva revisada; sin DROP de datos, repetición de migraciones antiguas o restauración automática sobre producción |

El guard de laboratorio permanece intacto. No configurar `pjd.catalog_draft_validation` en producción para eludirlo. Preparar una versión final instalable requerirá autorización, diff/hash nuevo y método de registro acordado.

### Respaldos actuales

Se revisó el procedimiento privado de recuperación aislada, que no forma parte de este conjunto documental; no se abrieron ni modificaron dump, manifiestos privados o los 16 originales de Storage en esta revisión. La verificación de hashes/cantidades registrada anteriormente se conserva como evidencia anterior, no como una nueva comprobación de recuperabilidad.

- El conjunto anterior a 008/009 conserva el baseline de su fecha. No contiene los objetos nuevos ni cambios posteriores; no equivale a un respaldo inmediatamente anterior a una instalación futura.
- La 009 no mueve datos o archivos ni modifica sus claves/propietarios, por lo que no exige transformar los 16 objetos de Storage.
- `pg_dump` del exportador actual no filtra schemas y debería incluir futuros objetos ordinarios de `catalog_private`/public; **la aceptación de cobertura comprueba específicamente funciones públicas y debe ampliarse para verificar también los cinco helpers, ACL/owner y defaults del esquema nuevo**. No se modificó el exportador.
- Al recuperar el respaldo antiguo: primero restaurar y verificar el baseline aislado, luego aplicar únicamente una revisión final autorizada del catálogo si ese es el destino requerido. No ejecutar la carpeta completa de migraciones sobre la restauración.
- Un respaldo posterior a 009 podría incluir ya esos objetos; no reinstalar encima. Seleccionar objetos/roles gestionados conforme al plan de restauración. Preservar hashes/manifiestos de originales; suplementos o nuevas copias requieren autorización y un conjunto independiente.
- Sigue pendiente restauración aislada compatible con Supabase 17.11; conservar el requisito previo y la decisión de esperar SSD antes de instalar Docker/WSL2. Cualquier nueva captura previa a instalar necesitará alcance/autorización propios.

## 6. Pruebas ejecutadas en la revisión inicial, no repetidas aquí

| Ejecución local | Resultado |
| --- | --- |
| Prueba cruzada histórica no publicada (dependía del borrador 008) | Cuatro grupos correctos; 15 lecturas RPC en READ ONLY entre anon/A/B/C/D sintéticos; ausencia de objetos cash, presencia de sentinelas y limitación ACL reproducida |
| `node scripts/catalog-draft-checks.mjs` | 13 grupos; 252 lecturas RPC, 218 páginas; RLS de fixtures, Unicode, contrato, permisos, atomicidad y ausencia de cambios de dominio correctos |
| `node scripts/catalog-rpc-checks.mjs` | 12 grupos correctos; DTO, errores, cancelación y adaptador aislado |
| `node scripts/catalog-contract-checks.mjs` | 28 grupos correctos; contrato, Unicode, filtros, precios y cursores sintéticos |
| `node scripts/catalog-controller-checks.mjs` | 34 grupos correctos; cambios, solicitudes pendientes, sesión y páginas conservadas |
| `npm run lint` | Sin errores ni avisos nuevos; persiste el aviso anterior `eslint(no-control-regex)` en `scripts/backup/artifact-controls.mjs:7:98`, sin modificarlo |

Las dos pruebas SQL crean clusters PGlite en memoria y los cierran en finally. No instalan 008 ni migraciones en servicios existentes; no usan clientes remotos, .env, claves, respaldos ni el PostgreSQL 18 nativo. El borrador 009 sí se ejecuta exclusivamente dentro de esos fixtures desechables, igual que en bloque 5. No son cuentas/JWT reales. No se repitió una prueba de rendimiento ni se extrapolan métricas del bloque 3 a esta RPC completa.

El manifiesto agregado de rutas y SHA-256 de los 236 archivos fuente registrados al inicio coincide al finalizar, excluyendo únicamente los dos archivos nuevos de esta revisión. Se conservaron todos los cambios anteriores, incluido Fase 8. Al concluir aquella revisión, el índice de Git estaba vacío y HEAD era `70dcf6b199ecb9df2954f90d1994f8f1161678b3`. No hubo commit, push, cambios remotos o instalaciones. No se repitieron build ni la suite general: no se cambió código de aplicación; sus resultados del bloque 5 son evidencia anterior, y aquí se ejecutaron las pruebas específicas enumeradas.

## 7. Riesgos y condiciones concretas antes de instalar

| Riesgo | Nivel / estado | Condición para avanzar |
| --- | --- | --- |
| ACL/default privileges | Corrección y diagnóstico ampliado publicados y ensayados localmente; destino pendiente | Revisar todos los roles, ACL, herencia, SET ROLE y esquemas expuestos reales; detener ante diferencias, sin modificar permisos anteriores automáticamente |
| Diferencia PG17/ICU/Unicode | Alto, pendiente | Corpus y contrato sin discrepancias en 17.11 real, versiones registradas y reproducibles; detener ante diferencias |
| RLS/Auth/REST real no ensayado | Alto, pendiente | Lecturas autorizadas anon/A/B/C/D, filas privadas inaccesibles, DTO mínimo y errores revisados sin propietario/BYPASSRLS |
| Lecturas costosas/abuso | Alto, pendiente | Carga representativa con índices existentes, percentiles/máximos, consumo y concurrencia; cancelación y límites HTTP/peticiones efectivos |
| Compatibilidad completa 008 | Medio, independencia estática y fixtures aprobados | Dos escenarios completos aislados con 008 ausente/presente deshabilitada y regresiones de edición/citas/subastas/QR/reclamaciones |
| Permisos SELECT/respuestas heredadas | Alto, conocido y separado | Auditoría y resolución autorizada antes del lanzamiento; aprobar DTO nuevo no cierra vías antiguas |
| Incertidumbre de instalación e historial | Medio, pendiente | Numeración remota, método de selección de archivo, inventario/hash previo y posterior, propietario responsable y ventana aprobados |
| Recuperación no ensayada | Alto, pendiente | Restauración aislada satisfactoria del baseline y cobertura de objetos nuevos planificada; respaldo vigente previo a intervención conforme a autorización |
| Contrato financiero fijo false | Medio, contenido para estado actual | Mantener efectivo/pagos deshabilitados; revisar contrato por separado antes de cualquier activación futura |
| Cambios entre páginas | Limitación conocida aceptada | Mantener aviso de resultados cambiantes, bloquear cargar más y reiniciar explícitamente; no prometer snapshot entre páginas ni confundir pruebas de fixtures con integración visible |

Antes de instalar deben cumplirse además: revisión exacta de tipos/constraints e índices de fuentes, ausencia de nombres previos/sobrecargas inesperadas, UTF8/ICU vigentes, versión final revisada fuera de automatismos que arrastren 008 y **autorización expresa de instalación**. Los objetivos orientativos de 25% de latencia/40% de recursos/10% de escritura se evalúan con resultados medidos y excepciones justificadas, sin instalar índices preventivamente.

**Controles aprobados:** contrato y decisiones de búsqueda/orden/páginas, independencia de nombres respecto a 008, invoker/proyección explícita, ausencia de escrituras y RPC mutantes en el borrador, y pruebas sintéticas anteriores. **Controles aún pendientes:** evidencias del destino/laboratorio y requisitos de la tabla. Aprobación de diseño y tests locales no autoriza instalación, exposición remota, integración del catálogo visible, dinero ni publicación GitHub.
