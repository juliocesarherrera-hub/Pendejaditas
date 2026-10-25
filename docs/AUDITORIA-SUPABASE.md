# Revisión de la configuración instalada

Fecha: 24 de octubre de 2026. Fuente: JSON `marketplace_audit` compartido por el propietario del proyecto, producido por la consulta de diagnóstico de solo lectura. No se ejecutó ninguna migración o modificación remota durante esta revisión.

## Conclusión

No se encontraron bloqueos en las definiciones entregadas para continuar con Auth, perfiles, publicaciones y fotografías. Las nueve políticas, permisos de columnas, restricciones y triggers coinciden con los utilizados por la integración. No hace falta repetir la migración, recrear tablas ni eliminar datos.

Esta conclusión revisa las definiciones proporcionadas, no certifica toda la plataforma ni reemplaza una prueba autenticada con dos cuentas. La disponibilidad del catálogo público se comprobó aparte mediante consultas remotas de solo lectura.

## Políticas revisadas por su contenido

| Política | Condiciones comprobadas | Resultado de revisión |
| --- | --- | --- |
| `products_public_read` | SELECT para anon/authenticated, USING true | Lectura pública deliberada |
| `products_owner_insert` | INSERT para authenticated, WITH CHECK auth.uid() = owner_id | No permite publicar a nombre de otra cuenta |
| `products_owner_update` | UPDATE para authenticated; USING y WITH CHECK auth.uid() = owner_id | Limita fila existente y fila resultante al propietario |
| `products_owner_delete` | DELETE para authenticated, USING auth.uid() = owner_id | Eliminación propia |
| `profiles_public_read` | SELECT para anon/authenticated, USING true | Solo contiene campos públicos; no hay correos ni contraseñas en esta tabla |
| `profiles_owner_update` | UPDATE para authenticated; USING y WITH CHECK auth.uid() = id | Edición propia sin cambiar de identidad |
| `product_images_owner_insert` | INSERT para authenticated; bucket exacto, carpeta del UUID autenticado y nombre/extensión restringidos | Subida a la carpeta propia |
| `product_images_owner_select` | SELECT para authenticated; bucket exacto y carpeta propia | Lectura de metadatos de objetos propios |
| `product_images_owner_delete` | DELETE para authenticated; bucket y carpeta propios; NOT EXISTS publicación que referencie el archivo | No elimina fotografías ajenas ni fotografías que siguen asociadas a un artículo |

El resultado compartido contiene esas nueve políticas y ninguna política adicional que amplíe las escrituras en estas tablas. Todas son permisivas: por eso futuras políticas adicionales también tendrán que revisarse, pues se pueden combinar con OR.

## Permisos y restricciones

- RLS está habilitado en `profiles`, `products` y `storage.objects`.
- `anon` tiene SELECT en las tablas públicas, sin permisos de escritura.
- `authenticated` puede insertar productos en las columnas previstas, editar solo sus campos de contenido y eliminarlos según RLS. No tiene UPDATE sobre `owner_id`, `id`, `created_at` o `updated_at`.
- En perfiles, authenticated solo puede actualizar `display_name`, `bio` y `city`, aplicando RLS. Los perfiles nuevos los crea el trigger, no una inserción libre del navegador.
- Hay claves primarias y referencias `products.owner_id → profiles.id → auth.users.id`; `products_owner_id_fkey` coincide con el nombre de relación usado por la consulta del catálogo.
- Se restringen categoría, condición, zona, longitudes, precios y modalidad. Solo se admiten `fixed` y `offers`; el servidor no admite subastas.
- La ruta de fotografía es única y debe pertenecer a la carpeta del propietario.

`force_rls: false` no es un fallo por sí solo: RLS sigue aplicando a los roles de la aplicación. Los propietarios de tablas y roles privilegiados pueden omitir RLS; por ello nunca se usan credenciales administrativas en el navegador. Esta revisión no analiza otros esquemas, membresías de roles personalizadas ni configuraciones ajenas al diagnóstico.

## Triggers y funciones

- `profiles_updated` y `products_updated` están habilitados y asignan `updated_at` en servidor. La aplicación utiliza esa fecha para detectar ediciones concurrentes.
- `on_auth_user_created` crea el perfil para el UUID de la cuenta registrada y valida el nombre público. No permite asignar un propietario arbitrario.
- `products_image_exists` comprueba el bucket, la existencia de la fotografía y `storage.objects.owner_id` antes de insertar o cambiar la imagen de un artículo.
- Las funciones SECURITY DEFINER usan `search_path` vacío y referencias calificadas; sus ACL no permiten ejecución directa a anon/authenticated/PUBLIC.
- `marketplace_health` no es SECURITY DEFINER y solo devuelve el entero 2; sirve como comprobación de compatibilidad, no como auditoría automática de seguridad.

## Almacenamiento

El bucket `product-images` es público, permite JPEG/PNG/WebP y limita los archivos a 2,097,152 bytes. Que sea público permite mostrar fotografías en el catálogo a visitantes; no debe utilizarse para documentos de identidad u otros archivos privados. No hay política UPDATE para sobrescribir objetos: las sustituciones usan rutas nuevas.

La política SELECT de metadatos no convierte las fotografías en privadas: la descarga de fotografías de un bucket público es pública por diseño.

## Qué falta probar en ejecución

1. Registro con correo real y creación automática del perfil.
2. Confirmación de correo, acceso, renovación y cierre de sesión.
3. Subida, publicación, edición y eliminación con la cuenta A.
4. Lectura del artículo por la cuenta B, con rechazo de modificaciones ajenas por API.
5. Acceso a Storage con ambas cuentas y bloqueo de carpetas ajenas.
6. Recuperación de contraseña y entrega efectiva de los correos.

## Resultado de la prueba remota con dos cuentas

El propietario proporcionó dos cuentas ya registradas y confirmó su disponibilidad. El archivo local de pruebas se encontró en `supabase/diagnostics/.env.test.local` y se movió a `.env.test.local` en la raíz, sin imprimir ni modificar sus valores. Está cubierto por `.env.*`, `*.local` y una exclusión explícita `.env.test.local`. El directorio de trabajo no tiene un repositorio Git inicializado; no existe un índice local que verificar. Las reglas de exclusión quedan preparadas para cuando se utilice Git.

Se ejecutó `npm run test:integration` con la clave pública y sesiones reales de ambas cuentas, sin credenciales administrativas. Resultado: **15 comprobaciones aprobadas, sin fallos detectados**:

1. Inicio de sesión de A.
2. Inicio de sesión de B.
3. Subida de fotografía por A y descarga con bytes idénticos.
4. Rechazo de subida de B a una carpeta de A.
5. Publicación de A en la base de datos.
6. Lectura desde B y desde un visitante sin sesión.
7. Rechazo de edición por B; el título original se conservó.
8. Rechazo de eliminación por B; el artículo siguió existiendo.
9. Rechazo de inserción suplantando al propietario.
10. Rechazo de modificación del perfil de A por B.
11. Rechazo de publicación sin sesión.
12. Edición propia de A confirmada en la respuesta del servidor.
13. Rechazo de eliminación de la fotografía ajena por B; el archivo siguió disponible.
14. Eliminación de la publicación temporal por A.
15. Eliminación confirmada de la fotografía temporal por A.

Solo se crearon recursos identificados como prueba temporal. Se eliminaron los recursos creados por la ejecución y se cerraron sus sesiones de prueba con alcance local. No se imprimieron correos, contraseñas, tokens o claves. No se ejecutó ninguna migración ni se alteraron las políticas existentes.

El resultado valida los casos ejecutados en ese momento, no constituye una garantía para todas las operaciones futuras. Siguen pendientes las pruebas de interacción en navegador/dispositivos, entrega y recuperación por correo, renovación prolongada de sesión, edición simultánea y moderación. La prueba reutiliza cuentas creadas previamente; no prueba automáticamente el formulario de registro ni sus correos.
