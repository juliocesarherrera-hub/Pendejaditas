# pendejaditas.

Marketplace de gaming y coleccionables en Querétaro, construido sobre React, Vite, Tailwind y Lucide React. Se conserva el diseño oscuro y la portada de PS5.

## Etapa actual

La etapa 2 incorpora Supabase Auth, perfiles públicos, publicaciones compartidas y fotografías en Storage. Las tablas y el bucket ya existen: no repitas la migración completa ni borres información. La revisión de las definiciones y las 15 comprobaciones remotas con dos cuentas resultaron favorables: consulta [docs/AUDITORIA-SUPABASE.md](docs/AUDITORIA-SUPABASE.md). Configuración, instrucciones y límites en [docs/ETAPA-2.md](docs/ETAPA-2.md).

No hay compras, pagos, ofertas operativas o pujas reales. Los botones monetarios están deshabilitados. El catálogo no usa productos ficticios ni recupera las antiguas publicaciones locales como si fueran reales. Los favoritos siguen siendo locales y están etiquetados como tales.

## Ejecutar

```bash
npm run dev
npm run check:backend
npm run lint
npm test
npm run build
npm run preview
```

El frontend requiere en `.env.local` las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca utilices claves secretas en variables VITE_. `.env.example` contiene solo los nombres, sin valores. Reinicia Vite tras editar el archivo.

`check:backend` comprueba sin imprimir valores si la migración responde y el catálogo es accesible. `npm test` verifica validaciones y renderizado local; no prueba cuentas remotas. Para probar RLS y Storage con dos cuentas confirmadas, consulta las instrucciones de `npm run test:integration` en la guía.

## Estructura

- `src/components/`: navegación, tarjetas y estados vacíos.
- `src/pages/`: catálogo, detalle, Auth, publicación/edición y perfiles.
- `src/hooks/`: sesión, catálogo remoto y favoritos locales.
- `src/lib/`: cliente Supabase, configuración, validaciones y operaciones del marketplace.
- `src/utils/`: rutas, búsqueda, filtros y orden.
- `supabase/migrations/`: tablas, restricciones, triggers, RLS y bucket.
- `scripts/`: pruebas locales, diagnóstico sin credenciales en salida e integración opcional.
- `docs/ETAPA-2.md`: configuración, límites y prueba con dos cuentas.
- `docs/ETAPA-1.md`: informe histórico de la etapa anterior; su persistencia local ya no describe el catálogo actual.

No se añadieron dependencias en esta etapa: el cliente Supabase ya estaba instalado. Las fotografías de portada y su licencia siguen documentadas en [public/images/ATTRIBUTION.md](public/images/ATTRIBUTION.md).
