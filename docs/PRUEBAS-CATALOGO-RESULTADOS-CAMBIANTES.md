# Catálogo: bloque 2, resultados cambiantes y solicitudes pendientes

> Estado al 29 de octubre de 2026: consultar la [guía vigente y trazabilidad](CATALOGO-ESTADO-Y-DOCUMENTACION.md). El código del catálogo está publicado como preparación; la 009 no está instalada y el catálogo paginado no está integrado. La edición por ID sí está implementada y publicada. Los resultados y estados Git de cada bloque son evidencia histórica, no pruebas nuevas de esta revisión documental. Este documento sigue pendiente de autorización para commit.

28 de octubre de 2026. Preparación local autorizada sobre el [diseño aprobado](DISENO-RPC-CATALOGO-PAGINADO.md). **El catálogo visible continúa intacto; este controlador aún no se monta desde React.** En aquel bloque no se creó una RPC ni se ejecutó SQL. Hoy existe el borrador 009 publicado, sin instalar; no hubo activación de efectivo/pagos.

## Cambios acotados

| Archivo | Cambio |
| --- | --- |
| `src/lib/catalog-page-loader.js` | Control propio de solicitudes de catálogo, invalidación, actualización confirmada de primera página y precios en su sitio; entradas de eventos/conexión sin suscripciones |
| `scripts/catalog-preparation-checks.mjs` | Ajuste del caso existente de pujas: bloquear la página siguiente y mantener aviso/precio si actualizar devuelve una revisión anterior; comprobar después la actualización válida |
| `scripts/catalog-controller-checks.mjs` | Nueva suite pura de 34 grupos con solicitudes, sesiones, publicaciones y eventos sintéticos |
| Este documento | Contrato de control, resultados y límites |

El cargador compartido `public-collection-loader.js` no cambia. Perfiles y favoritos conservan su comportamiento. Tampoco cambian el servicio `catalog-page.js`, la referencia del bloque 1, las pantallas, hooks, App, migraciones ni package.json. Esta revisión complementa el informe histórico `CATALOGO-PAGINACION-PREPARADA.md`: donde aquel describe solo el aviso sin bloqueo, prevalece el comportamiento preparado aquí. No se reescriben sus resultados anteriores.

## Reglas del controlador preparado

1. `markChanged()` conserva tarjetas y cursor como referencia visual, marca `resultsChanged=true`, cancela la página pendiente e invalida su resultado por identidad. Un transporte que ignore AbortSignal tampoco puede anexarla. El cursor conservado **no puede utilizarse** mientras exista el aviso.
2. `more()` devuelve `blocked/results_changed` sin consultar cuando la lista está desactualizada. Dos llamadas concurrentes válidas comparten la misma promesa y solicitud; no se encolan páginas adicionales. Si la primera página está pendiente, tampoco se puede cargar más.
3. `refresh()` solicita expresamente la primera página, con cursor null. Conserva tarjetas durante la consulta y bloquea la paginación. Solo una respuesta válida de la generación actual sustituye la lista, reinicia el cursor y retira el aviso. Doble actualización comparte petición.
4. Si actualizar falla, conserva lista, cursor y aviso, con error recuperable; no reintenta automáticamente. Si no había una primera lista confirmada, el fallo se muestra como error, sin quedarse cargando ni anunciar una lista vacía exitosa.
5. Un evento durante la actualización invalida también esa respuesta: el usuario puede actualizar de nuevo. Una ráfaga continua puede exigir esperar/reintentar; no se oculta el aviso para permitir anexar datos de orden incierto.
6. `reset(input)` cambia filtros, orden o ámbito de sesión: cancela solicitudes de páginas/precios, incrementa la generación y retira inmediatamente datos y cursor anteriores. Las respuestas A/B/A fuera de orden no pueden publicarse sobre la consulta vigente. `cancel()` impide consultas/publicaciones posteriores hasta otro reset.
7. `refreshAuctions(ids)` usa el servicio existente, solo para subastas cargadas, en lotes de hasta 12. Lotes equivalentes por orden/IDs repetidos comparten consulta; un lote diferente mientras otro está pendiente devuelve `busy` y no se declara actualizado. Un lote vacío no consulta. La planificación de otros lotes pertenece al coordinador futuro; no hay reintentos ilimitados ni intervalos aquí.
8. Precios, estado, revisión y reloj cambian en su posición actual, sin reordenar ni eliminar tarjetas. Un cambio de precio/estado/vencimiento invalida conservadoramente la navegación. Revisiones antiguas no revierten precios; datos contradictorios con la misma revisión producen error neutro, conservan lo conocido y no reanudan la lista. Una primera página de revisión inferior conserva el precio más reciente y el aviso cuando hay diferencias relevantes.
9. Una primera página confirmada cancela lotes pendientes de la lista reemplazada. Un fallo de actualización de precios conserva los valores e indica incertidumbre, sin éxito supuesto.
10. Un rechazo explícito de permisos retira tarjetas y cursor, y cancela otras solicitudes. La preservación visual nunca justifica mantener datos cuyo acceso se acaba de denegar. Esto no detecta por sí solo todas las revocaciones: necesita señales y controles reales del servidor.

Estado adicional: `resultsChanged`, `refreshing`, `liveError` y `connected`, junto con los campos previos de carga, error, items y cursor. `items.length` sigue siendo cantidad cargada, no un total global.

## Entradas de eventos y conexión; sin integración real todavía

| Entrada | Comportamiento local |
| --- | --- |
| `notifyChange({source,event})`: source acepta products o auctions; event acepta INSERT, UPDATE o DELETE | Invalida conservadoramente, también por subastas fuera de pantalla. No consulta el ID del evento, no añade tarjetas ni confía en el payload para precios/permisos |
| `connectionChanged(false)` | Marca posible desactualización, cancela páginas y precios pendientes, bloquea consultas nuevas |
| `connectionChanged(true)` | Mantiene el aviso y exige actualizar explícitamente; no dispara consultas automáticas |
| `markChanged()` | Entrada genérica para la reconciliación/foco o un cambio público relevante del futuro coordinador |

Estas entradas **no crean canales Realtime, listeners de navegador, timers ni consultas automáticas**. Por eso este bloque no duplica suscripciones del catálogo actual. La integración futura deberá reutilizar un coordinador público compartido; no añadir canales por tarjeta ni mantener dos coordinadores activos al sustituir el catálogo.

El invalidado es conservador: puede pedir actualizar aunque un evento termine sin afectar ese filtro concreto. Antes de la integración se podrá precisar la pertinencia usando únicamente campos públicos verificables, sin ignorar cambios desconocidos de páginas no cargadas ni consultar datos privados. RLS, autenticación y el stream real no se simulan como garantías operativas.

El servicio existente solo consulta productos/subastas y la lectura `auctions_health`. No se añadieron llamadas a `auction_snapshot`, cierre, adjudicación, pujas, Cron, QR, citas o reclamaciones. La búsqueda y los órdenes mixtos pendientes de servidor siguen devolviendo `unsupported`; este bloque no los degrada a filtros locales ni conecta la referencia del bloque 1 a producción.

## Pruebas ejecutables y criterios

```text
node scripts/catalog-controller-checks.mjs
node scripts/catalog-contract-checks.mjs
node scripts/catalog-preparation-checks.mjs
npm test
npm run lint
npm run build
```

| Grupo | Verificación sintética |
| --- | --- |
| Cambios conocidos | Bloqueo real de more; página pendiente abortada/descartada; cambio durante primera carga y durante refresh |
| Actualización | Primera página con cursor null; lista conservada hasta éxito; fallo conserva lista/cursor/aviso; doble refresh |
| Concurrencia | Filtros/orden cambiados; respuestas y errores tardíos; A/B/A; cancelación aunque el transporte la ignore |
| Doble clic y reintento | Una solicitud pendiente; cursor anterior tras fallo al agregar; sin reintentos automáticos |
| Deduplicación | Solapamiento de páginas y duplicados dentro de respuesta; cursor estancado/respuesta sobredimensionada rechazados |
| Subastas | Precio actualizado en su sitio; puja cancela página; revisiones antiguas/contradictorias; límites y coalescencia de lotes; fallo sin perder precios |
| Cruces página/precio | Lote viejo descartado tras nueva primera página; respuesta con precio de revisión inferior no reanuda paginación |
| Publicaciones | Inserciones/borrados no mueven tarjetas hasta actualizar; evento externo no consulta ni añade IDs |
| Conexión | Cancelación de páginas/precios al desconectar; reconexión no reanuda ni consulta sola; señales repetidas sin multiplicar consultas |
| Permisos y ciclo de vida | Rechazo explícito retira datos y cancela solicitudes; desmontaje impide publicaciones posteriores |
| Errores | Vacío exitoso separado de fallo; mensajes neutros sin reflejar detalles de error sintéticos; contratos aún no soportados siguen separados |

Resultados finales de este bloque:

| Comprobación | Resultado |
| --- | --- |
| `node scripts/catalog-controller-checks.mjs` | 34 grupos correctos |
| `node scripts/catalog-contract-checks.mjs` | Los 28 grupos del bloque 1 siguen correctos; sus archivos permanecen intactos |
| `node scripts/catalog-preparation-checks.mjs` | 22 grupos correctos, con el caso anterior de pujas adaptado a la política aprobada |
| `npm test` | Suite general correcta; SQL solo analizado sintácticamente, nunca ejecutado |
| `npm run lint` | Sin errores ni avisos nuevos; permanece el aviso previo en `scripts/backup/artifact-controls.mjs:7:98`, sin modificar esa herramienta |
| `npm run build` | Correcto; compilación local, sin publicación |
| Preservación SHA-256 | De 223 archivos registrados al inicio, 221 intactos y solo dos modificaciones autorizadas: controlador y caso anterior de prueba. No hay archivos faltantes. Los dos archivos añadidos son la suite nueva y este informe |
| Git y privacidad | HEAD sin cambios, índice vacío; sin commit/push. Comprobación local sin coincidencias de valores privados de los archivos de entorno en los cuatro archivos de este bloque; no se imprimieron credenciales |

La primera ejecución de la regresión encontró la expectativa antigua de retirar el aviso pese a una revisión de subasta inferior. Se actualizó ese caso para exigir precio/aviso conservados y después confirmar una revisión actual; la repetición pasó. No se debilitó la protección para satisfacer el test. Vite necesitó permisos adicionales para sus subprocesos locales y estos se autorizaron; no se eludieron rechazos. La comprobación inicial de hashes también requirió autorizar el subproceso de lectura de Git bloqueado por Windows.

## Límites y detención

- Son pruebas locales con datos inyectados; no navegador real, cuentas remotas A/B, RLS real, eventos Realtime de Supabase ni mediciones de carga.
- La app visible continúa usando su catálogo y suscripción actuales. Este controlador no anuncia el aviso en pantalla todavía.
- Sin snapshot entre páginas: deduplicar y bloquear después de un cambio conocido no recupera todas las omisiones ni detecta cambios que nunca se observaron. Los eventos de publicaciones normales requieren un mecanismo de reconciliación o una autorización remota posterior; no se habilita Realtime de products aquí.
- No se instala RPC, índices, extensiones ni 008. Pagos/efectivo continúan deshabilitados. Respaldos y credenciales quedan fuera del trabajo.
- En este bloque no se implementó el laboratorio persistente ni el SQL. Los preparativos y publicaciones posteriores constan en la guía vigente; no autorizan una instalación.
