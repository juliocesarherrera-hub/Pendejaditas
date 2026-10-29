# Catálogo 009: corrección local de EXECUTE

> Estado al 29 de octubre de 2026: consultar la [guía vigente y trazabilidad](CATALOGO-ESTADO-Y-DOCUMENTACION.md). El código del catálogo está publicado como preparación; la 009 no está instalada y el catálogo paginado no está integrado. La edición por ID sí está implementada y publicada. Los resultados y estados Git de cada bloque son evidencia histórica, no pruebas nuevas de esta revisión documental. Este documento sigue pendiente de autorización para commit.

**Actualización del 29 de octubre de 2026:** se añadieron límites a los cinco helpers y pruebas de llamadas directas, sin cambiar firmas, ACL o RLS. Los límites están en [CATALOGO-009-LIMITES-HELPERS.md](CATALOGO-009-LIMITES-HELPERS.md); el hash publicado y la evidencia de la selección exacta están en la guía vigente enlazada arriba. El hash y las cifras siguientes conservan la evidencia de la corrección de permisos anterior. La 009 sigue sin instalarse.

28 de octubre de 2026. **Borrador corregido y probado localmente; NO instalar.** Actualiza el hallazgo de la [revisión anterior](CATALOGO-009-REVISION-FINAL.md), conservando sus condiciones de PostgreSQL 17.11, RLS real, rendimiento, compatibilidad y recuperación.

## Permisos previstos por función

| Función nueva | anon | authenticated | PUBLIC | Otros roles ordinarios |
| --- | --- | --- | --- | --- |
| `public.catalog_page_v1(jsonb)` | EXECUTE | EXECUTE | Sin EXECUTE | Sin concesión |
| `catalog_private.search_key_v1(text)` | EXECUTE | EXECUTE | Sin EXECUTE | Sin concesión |
| `catalog_private.trim_v1(text)` | EXECUTE | EXECUTE | Sin EXECUTE | Sin concesión |
| `catalog_private.pattern_v1(text)` | EXECUTE | EXECUTE | Sin EXECUTE | Sin concesión |
| `catalog_private.cursor_time_v1(text)` | EXECUTE | EXECUTE | Sin EXECUTE | Sin concesión |
| `catalog_private.fingerprint_v1(text,text,text,integer,integer,text,integer)` | EXECUTE | EXECUTE | Sin EXECUTE | Sin concesión |

Todas conservan SECURITY INVOKER y search_path vacío. Los clientes no reciben WITH GRANT OPTION, CREATE, SELECT nuevo sobre tablas, permisos administrativos ni BYPASSRLS. Los cinco helpers necesitan EXECUTE del llamador porque la RPC invoker los ejecuta con sus mismos privilegios; hacerla definer para ocultarlos ampliaría el riesgo innecesariamente. Sus argumentos no aceptan una identidad autorizante suministrada por el cliente. El esquema auxiliar no debe exponerse mediante Data API.

El propietario conserva sus privilegios y capacidad de administrar los objetos. Superusuarios y roles que hereden privilegios del propietario no pueden tratarse como usuarios ordinarios bloqueados por un REVOKE. No se añaden concesiones expresas a esos administradores ni a service_role. Tener BYPASSRLS por sí solo no concede EXECUTE: el fixture service_role sin ese permiso fue rechazado. PUBLIC es el conjunto universal de roles, no una cuenta con la que se pueda iniciar sesión.

## Qué cambia en el borrador

1. Después de crear las seis funciones nuevas, una lista cerrada de sus firmas obtiene las ACL efectivas iniciales mediante aclexplode/acldefault. Se revocan todas las concesiones a destinatarios distintos de su propietario, incluido PUBLIC y cualquier rol añadido por default privileges.
2. Se usan identificadores escapados y firmas constantes, sin texto SQL del usuario. CASCADE elimina únicamente concesiones dependientes sobre cada función nueva; no elimina funciones, datos ni permisos de otros objetos. Se probó una cadena de delegaciones entre tres roles sintéticos.
3. Se concede EXECUTE sin delegación exclusivamente a anon/authenticated. El permiso USAGE del esquema auxiliar conserva el diseño previo; no se cambian ACL de public, esquemas anteriores ni defaults globales.
4. Una comprobación final rechaza ACL adicionales/grant options, roles frontend administrativos, membresía frontend en el propietario y EXECUTE efectivo heredado por roles ordinarios inesperados. No modifica roles o membresías para hacerlo pasar.
5. Una ACL inesperada en el esquema nuevo causa error y rollback. **No se limpia automáticamente el esquema** ni se altera la política global de creación de esquemas; un caso así necesita revisión y autorización separadas.

La creación y limpieza de ACL permanecen en BEGIN/COMMIT. No hay un commit intermedio que publique el EXECUTE inicial. Un error de permisos o herencia aborta el conjunto. Se mantienen el guard de borrador y la prohibición de forzarlo en Supabase. SHA-256 histórico del archivo antes de endurecer los auxiliares: `2e8f8a5953f88cc6301faf51ce07cdc54a8fec61dcd264db425ceca7c8f1dcd4`.

No se usa ALL FUNCTIONS IN SCHEMA, ALTER DEFAULT PRIVILEGES, GRANT de membresías ni cambio de propietarios en el borrador. Los nuevos tests sí crean roles/defaults/membresías artificiales dentro de clusters PGlite nuevos para comprobar estos casos. Eso no configura usuarios ni servicios de Windows o Supabase.

## Herencia y SET ROLE: alcance exacto

PostgreSQL suma privilegios; no tiene un DENY por función que anule el EXECUTE recibido de otro rol. Por eso revocar una concesión directa no basta si el usuario hereda authenticated. El borrador detecta esa situación y se detiene antes del COMMIT, dejando las membresías intactas. [Reglas oficiales de herencia](https://www.postgresql.org/docs/17/role-membership.html), [semántica de REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html).

Se distingue herencia automática de capacidad SET ROLE. Un proxy NOINHERIT puede no tener EXECUTE efectivo y sí estar autorizado a cambiar a authenticated; la infraestructura de autenticación puede necesitarlo. No se le concede EXECUTE propio ni se lo declara seguro por su nombre. El diagnóstico informa ambas capacidades para revisar por separado quién puede asumir anon/authenticated o el propietario, sus cadenas y el gateway/JWT. No se modifican esas relaciones automáticamente.

Un administrador podría añadir una membresía o un GRANT después de instalar. Ningún script de instalación impide permanentemente ese cambio: requiere control administrativo, auditoría y revisiones posteriores. La prueba añadió una membresía después del ensayo; el diagnóstico detectó el nuevo EXECUTE heredado y RLS continuó filtrando filas. No se presenta ese escenario como un rechazo permanente de ejecución.

Los defaults originales permanecen intactos, incluidos defaults amplios de fixtures. Así se conserva el alcance autorizado: se corrigen solo los objetos nuevos. No se concluye que otras funciones presentes o futuras queden protegidas por esta limpieza.

## Diagnóstico SELECT ampliado

`supabase/diagnostics/audit-catalog.sql` sigue siendo **una única sentencia SELECT**. No llama la RPC ni consulta filas de negocio, auth.users, contraseñas o archivos de Storage. Se ejecutó en transacciones READ ONLY de PGlite, antes/después y con anomalías sintéticas.

Ahora contiene:

- Las seis firmas esperadas y funciones/sobrecargas inesperadas dentro del namespace reservado o con el nombre de la RPC pública; propietario, argumentos/defaults, resultado, flags, configuración y hash del cuerpo.
- ACL de funciones con grantor, grantee, PUBLIC, privilegio y grant option.
- EXECUTE efectivo para **todos los roles de pg_roles**, junto a concesión directa, grant option, USAGE del schema, herencia del propietario y acceso inesperado.
- Atributos de roles relevantes: SUPERUSER, BYPASSRLS, LOGIN, INHERIT, CREATEROLE, CREATEDB y REPLICATION, sin hashes ni contraseñas.
- Capacidad de heredar y de hacer SET ROLE a anon/authenticated; capacidad de asumir el propietario por cada función.
- Membresías y opciones INHERIT/SET/ADMIN, incluidas cadenas que pueden reconstruirse desde esos metadatos.
- ACL y permisos efectivos USAGE/CREATE de public y catalog_private. Inspeccionar public no modifica sus permisos.
- Default privileges relevantes para funciones y esquemas, con propietario, ámbito y destinatarios. No se supone que procedan del propietario de una ejecución distinta.
- Metadatos anteriores de fuentes, RLS, índices, ICU y estado de objetos, sin inferir activación financiera.

El indicador unexpected_effective_execute excluye owner/herencia de owner y superusuarios para distinguir administración de roles ordinarios; **no es una certificación automática**. Esos administradores siguen visibles. La capacidad SET ROLE y las ACL de schema deben revisarse también aunque ese indicador sea false. EXECUTE + USAGE tampoco garantiza SELECT ni RLS correcta sobre las fuentes.

El informe completo de roles/ACL es metadato de seguridad: guardarlo de forma privada cuando se autorice su ejecución remota. No divulgarlo como contenido público de la aplicación. Las consultas de permisos tienen soporte documentado en [PostgreSQL 17](https://www.postgresql.org/docs/17/functions-info.html); falta ejecutarlas en el destino autorizado.

## Pruebas de la corrección inicial de permisos, no repetidas en esta revisión documental

| Ejecución | Resultado |
| --- | --- |
| `node scripts/catalog-permission-checks.mjs` | 13 grupos correctos; incluye 36 ejecuciones no autorizadas rechazadas en las seis funciones |
| ACL/defaults | Defaults personalizados, nombre de rol con comillas, grant options de anon/grupo y destinatario service_role limpiados solo en objetos nuevos |
| Herencia | Rol que hereda un grupo con default EXECUTE queda sin acceso nuevo; herencia preexistente de authenticated provoca rollback, no cambios de membresía |
| Delegación | Cadena de GRANT con grant option sobre la función nueva eliminada por CASCADE; función antigua, grants, owners y defaults iguales |
| Roles permitidos | Las seis funciones funcionan para anon y authenticated; los intentos de delegar EXECUTE no conceden el permiso |
| RLS | anon/A/C/D sintéticos no leen la publicación protegida de B; B puede verla. No se añaden permisos de escritura |
| PUBLIC y cambios posteriores | El diagnóstico detecta una concesión a PUBLIC, herencia añadida después y funciones inesperadas; alteraciones realizadas solo en fixtures |
| Atomicidad | Herencia incompatible o ACL inesperada del esquema nuevo revierte todos los objetos nuevos; fuentes, public, roles/defaults y función anterior conservados |
| Prueba cruzada histórica no publicada | Cuatro grupos correctos; requiere el borrador 008 privado y está fuera del commit 5. No es dependencia de las pruebas públicas de permisos |
| `catalog-draft-checks.mjs` | 13 grupos correctos; 252 lecturas RPC, 218 páginas y regresiones de contrato/Unicode/RLS/rollback |
| Adaptador / contrato / controlador | 12 / 28 / 34 grupos correctos respectivamente, sin integrar el catálogo visible |
| `npm test` | Suite general correcta; sin llamadas remotas ni instalación de migraciones |
| `npm run lint` | Sin errores ni avisos nuevos; persiste el aviso previo de `scripts/backup/artifact-controls.mjs:7:98`, sin modificar ese archivo |
| `npm run build` | Compilación local correcta, sin despliegue |

Las pruebas SQL usan PGlite 18.6 desechable, roles e identidades sintéticas. No prueban las cuentas/JWT reales, PostgreSQL 17.11, el esquema completo de 008, PostgREST ni la recuperabilidad de los respaldos. El catálogo visible y las migraciones anteriores permanecen sin cambios.

El test de permisos se ejecuta explícitamente con el comando indicado; no se añadió a npm test ni se modificó scripts/verify.mjs o package.json, que contienen trabajo pendiente ajeno. La suite general y los ensayos del catálogo son comprobaciones distintas. La cifra histórica de 104 grupos incluía cuatro de la prueba cruzada pendiente. Para el conjunto público exacto y los límites de auxiliares actualizados, usar la evidencia del commit 5 en la guía vigente; no sumar ejecuciones de versiones distintas como si fueran una sola tanda.

## Archivos y riesgos pendientes

Cambios autorizados: borrador 009, diagnóstico, tests de borrador/revisión final y este test de permisos nuevo; documentación de permisos y notas de actualización en bloque 5, revisión final e instalación. No se cambia código React, package.json, lockfile, migraciones 001–008 o scripts de respaldo.

Verificación de preservación: de 238 archivos registrados antes de trabajar, solo cambiaron estos siete autorizados: `supabase/drafts/202610280009_catalog.sql`, `supabase/diagnostics/audit-catalog.sql`, `scripts/catalog-draft-checks.mjs`, `scripts/catalog-final-review-checks.mjs`, `docs/CATALOGO-009-REVISION-FINAL.md`, `docs/CATALOGO-BLOQUE-5-BORRADOR.md` y `docs/INSTALAR-CATALOGO-RECUPERACION.md`. Los otros 231 coinciden por SHA-256 y no falta ninguno. Se añadieron únicamente `scripts/catalog-permission-checks.mjs` y este documento. Al terminar aquel bloque: índice vacío y HEAD `70dcf6b199ecb9df2954f90d1994f8f1161678b3` sin cambios. Dist y el artefacto temporal de pruebas se regeneran en ubicaciones ignoradas; no son respaldos ni archivos para publicar.

El hallazgo de EXECUTE adicional por defaults queda corregido y comprobado **localmente**. Antes de instalar siguen pendientes:

1. Diagnóstico autorizado del destino para inventariar todos los roles/ACL/defaults y quién puede usar SET ROLE, incluidos administradores; resolver cualquier diferencia sin alterar permisos antiguos de forma automática.
2. Repetir las pruebas en PostgreSQL 17.11 y por Auth/PostgREST reales, con propietarios/roles equivalentes y comprobación del schema auxiliar no expuesto.
3. Confirmar Unicode/ICU, tipos/RLS de fuentes, rendimiento y timeout, compatibilidad completa con 008 deshabilitada/ausente y restauración aislada.
4. Mantener la auditoría de exposición heredada como condición previa al lanzamiento. El nuevo catálogo no restringe SELECT ni respuestas de RPC anteriores.
5. Revisar versión final, numeración, procedimiento de instalación/contención y autorización expresa. No instalar este borrador ni omitir su guard.

No se concede autorización para instalaciones, integración remota, efectivo, pagos, commit o push. El siguiente trabajo requiere una decisión nueva del propietario.
