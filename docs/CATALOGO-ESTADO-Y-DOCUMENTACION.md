# Catálogo: estado vigente y guía documental

Revisión documental del 29 de octubre de 2026. **Código publicado no significa SQL instalado ni catálogo nuevo operativo.** Esta guía y los doce informes relacionados están preparados para revisión; todavía no se ha autorizado su commit documental.

## Estado comprobado y límites

| Componente | Estado vigente | Evidencia y pendiente |
| --- | --- | --- |
| Edición independiente por ID | Implementada y publicada; usa la sesión, RLS y restricciones existentes | Diez intentos remotos técnicos con SDK dieron los resultados esperados. No equivalen a pruebas interactivas completas en navegador |
| Servicio paginado y controlador | Implementados y publicados como preparación, sin integrar al catálogo visible | Pruebas sintéticas de cursores, sesiones, respuestas tardías, precios en su sitio y bloqueo de Cargar más |
| Contrato de búsqueda | Referencia y pruebas publicadas | Acentos/mayúsculas ignorados, ñ distinta de n, Unicode combinado, dos caracteres y signos literales. La búsqueda del catálogo visible aún conserva su comportamiento anterior |
| Herramientas SQL locales | Publicadas; PGlite 18.6 efímero | No sustituyen PostgreSQL 17.11, Auth/JWT, PostgREST ni un laboratorio completo compatible con Supabase |
| Borrador 009, diagnóstico y adaptador | Publicados; **no instalados ni integrados** | Seis funciones invoker; diagnóstico SELECT; validaciones de cinco auxiliares y ACL ensayadas localmente |
| Instalación, integración visible y producción | Pendientes de validaciones y autorización separadas | PostgreSQL 17.11/ICU, RLS y errores reales, carga, permisos heredados existentes, compatibilidad completa y recuperación aislada |
| Efectivo y pagos digitales | Deshabilitados; 008 sin instalar | El QR registra entrega, no verifica dinero. Publicar 009 no instala 008 ni habilita modalidades financieras |

Este estado se basa en el código publicado y la evidencia previa; **en esta revisión solo se leyeron archivos y se verificó documentación**. No se ejecutó SQL, pruebas funcionales nuevas ni consultas a Supabase. Un diagnóstico futuro necesita autorización propia. La existencia de tablas o funciones no autoriza activar una funcionalidad.

«Implementado» en edición se refiere al flujo existente y a la tanda técnica registrada. No acredita por sí solo el despliegue actual de una web pública ni una nueva comprobación de producción. «Preparado localmente» describe herramientas ensayadas con datos inyectados o PGlite; «publicado» identifica el contenido de GitHub y no su instalación en Supabase.

## Trazabilidad del código publicado

Los commits siguientes identifican revisiones de código, no personas, operaciones ni autorizaciones de instalación:

| Commit | Contenido |
| --- | --- |
| `8d36a072c6ad5ba7310aab5de0ae04fa314ce8c7` | Edición independiente por ID y pruebas |
| `d5ef1ae54cc9057263b7bf7b0f637ad02f3b87a4` | Servicio paginado y controlador |
| `0caf84a60eb26c6462375c846eda23e35e349583` | Referencia de búsqueda y contrato |
| `867f6f17f24e03580ac1281cf91bc5750ae23b18` | Herramientas PGlite y corpus SQL local |
| `9c4f87e2b4dd3c9c064e0034ef6d99e09a0e32da` | Borrador 009, diagnóstico, adaptador y pruebas de auxiliares/permisos |

El [borrador publicado](../supabase/drafts/202610280009_catalog.sql) permanece fuera de `supabase/migrations`. SHA-256 exacto del archivo publicado, con finales de línea LF: `c65c50318da598af0233da33df16eefefda0b1d163a7737a47100abc7fdb1773`. Una conversión local a CRLF cambia el hash del archivo; debe distinguirse de un cambio de cuerpos SQL. El diagnóstico calcula hashes de cuerpos, no el hash del archivo completo.

Los hashes de versiones anteriores que aparecen en informes históricos no aprueban esta revisión ni una instalación futura. Entre la corrección de auxiliares y el commit 5 solo se retiró una línea vacía al final del borrador; no cambió su lógica. Cualquier versión instalable requerirá otra revisión, hash y autorización.

## Documentos que forman el conjunto propuesto

Los enlaces entre estos trece documentos se revisan como conjunto; su publicación deberá incluirlos juntos o volver a comprobar el cierre de referencias.

| Documento | Alcance |
| --- | --- |
| [Verificación de edición por ID](VERIFICACION-EDICION-POR-ID.md) | Evidencia remota anonimizada, permisos y limitaciones |
| [Preparación de paginación](CATALOGO-PAGINACION-PREPARADA.md) | Edición, servicio inicial y separación del catálogo visible |
| [Diseño de la RPC](DISENO-RPC-CATALOGO-PAGINADO.md) | Contrato, estados de navegación, candidatos de índices y plan |
| [Pruebas del contrato](PRUEBAS-CONTRATO-CATALOGO.md) | Normalización, búsqueda literal, precios y cursores sintéticos |
| [Resultados cambiantes](PRUEBAS-CATALOGO-RESULTADOS-CAMBIANTES.md) | Invalidación, cancelación, sesiones y actualización explícita |
| [Pruebas SQL locales](CATALOGO-BLOQUE-3-LABORATORIO.md) | PGlite, Unicode, métricas sintéticas y límites del ensayo |
| [Revisión de resultados](CATALOGO-BLOQUE-4-REVISION.md) | Riesgos, índices candidatos y criterios orientativos |
| [Preparación del bloque 5](CATALOGO-BLOQUE-5-BORRADOR.md) | Borrador, diagnóstico, adaptador y pruebas locales |
| [Revisión final](CATALOGO-009-REVISION-FINAL.md) | Compatibilidad, hallazgo histórico de EXECUTE y condiciones previas |
| [Permisos de la 009](CATALOGO-009-PERMISOS.md) | ACL, herencia, SET ROLE y diagnóstico de lectura |
| [Límites de auxiliares](CATALOGO-009-LIMITES-HELPERS.md) | Entradas acotadas, errores, ausencia de escrituras y pruebas directas |
| [Instalación y recuperación futuras](INSTALAR-CATALOGO-RECUPERACION.md) | Requisitos y respuesta a fallos, sin autorización para ejecutar |

Los documentos de efectivo, respaldos y expansión geográfica no forman parte de este conjunto. Sus decisiones relevantes se describen aquí sin crear enlaces que obliguen a publicarlos.

## Evidencia previa: selección exacta del commit 5

La selección se extrajo del índice y se verificó con los archivos ya publicados, sin incorporar 008 ni las pruebas cruzadas pendientes:

| Comprobación | Resultado registrado |
| --- | --- |
| Árbol exacto | 170 archivos coincidentes con el índice probado; seis archivos nuevos autorizados |
| Borrador | 16 grupos, 252 lecturas RPC, 218 páginas y 246 llamadas directas a auxiliares en PGlite 18.6 |
| Permisos | 13 grupos; 36 ejecuciones no autorizadas rechazadas |
| Adaptador | 12 grupos con transporte inyectado |
| Contrato / controlador / preparación | 28 / 34 / 22 grupos correctos |
| Prototipo SQL previo | 45 entradas Unicode, 48 pares literales y 143 páginas; no medición nueva de la RPC completa |
| Suite general / lint / build | Correctos en la copia exacta; lint sobre 121 archivos JavaScript, sin avisos; build de 2.080 módulos |
| Privacidad y conservación | Sin hallazgos en la revisión de secretos; trabajo ajeno conservado por hashes; no se copiaron entornos privados a la selección |

Estos resultados se ejecutaron antes del commit 5, no durante esta revisión documental. La suite general no ejecuta automáticamente todos los ensayos específicos del catálogo: requieren sus comandos explícitos. Los avisos de lint en herramientas ajenas que mencionan informes anteriores corresponden a esas copias de trabajo históricas; dichas herramientas no se incluyeron en el commit 5.

`scripts/catalog-final-review-checks.mjs` conserva una dependencia directa del borrador 008 y sigue fuera del código publicado del catálogo. Sus cuatro grupos históricos no forman parte de la selección independiente del commit 5. No es necesario incorporarlo ni publicar 008 para ejecutar los tres ensayos específicos incluidos: `catalog-draft-checks.mjs`, `catalog-rpc-checks.mjs` y `catalog-permission-checks.mjs`.

## Privacidad y uso de informes históricos

- A/B/C/D son alias de roles de prueba. Los casos de edición se identifican por alias funcionales, sin UUID reales, títulos exactos ni rutas de fotografías.
- Las marcas de tiempo reales del guardado se sustituyen por T0, T1 y T2; se conserva su orden y la diferencia legítima de `updated_at`.
- La correspondencia con registros reales, respuestas originales, tiempos exactos y huellas permanece exclusivamente en los informes privados originales. No se copian ni modifican esos informes para publicar documentación.
- Los ejemplos JSON usan valores expresamente sintéticos. El vector SHA-256 del contrato es un resultado público de prueba, no una credencial ni una firma.
- No publicar resultados administrativos del diagnóstico: ACL, roles y membresías reales son metadatos sensibles de seguridad. El archivo de consulta contiene solo el procedimiento de lectura.
- Los apartados históricos describen lo probado en cada bloque. Un «no se ejecutó» o «pendiente» de esa etapa no anula evidencias posteriores identificadas en esta guía.

## Antes de instalar o integrar

Siguen pendientes PostgreSQL 17.11/ICU, RLS/Auth/PostgREST reales, exposición de esquemas, límites de transporte y peticiones, carga y cancelación, compatibilidad completa con 008 ausente/presente deshabilitada y restauración aislada compatible. También debe revisarse por separado la exposición de SELECT y respuestas heredadas antes del lanzamiento. No se instala ningún índice preventivo ni se cambia una regla de búsqueda para evitar una discrepancia.

La revisión futura debe acordar numeración e historial sin arrastrar 008, responsable, recuperación, versión final instalable y autorización expresa. El guard del borrador no debe eludirse en producción. No se autoriza instalar herramientas, modificar Supabase, habilitar pagos, publicar documentación ni realizar la integración visible por terminar esta guía.
