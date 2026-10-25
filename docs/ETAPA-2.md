# Etapa 2: Supabase Auth, perfiles, publicaciones y fotografías

## Estado y configuración

El código utiliza el cliente oficial `@supabase/supabase-js` que ya estaba instalado. No se añadieron dependencias. `@supabase/ssr` también estaba instalado, pero no se utiliza: esta aplicación es una SPA de Vite.

Las variables de `.env.local` se comprobaron sin imprimir valores. Se corrigieron los prefijos NEXT_PUBLIC_ a VITE_, necesarios para Vite. Se utiliza únicamente una clave `sb_publishable_`. El archivo está ignorado por Git; nunca compartas una clave service_role, sb_secret_, contraseña de la base de datos o credenciales de tus usuarios por chat. El arranque y el build bloquean configuraciones que parecen incluir secretos en variables VITE_.

La integración está implementada. La conexión y las columnas públicas se comprobaron de forma remota. Las definiciones instaladas de RLS, permisos, triggers y bucket se revisaron a partir del JSON compartido por el propietario. Después se ejecutaron 15 comprobaciones remotas con dos cuentas: todas aprobaron, incluida la limpieza de los recursos temporales. Consulta [AUDITORIA-SUPABASE.md](AUDITORIA-SUPABASE.md). Quedan pendientes las pruebas de navegador, entrega y recuperación por correo y renovación prolongada de sesión. La app solo anuncia conexión después de consultar la versión del backend y el catálogo.

## 1. Revisar la estructura existente y los permisos

Este proyecto ya tiene `profiles`, `products` y `product-images`. No vuelvas a ejecutar la migración completa: el error de tabla existente no se resuelve borrando información.

1. Abre SQL Editor → New query.
2. Copia `supabase/diagnostics/audit-marketplace.sql`. Contiene únicamente un SELECT: no crea objetos, no modifica datos y no consulta registros de usuarios o productos.
3. Ejecuta la consulta y comparte su JSON para revisar las definiciones reales. No compartas claves, contraseñas ni registros privados.
4. Revisaremos `USING`, `WITH CHECK`, roles y comandos de todas las políticas aplicables, no solo sus nombres. Las políticas permisivas se combinan con OR, por lo que una adicional demasiado amplia puede permitir una escritura que otra política restringe.
5. Compararemos también RLS, columnas, claves foráneas, restricciones, permisos de columnas, triggers, funciones y límites del bucket. Cualquier corrección se preparará de forma puntual, sin tablas duplicadas ni eliminación de registros.

Comprobación remota realizada con la clave pública: la función de compatibilidad devuelve versión 2; las consultas sin filas de catálogo, relación con vendedores y perfiles son accesibles; también responde la configuración pública de Auth. El registro por correo está habilitado y requiere confirmar el correo. El JSON de auditoría ya fue revisado sin encontrar condiciones de escritura ajena en las políticas proporcionadas. Esto no demuestra que ya se hayan probado registros, subidas o escrituras autenticadas con dos cuentas.

La clave pública de navegador no permite inspeccionar las definiciones administrativas de las políticas. Por eso la consulta de auditoría se ejecuta en el editor SQL del proyecto. No se necesita una clave privada en el código de la aplicación.

La migración original documenta esta estructura esperada; no se asume que las definiciones instaladas sean idénticas:

- `profiles`: ID, nombre público, biografía, ciudad y fechas. No incluye correo, domicilio, documentos ni contraseñas.
- `products`: propietario, título, descripción, categoría, condición, modalidad, precio entero MXN, zona, ruta de fotografía y fechas.
- Trigger para crear el perfil al registrar una cuenta y completar perfiles de cuentas ya existentes.
- RLS: lectura pública de perfiles y artículos; actualización del perfil solo por su propietario; publicación, edición y eliminación de artículos solo por su propietario.
- Permisos de columnas para impedir cambiar IDs, propietario y fechas desde la API.
- Restricciones de servidor para categorías, zonas, condiciones, montos, longitudes y modalidades. Solo admite precio fijo y precio negociable; no permite subastas.
- Bucket público `product-images`, máximo 2 MB y MIME JPG/PNG/WebP. Las fotografías de artículos son públicas por diseño; no subas documentos privados.
- Subidas solo a la carpeta del propio UUID, sin sobrescritura. Eliminación solo de fotografías propias que ya no estén asociadas a una publicación.
- Validación de que la fotografía exista en Storage y pertenezca al vendedor antes de guardar una publicación.

La propiedad nunca se toma de un campo editable por el usuario. RLS aplica incluso si alguien evita la interfaz e intenta escribir directamente por la API. Su eficacia debe comprobarse con las pruebas remotas de dos cuentas.

## 2. Configurar Auth

En Authentication:

1. Comprueba que el proveedor Email permita registros y acceso con contraseña.
2. Mantén activada la confirmación de correo. No usamos cuentas confirmadas ficticiamente.
3. En URL Configuration, para desarrollo con el puerto predeterminado de Vite, usa Site URL `http://localhost:5173` y autoriza estas Redirect URLs:
   - `http://localhost:5173/`
   - `http://localhost:5173/?flow=recovery`
4. Si Vite usa otro puerto o publicas el sitio, añade las URLs exactas equivalentes. En producción usa HTTPS y el dominio del frontend, no la URL de Supabase.
5. Revisa entrega de correos y límites del servicio. La confirmación y recuperación requieren que Supabase pueda enviar correos; para producción configura un proveedor SMTP adecuado.

Auth usa PKCE. Solicita y abre los enlaces de confirmación/recuperación en el mismo navegador que inició el flujo. El correo y la contraseña se envían a Supabase Auth; no se guardan en la tabla pública de perfiles. La sesión se conserva y se renueva con el SDK. Cerrar sesión aquí cierra únicamente la sesión del dispositivo actual.

Documentación oficial: https://supabase.com/docs/guides/auth/sessions/pkce-flow y https://supabase.com/docs/guides/auth/redirect-urls.

## 3. Ejecutar y comprobar

```bash
npm run dev
npm run check:backend
npm run lint
npm test
npm run build
```

Reinicia Vite después de modificar variables de entorno. `check:backend` es de solo lectura y no imprime valores, claves o filas de usuarios. Comprueba la versión de migración y el acceso anónimo al catálogo; no sustituye la prueba de permisos de dos usuarios.

Los tests predeterminados son locales: validaciones, renderizado, navegación, propietario/visitante, estados de conexión, imágenes y controles monetarios deshabilitados. No crean cuentas ni publicaciones remotas. Las comprobaciones de texto SQL son regresiones estáticas, no evidencia de que RLS ya esté aplicado en tu servidor.

## 4. Prueba manual con dos cuentas

1. Registra la cuenta A con un correo tuyo y confirma el enlace. Inicia sesión y cambia el nombre público y la biografía.
2. Publica una fotografía propia y un artículo. Comprueba que existan en Table Editor → products y Storage → product-images, dentro de la carpeta del UUID de A.
3. Abre otro navegador, un perfil separado o una ventana privada y registra/confirma la cuenta B con otro correo.
4. B debe ver el artículo de A en el catálogo, su fotografía y el perfil público. No debe ver botones para editar o eliminar ese artículo.
5. Copia la ruta `#edit/ID` del artículo de A y ábrela con B: debe mostrar acceso denegado. RLS también debe bloquear una petición directa que intente modificarlo.
6. Publica otro artículo con B. A podrá verlo, sin poder editarlo. Actualiza la página o vuelve al foco: el catálogo se refresca al recuperar el foco y cada 30 segundos mientras la página está visible. No se presenta este mecanismo como tiempo real.
7. Con A edita título, precio y fotografía de su artículo. Comprueba los cambios con B tras actualizar. Si el artículo cambió mientras estaba abierto el editor, la edición se rechaza para evitar sobrescribir cambios sin revisarlos.
8. Con A elimina su artículo, confirma la acción y comprueba con B que ya no exista. Se elimina primero la fila y después su archivo; si falla la limpieza se avisa expresamente.
9. Cierra sesión con A y vuelve a entrar. Sus datos deben persistir. Solicita recuperación de contraseña y completa el cambio desde el correo.
10. Para comprobar con otro dispositivo usa una URL HTTPS accesible desde ambos, con sus redirecciones autorizadas. localhost en el teléfono se refiere al teléfono, no a tu computadora.

## 5. Prueba automatizada de permisos con dos cuentas

Después de crear y confirmar manualmente las dos cuentas, crea `.env.test.local` (ignorado por Git) con:

```dotenv
TEST_USER_A_EMAIL=
TEST_USER_A_PASSWORD=
TEST_USER_B_EMAIL=
TEST_USER_B_PASSWORD=
```

Completa esos valores solo en tu equipo, nunca en el chat o en archivos versionados. Usa cuentas dedicadas de prueba. Se reutilizan la URL y clave pública de `.env.local`.

```bash
npm run test:integration
```

La prueba inicia sesión en ambas cuentas, sube una fotografía y crea una publicación identificada como prueba temporal, comprueba lectura pública, edición propia y rechazos de escritura ajena en productos/perfiles/Storage. Después intenta eliminar solamente los recursos temporales de esa ejecución y cierra sus sesiones de prueba. Si falla la limpieza, informa para revisarla en la cuenta A. No crea cuentas, modifica contraseñas ni usa service_role. Puede ejecutarse únicamente después de aplicar la migración.

## Funciones y límites de esta etapa

Implementadas con operaciones del SDK real: registro, acceso, recuperación, sesión persistente, perfiles públicos/editables, catálogo compartido, creación/edición/eliminación propia y fotografías en Storage. Los mensajes de éxito se muestran después de la respuesta del servicio.

Las fotografías nuevas se vuelven a codificar en el navegador, reduciendo el lado mayor a 1600 px y eliminando metadatos EXIF/GPS antes de subir. Supabase aplica adicionalmente límites de tamaño y MIME. Esto no equivale a un sistema de moderación o análisis de contenido.

Los favoritos continúan siendo propios de este dispositivo y así se indica. Las antiguas publicaciones locales no se publican automáticamente: siguen en el almacenamiento del navegador, pero no se incorporan al catálogo real. No se importan fixtures de pruebas.

Pendientes: mapas, lugares de reunión, citas, chat, ofertas operativas, motor de subastas, compras, historial transaccional, pagos, identidad verificada y moderación. Publicar un precio no genera una compra. No existen billetera, NIP, transferencias ni liberación de dinero.

La interfaz conserva los componentes y estilos responsive de la etapa 1. El navegador de las herramientas no está conectado; la interacción visual, el envío de correos y la prueba de dos cuentas necesitan comprobarse en el entorno real.
