# Catálogo 009: procedimiento futuro y recuperación

> Estado al 29 de octubre de 2026: consultar la [guía vigente y trazabilidad](CATALOGO-ESTADO-Y-DOCUMENTACION.md). El código del catálogo está publicado como preparación; la 009 no está instalada y el catálogo paginado no está integrado. La edición por ID sí está implementada y publicada. Los resultados y estados Git de cada bloque son evidencia histórica, no pruebas nuevas de esta revisión documental. Este documento sigue pendiente de autorización para commit.

**Estado actual: NO instalar.** El archivo en `supabase/drafts` es un borrador bloqueado y no una migración aprobada para Supabase. Este procedimiento prepara una intervención futura; no autoriza ejecutarla. [Alcance y resultados](CATALOGO-BLOQUE-5-BORRADOR.md).

**Revisión posterior de EXECUTE:** usar la [matriz y diagnóstico ampliados](CATALOGO-009-PERMISOS.md). Antes de una intervención futura, revisar todos los roles efectivos, ACL/defaults, herencia, SET ROLE y permisos de schemas, no solo anon/authenticated/PUBLIC. El borrador limpia únicamente concesiones de las funciones nuevas y aborta ante herencia o ACL de esquema inesperadas; no cambiar membresías ni permisos globales para hacerlo pasar. Una diferencia requiere detenerse y solicitar su autorización específica.

## A. Requisitos antes de autorizar la intervención

1. Motor y semántica: pruebas en PostgreSQL 17.11, UTF8 y colación verificada; corpus y fingerprint SQL reproducibles; conservar ñ/n, acentos, Unicode combinado y dos caracteres.
2. Seguridad: RLS y grants reales bajo anon/A/B/C/D; DTO público, filas ocultas y roles sin bypass; API/timeout/conexión probados; ausencia de cierre de subastas por leer.
3. Rendimiento: datos representativos, índices existentes, concurrencia, máximos y estabilidad, coste de mantenimiento y frecuencia. Aplicar los objetivos aprobados como orientativos; documentar excepciones con mediciones. Ningún índice extra por defecto.
4. Compatibilidad: 001–007 y copia con 008 deshabilitada; firmas, triggers, historial, QR y reclamaciones conservados. El catálogo no exige activar efectivo o instalar 008.
5. Recuperación: respaldo existente conservado y restauración aislada verificada según el plan de respaldos. Los tests del catálogo no certifican recuperabilidad del respaldo. No sobrescribir producción para comprobarlo.
6. Operación: ventana responsable, selección de un solo archivo, revisión final del diff/hash y autorización expresa del propietario. La auditoría de exposición heredada sigue siendo gate adicional de lanzamiento.

No se consideran satisfechos estos requisitos por compilar en PGlite 18.6. El laboratorio nativo/Supabase compatible sigue sujeto a autorización y a la decisión previa de esperar al SSD. No se instala Docker/WSL2 aquí.

## B. Selección de versión y archivo, todavía sin ejecutar

1. Abrir `docs/CATALOGO-BLOQUE-5-BORRADOR.md`, `supabase/drafts/202610280009_catalog.sql` y `supabase/diagnostics/audit-catalog.sql`.
2. Autorizar primero el diagnóstico de metadatos SELECT del destino. Guardar su resultado de forma privada para revisar versión, tablas, políticas, funciones y nombres/índices. Que no existan funciones 009 antes de instalar es el resultado normal.
3. Comprobar historial y numeración reales: 009 solo está libre **localmente**. No sobrescribir ningún objeto existente ni asumir que todo coincide con archivos del repositorio.
4. Acordar cómo registrar exclusivamente esta instalación. SQL Editor no actualiza automáticamente el historial del CLI. No usar db push/migration up sobre todo el directorio: incluyen potencialmente la 008 pendiente. No reparar historial ficticiamente, renumerar 008 o fingir que efectivo fue instalado. Si la herramienta elegida no permite la selección acordada, detener y revisar el procedimiento con el propietario.
5. Solo tras completar A y recibir autorización, preparar la revisión final instalable y su ubicación/historial, con nuevo hash revisado. El guard `pjd.catalog_draft_validation` actual es de laboratorio: **no configurarlo en producción para saltarse el bloqueo**. Su adaptación para la versión final tendrá que revisarse y autorizarse expresamente, sin ejecutar otros cambios.
6. La versión a copiar será únicamente el contenido completo del archivo final revisado, incluidos BEGIN/preflight/COMMIT. No seleccionar fragmentos, migrations anteriores ni sentencias de pruebas. El borrador actual aún no es ese archivo final.

No hay un botón de «habilitar todo» o un cambio RLS adicional que forme parte del plan: no se crean tablas. Si Dashboard solicita aplicar cambios automáticos al script o a políticas, detener y revisar el contenido concreto antes de aceptarlos.

## C. Ejecución futura controlada, después de otra autorización

1. Confirmar proyecto/entorno, archivo y hash sin exponer credenciales. No ejecutar desde una configuración de laboratorio que apunte a producción accidentalmente.
2. Ejecutar únicamente el archivo final autorizado por el método de B. Debe finalizar sin error; una interfaz puede mostrar «Success. No rows returned». Ese texto solo indica que no informó un error, no que toda la funcionalidad haya sido validada.
3. Ejecutar el diagnóstico SELECT autorizado en sesión utilizable. Esperar las seis funciones y catalog_private, invoker, volatilidades/configuración previstas, ausencia de EXECUTE para PUBLIC y permisos nuevos mínimos. Comparar hashes de cuerpos con el contenido exacto revisado. Diferencias de formato/fin de línea también requieren revisión, no una repetición automática.
4. Verificar que fuentes, RLS/grants/índices antiguos e historial coinciden con el inventario previo y que no se instalaron nuevos índices/extensiones/tablas. No inferir que efectivo se activó por existir orders; no ejecutar cash_command para probar el catálogo.
5. Pruebas remotas acotadas de lectura bajo sesiones autorizadas, con la RPC todavía sin activar en el catálogo visible. Sin crear publicaciones masivas ni llamar auction_snapshot como parte de la lectura. Errores de permiso/timeout no son listas vacías exitosas.
6. Mantener la aplicación anterior hasta aprobar por separado la integración UX, coordinador Realtime, estados de error y comportamiento responsive. No publicar en GitHub como consecuencia automática de instalar SQL.

## D. Recuperación sin borrar datos

| Situación | Acción segura futura |
| --- | --- |
| Guard/preflight falla | Detener. No sustituirlo por IF NOT EXISTS ni quitar la condición para probar. Diagnóstico y revisión antes de nuevo intento |
| Error antes del COMMIT | La transacción queda abortada y sus objetos nuevos se revierten al terminar con ROLLBACK/cerrar correctamente. Si la sesión sigue abortada, concluirla con ROLLBACK antes de diagnosticar. No asumir éxito parcial ni borrar objetos a ciegas |
| Red/interfaz no confirma si terminó | No repetir el archivo. Consultar metadatos en una sesión válida y comparar objetos/hashes; distinguir no aplicado, aplicado y situación inesperada |
| COMMIT correcto, pero RPC defectuosa | Conservar el catálogo anterior y dejar objetos nuevos sin uso mientras se revisa. No DROP, no restauración de producción, no edición de datos históricos |
| Riesgo por disponibilidad de la RPC nueva | Solicitar autorización de contención específica sobre el objeto nuevo y registrar la actuación. No revocar grants de products/auctions/perfiles o RPC antiguas como atajo |
| Corrección posterior a una instalación registrada | Nueva migración/versión revisada con número disponible y nueva autorización. No editar una migración aplicada, repetir 001–008 ni reemplazar helpers indexados sin plan |
| Se detecta modificación no prevista de datos/permisos | Detener integración, conservar evidencia y comparar inventarios. Escalar a recuperación planificada y autorizada; no automatizar restauración de respaldos sobre producción |

El borrador solo crea un namespace y funciones; no tiene DML comercial, índices ni cambios de tablas/políticas actuales. Por eso la recuperación normal no necesita eliminar publicaciones ni revertir historia. Esa propiedad fue probada mediante un fallo artificial intermedio en memoria; falta repetir compatibilidad y operación en el entorno real permitido.

## E. Qué no acredita el diagnóstico

Presencia, firma, hashes y grants no demuestran igualdad Unicode de todo el universo, rendimiento aceptable, RLS por JWT real, protección frente a abuso, correcto pooler o restauración de respaldos. El propio diagnóstico marca esas comprobaciones como pendientes. No convertir sus metadatos en una bandera de instalación/activación automática.

El archivo diagnóstico es un SELECT, no una migración ni una prueba de pago. No solicita service_role, claves secretas, contraseñas ni contenido de buckets. Conservar los resultados de operación conforme al procedimiento privado del proyecto; no publicarlos indiscriminadamente.
