# Consultas independientes de perfiles y favoritos

Corrección local del 28 de octubre de 2026. No instala migraciones, modifica RLS ni activa efectivo o pagos. No utiliza claves administrativas.

## Comportamiento

- Los perfiles consultan su perfil público y las publicaciones del vendedor mediante su identificador. No filtran el catálogo descargado por la página principal.
- Las publicaciones del vendedor se leen en páginas de 12, con una fila adicional para saber si hay más. El orden es `created_at DESC, id DESC`. El cursor conserva el timestamp del servidor completo, incluidos microsegundos; no usa desplazamientos que cambien al insertar o eliminar otra fila.
- Los favoritos siguen siendo referencias locales del dispositivo, compartidas por las sesiones que utilizan ese almacenamiento. No se convierten en favoritos privados de una cuenta ni se migran a Supabase.
- Cada consulta de favoritos contiene como máximo 12 UUID válidos. Mantienen el orden de guardado del dispositivo, del más reciente al más antiguo, normalizando mayúsculas y deduplicando referencias para la lectura.
- Las referencias antiguas de demostración, malformadas, eliminadas o no visibles se conservan. No se intenta averiguar si una fila oculta por RLS existe. Tampoco se cambian identidades para consultarla.
- Una respuesta de red fallida es un error recuperable, no una lista vacía. Si falla una página posterior, se conservan las anteriores y se reintenta el mismo cursor.
- Las respuestas de perfiles, favoritos o sesiones anteriores se descartan; al desmontar se abortan las solicitudes. Los clics repetidos para cargar más comparten la solicitud pendiente.
- Se reutilizan tarjetas, estilos, filtros y formularios existentes. Los filtros y el orden por precio de favoritos se aplican a las publicaciones ya consultadas; la pantalla lo indica y permite cargar los siguientes grupos. No se anuncian como una búsqueda global en el servidor.
- Las subastas se consultan en lotes acotados para mostrar precio actual, número de pujas, estado y reloj. No se cambian su motor, historial ni reglas. Si sus datos no pueden verificarse, la lista muestra un error y permite reintentar; no trata una subasta como precio fijo.

## Edición y compatibilidad

Desde el perfil propio, «Editar» abre el formulario `PublishPage` existente con la publicación consultada. Así puede editarse una publicación aunque no figure en el catálogo inicial. Se conservan los controles del servidor y el control optimista `updated_at` existente; las subastas no muestran el botón de edición. Guardar o eliminar vuelve a consultar las publicaciones del perfil.

Se conserva el trabajo pendiente anterior, incluidos estilos globales, navegación, pruebas existentes y Fase 8. Con la autorización posterior del propietario se cambió exclusivamente el bloque de favoritos y contadores de App.jsx: ahora usa UUID normalizados del dispositivo, sin consultar el catálogo. Las rutas y bloques pendientes de efectivo se conservan en el trabajo local y quedan fuera de esta selección; no son necesarios para estas correcciones. La cifra de publicaciones del perfil se identifica como «Publicaciones consultadas», no como un total completo antes de paginar.

## Actualizaciones locales y pestañas

Los clics se procesan en una cola por clave y pestaña, leyendo el estado más reciente al ejecutar cada acción. React se suscribe a una instantánea estable mediante `useSyncExternalStore`. No se realiza escritura por renderizado, por cambio de sesión ni al leer favoritos antiguos.

Las lecturas normalizan UUID y sus variantes; quitar un favorito elimina todas sus variantes equivalentes en una sola actualización. Las referencias desconocidas, inválidas o temporalmente no disponibles se conservan. Los UUID inválidos enviados al botón se ignoran, sin sustituir la lista existente. Si el contenido raíz de localStorage está corrupto o no es una lista, se conserva sin sobrescribirlo y se muestra el aviso existente de fallo de almacenamiento.

La misma pestaña comparte una fuente de estado por clave. Entre pestañas del mismo origen se escuchan los eventos `storage` y se vuelve a leer el valor actual; los eventos antiguos no restauran su valor anterior. También se reconcilia al recuperar el foco. Se mantiene la clave `pendejaditas:favorites:v1`: cerrar sesión o pasar de A a B no borra favoritos ni los convierte en datos por cuenta.

Cuando Web Locks está disponible, las pestañas que usan esta implementación coordinan el ciclo lectura/cambio/escritura mediante el mismo bloqueo por clave. Es una coordinación adicional de la aplicación, **no una transacción de localStorage**. Si esa API no existe o una escritura externa no utiliza el bloqueo, hay sincronización de mejor esfuerzo y dos escrituras realmente concurrentes pueden sobrescribirse: prevalece la última escritura persistida. No se promete atomicidad entre pestañas, orígenes, navegadores, dispositivos ni versiones antiguas.

Si falla el acceso o la cuota, los cambios pueden mantenerse solo en memoria con el aviso existente. No se afirma que estén guardados. Las pruebas automatizadas usan almacenamiento, pestañas y bloqueos inyectados, sin tocar favoritos reales del usuario. La confirmación posterior del propietario en navegador real se registra por separado a continuación.

## Pruebas locales

Ejecutar por separado, ya que package.json y scripts/verify.mjs forman parte del trabajo protegido:

```text
node scripts/public-collections-checks.mjs
node scripts/favorites-state-checks.mjs
npm test
npm run lint
npm run build
```

El nuevo script utiliza clientes inyectados con identidades A/B/C/D sintéticas y el renderizado real de componentes con un hook de datos inyectado. Comprueba filtros por vendedor, visibilidad simulada, favoritos antiguos y no disponibles, tamaños acotados, orden, timestamps con empates, inserciones y eliminaciones entre páginas, precio de subastas, errores de red/permisos, reintentos y respuestas antiguas. No abre cuentas reales ni ejecuta SQL.

Estos clientes **no prueban las políticas RLS instaladas**. En una revisión posterior de solo lectura contra Supabase se verificaron las sesiones temporales A/B/C/D, perfiles propios y ajenos, favoritos de 12 y 1 publicaciones, una referencia no disponible y cambios A→B→C→D en el mismo cliente SDK. C y D, sin elevar MFA, no recibieron filas en ocho recursos privados del intercambio técnico A/B. No se crearon ni eliminaron publicaciones. Esas comprobaciones acotadas no constituyen una auditoría exhaustiva de RLS ni prueban todas las acciones en navegador. El cursor de vendedor funcionó, pero la frontera real 12→13 de un mismo vendedor sigue pendiente porque no había 13 publicaciones visibles de un mismo vendedor.

El propietario confirmó el 28 de octubre de 2026 que, en su navegador real, funcionaron estas tres pruebas: guardar dos publicaciones rápidamente, sincronizar favoritos entre dos pestañas y conservarlos después de cerrar y volver a abrir. Son resultados reportados por el propietario; el agente no tuvo navegador conectado para observarlos. No se registraron navegador, versión ni dispositivo. Siguen pendientes la matriz de navegadores/dispositivos, la prueba interactiva de privacidad A/B y los escenarios de cuotas o bloqueo de almacenamiento en navegadores reales.

Para pruebas manuales adicionales, usar la versión local actual y el mismo origen exacto en ambas pestañas. No eliminar publicaciones reales ni vaciar el almacenamiento para generar un caso de prueba; usar únicamente datos técnicos autorizados o referencias no disponibles que ya existan.

Los cursores no son una instantánea transaccional de toda la base. Una publicación nueva posterior a la primera página aparece al volver a consultar el perfil; una modificación de su fecha de creación por un proceso externo podría cambiar su posición. Cambiar favoritos reinicia su consulta con la nueva lista. La evaluación de índices, carga y optimización del catálogo general queda fuera de esta corrección.

Referencias técnicas: [filtros de Supabase](https://supabase.com/docs/reference/javascript/using-filters), [orden de resultados](https://supabase.com/docs/reference/javascript/order) y [caracteres reservados de PostgREST](https://docs.postgrest.org/en/stable/references/api/url_grammar.html#reserved-characters). El cursor valida sus valores y entrecomilla el timestamp; no acepta expresiones de filtro arbitrarias.

Persistencia: [Web Storage](https://html.spec.whatwg.org/multipage/webstorage.html#introduction), [Web Locks](https://w3c.github.io/web-locks/) y [useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore). La especificación de Web Storage no garantiza un mecanismo de bloqueo entre procesos.
