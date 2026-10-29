# Catálogo: bloque 1 de pruebas locales del contrato

> Estado al 29 de octubre de 2026: consultar la [guía vigente y trazabilidad](CATALOGO-ESTADO-Y-DOCUMENTACION.md). El código del catálogo está publicado como preparación; la 009 no está instalada y el catálogo paginado no está integrado. La edición por ID sí está implementada y publicada. Los resultados y estados Git de cada bloque son evidencia histórica, no pruebas nuevas de esta revisión documental. Este documento sigue pendiente de autorización para commit.

28 de octubre de 2026. Alcance autorizado: referencia local y datos sintéticos. **No hay RPC instalada ni cambio en el catálogo visible.** El [diseño aprobado](DISENO-RPC-CATALOGO-PAGINADO.md) se conserva como base. Este informe documenta la implementación local del bloque P1; no autoriza P2 ni modifica las decisiones aprobadas.

## Archivos y ejecución

- `scripts/support/catalog-contract-reference.mjs`: referencia de normalización, validación de solicitudes/cursores y filtrado/paginación sobre filas sintéticas inyectadas. Solo usa APIs incorporadas de Node.js. No se importa desde React ni realiza conexiones, SQL, Storage o llamadas al motor de subastas.
- `scripts/catalog-contract-checks.mjs`: pruebas independientes ejecutables con `node scripts/catalog-contract-checks.mjs` desde la raíz del proyecto. No requiere variables de entorno, credenciales ni dependencias nuevas.
- Este documento: alcance, resultados y límites de la verificación.

No se modifica `package.json`, la suite existente, las migraciones ni archivos compartidos de Fase 8 para incorporar estas pruebas. La referencia no es el servicio que consume la aplicación y no se debe conectar al catálogo como sustituto de PostgreSQL.

## Casos cubiertos

| Área | Datos/casos | Resultado local esperado y comprobado |
| --- | --- | --- |
| Mayúsculas y acentos | Pokémon/POKÉMON/Poke + acento combinado; vocales con acento y diéresis; PINGÜINO | Claves equivalentes sin modificar títulos originales |
| Ñ | Niño/NIÑO/Nin + tilde combinada; ñ seguida de otro acento; comparación con Nino | Se conserva ñ; no se equipara con n |
| Unicode | NFC frente a NFD; japonés, emoji con ZWJ/selector de variación, carácter de uso privado | Se conserva lo que no elimina la regla versionada; no se promete transliteración ni equivalencia ß/ss o ancho completo/ASCII |
| Longitud | Vacío y espacios Unicode; un carácter; dos caracteres; solo marcas; 90/91 puntos de código; UTF-16 roto y NUL | Vacío permite explorar; uno pide otro; dos permiten buscar; entradas inválidas se rechazan antes de leer filas; sin truncar |
| Dos caracteres | PS, PC, VR, DS, BB y 東京 | Fragmentos literales sin lista cerrada ni expansión automática de siglas: PS no significa PlayStation |
| Especiales | %, _, !, barra inversa, comillas y texto con apariencia de SQL | Coincidencia literal. Intérprete independiente del patrón LIKE con escape `!` coincide con búsqueda literal; no ejecuta SQL |
| Parámetros | Filtros desconocidos, null donde no corresponde, límites inválidos, NaN/Infinity/BigInt, precios como texto, rangos invertidos, campos administrativos | Errores neutros, sin lectura de filas ni eco de entradas |
| Paginación | 0, 1, 12, 13, 100 y 1.001 publicaciones; recientes y precio ascendente/descendente; tamaños 1–12 | Máximo 12; desempate por ID; conjunto estático completo sin duplicados/omisiones; cursor desde la última tarjeta devuelta |
| Precisión temporal | Empates de fecha; microsegundos que JavaScript Date redondearía; fechas inexistentes y formato no canónico | Conserva texto UTC con seis decimales y orden correcto; rechaza fechas inválidas |
| Filtros globales de referencia | Títulos fuera de las primeras 12 posiciones; categoría, modalidad, precio y búsqueda combinados | Todos los filtros se aplican antes del límite en el conjunto sintético |
| Precio efectivo | Fijo, negociable, subasta sin pujas y subasta con importe más alto; resumen ausente/incoherente | Orden por precio efectivo; anomalías excluidas antes del límite, sin convertirlas en precio fijo |
| Cursores | Versión, forma, fingerprint, tamaño, fecha/precio/UUID; cambio de orden, filtros, tamaño o sesión | Rechazo neutro de cursores incompatibles antes de leer filas |
| Cursor sin firma | Posición válida modificada; ID inexistente o publicación del cursor retirada del fixture | No se usa como autorización ni se consulta si el ID existe; continúa sobre las filas suministradas |
| Privacidad sintética | Ámbitos A/B/C/D inyectados; campos privados ficticios; fallo de dependencia | No acepta identidad/rol desde la solicitud; el DTO omite campos privados; errores no se convierten en lista vacía |
| Datos cambiantes | Un precio visto sube y uno aún no visto baja entre páginas | Demuestra repetición/omisión posible sin snapshot. No se presenta como garantía de coherencia entre páginas |
| Lectura pura | Fixtures congelados y comparación antes/después | No altera publicaciones, precios originales, timestamps ni metadatos |

La prueba de privacidad usa un proveedor sintético que entrega solo las filas que modela como visibles. **No constituye una prueba real de RLS ni de las cuentas remotas A/B/C/D.** Tampoco prueba autenticación, Realtime o autorizaciones del servidor.

## Detalles reproducibles para la futura comparación SQL

Normalización `es-nfc-preserve-enye-v1`: NFC → minúsculas Unicode → separar por ñ → NFD de los demás segmentos → eliminar marcas U+0300–U+036F → NFC → unir conservando ñ. El trim usa un conjunto explícito de espacios. No es una promesa de eliminar todas las marcas Unicode ni de aplicar case folding completo. Longitud: puntos de código, no unidades UTF-16 ni grafemas; máximo de entrada 90 puntos y 512 bytes UTF-8 antes de normalizar.

Patrón literal: duplicar `!`, escapar `%` como `!%` y `_` como `!_`, después rodear de `%`. La futura consulta parametrizada deberá declarar `ESCAPE '!'`; las comillas del usuario nunca deben concatenarse al SQL.

La solicitud queda limitada a 4 KiB y el cursor a 1.536 bytes. Son validaciones de la referencia sobre JSON ya recibido, no límites de transporte ni protección contra abuso de un endpoint real.

El fingerprint local usa SHA-256 de este array ordenado serializado en UTF-8, sin espacios adicionales:

```text
["catalog-v1","es-nfc-preserve-enye-v1","public-catalog-v1",null,null,"all","pokemon",null,null,"recent",12]
```

Resultado de referencia:

```text
03debdd479397762c298eaf10263b599f59d4bd7dd71d39cf5bae61f76df7a7a
```

Orden de campos: versión, normalización, política, ámbito del llamador, categoría, modalidad, búsqueda normalizada, mínimo, máximo, orden, tamaño de página. `null` en ámbito significa anónimo; los UUID utilizados en pruebas son sintéticos. La identidad debe proceder del servidor, nunca del cursor. Este hash no es firma ni secreto: modificar una posición pública válida puede aceptarse, siempre sujeto a la consulta y sus permisos. No se afirma que se detecte toda manipulación.

El laboratorio deberá reproducir la serialización y los resultados Unicode con PostgreSQL 17/ICU; no se presupone que `jsonb::text`, colaciones y `lower()` produzcan los mismos bytes que JavaScript. Una diferencia deberá resolverse mediante revisión del contrato, sin modificar títulos históricos.

## Verificaciones y límites

- Pruebas del bloque: **28 grupos locales**, incluidos conjuntos estáticos de hasta 1.001 filas. Sin medición de rendimiento PostgreSQL.
- `node scripts/catalog-contract-checks.mjs`: **28 grupos correctos**.
- `node scripts/catalog-preparation-checks.mjs`: **22 grupos existentes correctos**, incluidos edición independiente y controlador preparado con clientes sintéticos.
- `npm test`: **correcto**. El primer intento se detuvo por `spawn EPERM` al cargar Vite dentro del aislamiento; se repitió con autorización adicional y terminó correctamente. El análisis de SQL de esta suite solo parsea archivos locales; no ejecuta instrucciones ni instala migraciones.
- `npm run lint`: **sin errores ni avisos nuevos**. Permanece el aviso previo `eslint(no-control-regex)` en `scripts/backup/artifact-controls.mjs:7:98`; ese archivo no se modifica. El trim de la referencia usa puntos de código explícitos sin desactivar reglas de lint.
- `npm run build`: **correcto**, con los permisos adicionales necesarios para los subprocesos de Vite; no es un despliegue. Solo generó los artefactos locales habituales de compilación.
- El primer pase detectó un valor esperado incorrecto en un fixture de precio inicial (111 en vez de 101); se corrigió la expectativa y se repitieron las pruebas.
- Respuestas de esta referencia se identifican como `reference_only=true` y `consistency=synthetic_rows_only`; no anuncian snapshots SQL, pagos ni efectivo operativos.
- Falta validar PostgreSQL, RLS real, colaciones, planes de consulta, límites de tiempo, carga de 10.000 publicaciones, índices y compatibilidad remota. No se han ejecutado SQL ni migraciones, modificado Supabase, instalado dependencias o alterado respaldos.
- La pausa de «Cargar más», cancelación de peticiones y política Realtime pertenecen al bloque 2 y posteriores. Este bloque no cambia el controlador ni la interfaz.
- Preservación: comparación SHA-256 de los 220 archivos registrados al inicio, incluidos los archivos privados locales comprobados, sin diferencias ni archivos faltantes. Los 73 cambios anteriores, los otros preparativos del catálogo, la 008 y el diseño aprobado se conservan; solo se añaden los tres archivos listados arriba. No se copian valores de credenciales al informe ni a las pruebas.

**Límite vigente:** los bloques 2–5 se prepararon y publicaron después con autorizaciones separadas. Este contrato no autoriza instalar 009 ni conectar el catálogo visible; consultar la guía vigente.
