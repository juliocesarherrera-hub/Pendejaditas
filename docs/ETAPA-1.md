# Estado del proyecto y revisión de la etapa 1

## Alcance

Se conserva el proyecto React 19 + Vite 8 + Tailwind 3 + Lucide React, el título «Tu próximo hallazgo. Está cerca.», el fondo oscuro, el naranja `#FF6B00` y el verde `#00C853`. No se añadieron dependencias ni se modificó el lockfile.

Se revisaron las pantallas, componentes, datos, persistencia, utilidades, pruebas y configuraciones. Los SVG de plantilla y `src/App.css` no se importan y se conservan. No hay backend, proyecto Supabase, carpetas nativas ni configuración de Capacitor.

## Archivos modificados

- `src/App.jsx`: catálogo local sin fixtures, rutas, foco y título por sección.
- `src/components/Layout.jsx`: enlaces de navegación, salto al contenido y destino de foco.
- `src/components/ProductCard.jsx`: carga de fotografías y recuperación cuando cambia una imagen fallida.
- `src/pages/HomePage.jsx`: portada local responsive y estado vacío con opción de publicar.
- `src/index.css`: tamaños táctiles, columnas, áreas seguras y breakpoints.
- `index.html`: viewport que permite aplicar áreas seguras.
- `package.json`: comando `npm test`, sin nuevas dependencias.
- `scripts/verify.mjs`: pruebas de rutas, enlaces, archivos WebP y catálogo vacío.
- `README.md`: instrucciones y límites actualizados.

Archivos añadidos: `src/utils/navigation.js`, este informe, las variantes `public/images/playstation-5-640.webp` y `public/images/playstation-5-1280.webp`, y `public/images/ATTRIBUTION.md` con fuente y licencia.

## Funciones actuales

| Función | Estado real |
| --- | --- |
| Navegación, búsqueda, filtros, orden y detalles | Operativos sobre el catálogo local |
| Publicar una fotografía, título, descripción, condición y modalidad | Operativo solo en este navegador, mediante localStorage |
| Favoritos y eliminación de publicaciones locales | Operativos localmente |
| Perfil | Identidad de prueba, sin usuario autenticado |
| Precio fijo, ofertas y subastas | Selección visual de modalidad; interés, ofertas y pujas explícitamente simulados |
| Temporizadores | Reloj del navegador; sin adjudicación ni sincronización de servidor |
| Registro, sesión, edición de publicaciones y compras/ventas | Pendientes de la etapa de backend |
| Chat, mapa, citas, notificaciones y administración | No implementados |
| Identidad, entrega, disputas y eventos de seguridad | No implementados |
| Cobros, transferencias y billetera | No implementados; ningún botón procesa dinero |

Los seis productos ficticios de `src/data/products.js` se conservan como fixtures de pruebas. La aplicación no los incorpora al catálogo. Una instalación limpia muestra un estado vacío con la acción para crear una publicación local, siempre identificada como prueba. Se conservan las publicaciones locales existentes; no se borraron datos del navegador.

## Ajustes responsive y navegación

- Columnas con mínimos flexibles, sin anchos fijos de titulares ni márgenes negativos en la tira de categorías.
- La foto de portada se muestra también en celulares: no queda reducida a una franja detrás del texto.
- Navegación inferior hasta 1023 px, incluida tablet en vertical y plegables; navegación superior desde 1024 px.
- Catálogo de tres columnas en escritorio, dos en tablet y celular amplio, una en teléfonos estrechos (hasta 380 px).
- Detalles en una columna hasta 900 px y formulario en una columna hasta 1023 px. Vista previa disponible debajo del formulario en tablets y celulares.
- Campos a 16 px en pantallas táctiles y tamaños de tablet/celular para evitar el zoom de enfoque de Safari.
- Controles principales, favoritos y enlaces de navegación con al menos 44 px de alto. Botones de modalidad apilados en pantallas estrechas.
- `viewport-fit=cover`, márgenes para áreas seguras, alto dinámico de ventana y espacio reservado para la barra inferior.
- Navegación por enlaces hash, enlace para saltar al contenido, foco en el contenido tras cambiar de pantalla y título de documento por sección.
- Identificadores de productos codificados y lectura tolerante a rutas inválidas.

## Verificación y límites

```bash
npm run lint
npm test
npm run build
```

Las pruebas automatizadas verifican filtros combinados, rutas, enlaces y estados activos, catálogo inicial vacío, renderizado de pantallas, recuperación ante datos dañados y publicaciones/favoritos persistidos. No prueban un servicio remoto ni operaciones reales.

No hay navegador conectado a las herramientas de esta sesión. Por eso el renderizado HTML y los estilos sí se revisan, pero no se afirma haber medido el layout ni los gestos en un navegador o en dispositivos físicos.

Antes de considerar validada la compatibilidad, realizar esta matriz en las herramientas de desarrollo del navegador y en dispositivos reales:

| Ventana CSS de referencia | Escenario |
| --- | --- |
| 280 × 653, 320 × 568 | Teléfono muy estrecho |
| 360 × 800, 390 × 844, 430 × 932 | Android y iPhone |
| 344 × 882 y 768 × 882 | Plegable cerrado y abierto |
| 768 × 1024, 820 × 1180, 1024 × 768 | Tablets en ambas orientaciones |
| 1280 × 800, 1440 × 900, 1920 × 1080 | Laptop y escritorio |

En cada tamaño: recorrer inicio, subastas, guardados, publicación, perfil y detalle; abrir filtros; probar textos largos y precios máximos; comprobar `document.documentElement.scrollWidth <= window.innerWidth`; usar teclado y zoom al 200%; rotar con un formulario abierto y comprobar el teclado virtual. La fila de categorías puede desplazarse dentro de su propio contenedor, sin desplazar horizontalmente toda la página. Para plegables se adapta al ancho disponible; la separación por bisagra y los gestos requieren pruebas físicas.

## Capacitor: evaluación, sin instalación

La arquitectura es compatible en principio con integrar Capacitor al proyecto actual: ya existe `package.json`, Vite genera `dist/` y su `index.html` contiene `<head>`. Esa es la estructura exigida por la [guía oficial de instalación](https://capacitorjs.com/docs/getting-started). La futura configuración debería apuntar `webDir` a `dist`, conservando React y los estilos.

No se instaló Capacitor ni se crearon `android/`, `ios/` o un identificador de aplicación provisional. Antes hay que definir:

1. Identificador definitivo de aplicación, dominio, iconos y responsables de las cuentas de tiendas.
2. Backend, autenticación y enlaces de retorno autorizados para web y aplicaciones nativas.
3. Versiones compatibles de `@capacitor/core`, CLI y plataformas; explicar e instalar entonces cada dependencia.
4. Android Studio y SDK para Android. Para iOS, acceso a un Mac con Xcode y configuración de firma. La [documentación oficial del entorno](https://capacitorjs.com/docs/getting-started/environment-setup) especifica los requisitos de la versión vigente; no basta con tener VS Code en Windows.
5. Permisos y pruebas para cámara/fototeca, teclado, botón Atrás de Android, áreas seguras, enlaces profundos, red interrumpida y ciclo de vida.

La reutilización de la base web es viable; el empaquetado no sustituye las pruebas nativas ni garantiza aceptación en las tiendas. No se ha comprobado qué SDK nativo está instalado en este equipo.

## Próxima etapa: usuarios, publicaciones e imágenes persistentes

Se necesita crear o proporcionar un proyecto de Supabase, su URL y su clave pública de cliente. La clave privada/service-role debe permanecer solo en servidor. Se implementarán migraciones para perfiles y publicaciones, políticas RLS de propiedad y acceso, almacenamiento de fotografías con permisos, registro/inicio de sesión, edición y eliminación de publicaciones propias, estados de carga y validación del servidor.

No se solicitaron credenciales en esta etapa ni se escribieron secretos en el frontend. El motor de pujas y sus transacciones, la extensión automática, chat/citas, seguridad y la investigación de pagos corresponden a las siguientes etapas de la solicitud. No se evaluaron condiciones financieras ni regulatorias como parte de este ajuste visual.
