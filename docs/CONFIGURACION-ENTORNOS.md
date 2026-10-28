# Configuración de desarrollo, laboratorio y producción

Etapa 3 de correcciones, 28 de octubre de 2026. Preparación local: no instala ni arranca un laboratorio, no modifica Supabase, no ejecuta SQL y no cambia la migración 008. Efectivo y pagos digitales continúan sin estar disponibles.

## Entornos y destinos

| Uso | Selección | Archivo de entrada | Destino permitido |
| --- | --- | --- | --- |
| Desarrollo actual | `npm run dev` (modo development) | Archivos `.env*` habituales de Vite en la raíz; se conserva `.env.local` | Proyecto remoto actual, exclusivamente HTTPS |
| Producción | `npm run build`, después `npm run preview` para inspección local | Archivos `.env*` habituales de Vite, modo production | El mismo proyecto remoto autorizado, exclusivamente HTTPS |
| Laboratorio futuro | `npm run dev -- --mode lab` | Solo archivos de entorno dentro de `.lab/`; recomendado `.lab/.env.lab.local` | API local `http://127.0.0.1:54321` o `http://localhost:54321`, con activación explícita |

**Desarrollo actual no significa base de datos de prueba.** Conserva su conexión remota y sus datos actuales. El modo lab es la única excepción que admite HTTP; no sirve para apuntar a otro proyecto remoto ni a una IP de la red doméstica. No existe sustitución automática entre entornos si algo falla.

La lista revisada de destinos está en `src/lib/environment-policy.js`. Contiene únicamente orígenes públicos, no claves. Las variables de entorno no pueden añadir proyectos a esa lista. Cambiar de proyecto, puerto de API o proveedor de mapas requiere revisar el código y sus pruebas. Las rutas, credenciales en URL, parámetros, fragmentos, puertos alternativos y nombres que imitan localhost se rechazan.

La URL y la clave pública actuales no se modificaron ni se copiaron a un archivo de laboratorio. El desarrollo y la producción conservan la clave de almacenamiento de sesión que usa actualmente el SDK. El laboratorio utiliza una clave de sesión diferente y el servidor web queda restringido a `127.0.0.1:5175`, con puerto estricto. No se permite servirlo en `0.0.0.0` ni compilarlo o previsualizarlo como una aplicación distribuible. No cambies `NODE_ENV` para intentar saltar estas restricciones.

## Variables que llegan al navegador

Vite deja de exponer automáticamente todo lo que empiece por `VITE_`. El código selecciona y valida únicamente:

- `VITE_SUPABASE_URL`.
- `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `VITE_MAP_TILE_URL`, opcional, limitado al origen y plantilla actuales de OpenStreetMap.

Los indicadores internos de entorno se generan a partir del modo autorizado; no se aceptan como variables editables. Las variables públicas desconocidas provocan un error, incluso si su nombre no contiene «SECRET». Las claves `sb_secret_`, `service_role`, JWT de roles privados, claves PEM y cadenas PostgreSQL no deben llegar al cliente. La validación no imprime sus valores. No incluyas secretos en variables `VITE_`, código fuente, comandos, capturas ni logs.

La aplicación remota sigue aceptando exclusivamente claves públicas `sb_publishable_`. Para el futuro laboratorio se acepta una clave publishable propia o el formato local heredado `anon`, con emisor `supabase-demo`. Leer los campos de un JWT aquí **no verifica su firma** ni concede permisos: Auth y RLS del servidor siguen siendo responsables de autorizar cada solicitud.

Al preparar lab, se comparan sus claves en memoria con las claves públicas configuradas para development y production y se rechaza una coincidencia. Las claves remotas no se incorporan al bundle de laboratorio. Una clave publishable opaca no permite demostrar por sí sola a qué servidor pertenece: verificar su origen, funcionamiento y rechazo por el entorno equivocado requiere las pruebas del laboratorio futuro. Tampoco se pueden reconocer todas las claves históricas o de proyectos desconocidos; no copies ninguna credencial remota al laboratorio.

## Uso futuro, después de autorizar e instalar el laboratorio

Estos pasos son una guía para más adelante; no se ejecutaron en esta etapa.

1. Aprobar e instalar por separado el laboratorio aislado y sus herramientas. Configurar sus servicios con claves y usuarios propios; no usar secretos, MFA, sesiones ni contraseñas de producción.
2. Crear `.lab/` en el proyecto y copiar allí `.env.lab.example` con el nombre `.env.lab.local`. Tanto esa carpeta como sus archivos reales están ignorados por Git; la plantilla no contiene claves.
3. Conservar `PJD_LAB_ENABLED=false` hasta verificar el aislamiento del backend. Después, cambiarlo a `true` en ese archivo privado, mantener una de las dos URL locales autorizadas e introducir **solo la clave pública local** en `PJD_LAB_SUPABASE_PUBLISHABLE_KEY`.
4. No copiar `.env.local` ni `.env.test.local`. No exportar variables `VITE_` a la terminal del laboratorio: se rechazan para impedir herencias accidentales. Si aparece un error, corrige la configuración; no desactives la validación.
5. Iniciar `npm run dev -- --mode lab`. Abrir únicamente `http://127.0.0.1:5175`. Si el archivo falta o no está habilitado, debe fallar antes de crear el cliente. Si el backend no existe, la aplicación no cambia al remoto.
6. Probar con usuarios y datos sintéticos locales. Verificar las solicitudes en el navegador y la separación de sesiones; el frontend no muestra un distintivo nuevo en esta etapa. Para volver al desarrollo actual, detener ese proceso y ejecutar el comando habitual, sin editar sus credenciales.

No ejecutar scripts de integración remota en este laboratorio suponiendo que el modo Vite los redirige. Los scripts existentes `check:backend`, `test:integration`, `test:meetings`, `test:chat`, `test:auctions`, `test:deliveries`, `test:claims` y otros runners remotos conservan su selección propia y requieren revisión/autorización independiente. Esta corrección separa el cliente Vite; no redirige CLIs, PostgreSQL ni restauraciones.

## Verificación y límites

`node scripts/environment-checks.mjs` y `npm test` comprueban, sin red, los modos, la lista de destinos, la ausencia de herencia desde la raíz, variables inesperadas, claves privadas, claves remotas copiadas, sesiones separadas y restricciones de publicación del laboratorio. Las pruebas utilizan claves sintéticas y archivos pequeños temporales que se retiran al terminar. `npm run lint` y `npm run build` verifican el código y el build habitual.

La preparación no verifica todavía un laboratorio real, Auth local, callbacks de correo, cámara, restauración, Cron, Realtime ni Edge Functions locales. El acceso desde teléfonos/tablets al laboratorio exigiría un diseño HTTPS y autorización posteriores; `localhost` en un teléfono apunta al propio teléfono.

Esto tampoco constituye un aislamiento de red del sistema operativo. El mapa usa recursos públicos externos y los datos restaurados podrían contener enlaces externos. Antes de restaurar o arrancar servicios deben revisarse URLs de fotografías, callbacks, SMTP, webhooks, notificaciones y tareas Cron y bloquear salidas no autorizadas. No introducir respaldos reales con credenciales de usuarios en un laboratorio de prueba sin el procedimiento aislado aprobado. Las pruebas actuales no consumen ni modifican respaldos.

## Referencias

- [Vite: variables y modos](https://vite.dev/guide/env-and-mode): exposición de variables, prioridad de archivos y separación entre modo y NODE_ENV.
- [Vite: envPrefix y define](https://vite.dev/config/shared-options): publicación explícita de constantes y desactivación de prefijos automáticos.
- [Supabase: claves API](https://supabase.com/docs/guides/getting-started/api-keys): claves públicas frente a claves privilegiadas; estas últimas omiten RLS.
- [Supabase: desarrollo local](https://supabase.com/docs/guides/local-development/cli/getting-started): backend local independiente. Su instalación sigue pendiente de autorización.
