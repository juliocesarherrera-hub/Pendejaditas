# pendejaditas.

Marketplace de gaming y coleccionables en Querétaro, construido sobre React, Vite, Tailwind y Lucide React. Se conserva el diseño oscuro y la portada de PS5.

## Estado funcional documentado

Actualizado el 28 de octubre de 2026. Se distingue entre funciones disponibles, preparación local e instalación remota. El estado se basa en las verificaciones documentadas y las confirmaciones del propietario; esta actualización de textos no repite pruebas remotas ni certifica que la aplicación esté lista para su lanzamiento comercial.

| Función | Estado y alcance |
| --- | --- |
| Autenticación, perfiles, publicaciones y fotografías | Instalados y conectados a Supabase. Publicaciones persistentes; favoritos locales, identificados como tales. |
| Detalle de publicación por ID | Consulta independiente del catálogo, con carga, errores recuperables y respuestas antiguas descartadas. Probada localmente y comprobada manualmente por el propietario. Una fila oculta por RLS no se distingue de una inexistente para evitar revelar datos privados. |
| Chat y citas | Chat privado persistente, no leídos, bloqueos/reportes, lugares públicos sugeridos y citas con aceptación, reprogramación, cancelación e historial. Contactar no compra ni reserva el artículo. Los lugares no tienen seguridad garantizada. |
| Subastas | Pujas reales y atómicas, Realtime, anti-snipe de dos minutos en el último minuto, cierre automático por Cron, ganador provisional, avisos y coordinación por chat/citas. Ganar no acredita un pago. |
| Entrega QR | Migración 006 instalada. QR temporal de 90 segundos, uso único, validación del servidor y doble confirmación. El comprador muestra el QR, el vendedor lo escanea y confirma la entrega; después el comprador confirma la recepción. Registra declaraciones de entrega, no verifica dinero ni prueba por sí solo lo ocurrido físicamente. |
| Reclamaciones y moderación | Migración 007 instalada y función claim-evidence desplegada. Versiones de ambas partes, archivos privados con control de integridad, solicitudes de información, resoluciones, apelaciones y pausas preventivas. Moderación exige nombramiento y MFA; los hashes no demuestran autenticidad ni ausencia de malware. |
| Modalidad de efectivo | Código, pantallas, pruebas locales y migración 008 preparados. **008 no está instalada: la modalidad no está operativa.** Instalarla requiere autorización y mantendrá efectivo desactivado hasta las pruebas y la aprobación posteriores. |
| Pagos digitales y protección financiera | **Deshabilitados.** Sin cobros, billeteras, transferencias, liberación de dinero ni reembolsos automáticos. La investigación y el diseño de Fase 8 no equivalen a una integración financiera operativa. |
| Ofertas negociables y llamadas de voz | No operativas. Una publicación con precio de referencia no habilita envío de ofertas. |
| Expansión geográfica | Base documental aprobada, sin implementar; se retomará después de Fase 8. No se habilitaron territorios nuevos. |

Las migraciones 001–007 ya aplicadas no deben repetirse. La 008 continúa preparada y pendiente de instalación. Los registros anteriores de entrega no se convierten en operaciones en efectivo ni en pagos confirmados.

Guías y evidencia de las etapas instaladas: [publicaciones y perfiles](docs/ETAPA-2.md), [auditoría de Supabase](docs/AUDITORIA-SUPABASE.md), [citas y mapa](docs/ETAPA-3.md), [chat](docs/ETAPA-4.md), [subastas](docs/ETAPA-5-SUBASTAS.md), [entregas QR](docs/ETAPA-6-ENTREGAS.md) y [reclamaciones](docs/ETAPA-7-RECLAMACIONES.md). Las cifras y pendientes de una guía histórica corresponden a su etapa y fecha; este resumen distingue el estado posterior.

Quedan pendientes controles de seguridad previos al lanzamiento, verificaciones físicas de cámara/dispositivos y restauración del respaldo en laboratorio autorizado. No se anuncian como completados por pasar lint o build.

## Ejecutar

```bash
npm run dev
npm run lint
npm test
npm run build
npm run preview
npm run test:sql
```

El frontend requiere en `.env.local` las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca utilices claves secretas en variables VITE_. `.env.example` contiene solo los nombres, sin valores. Reinicia Vite tras editar el archivo.

La [configuración separada de entornos](docs/CONFIGURACION-ENTORNOS.md) mantiene el proyecto remoto actual con HTTPS y prepara un modo `lab` explícito, local y sin heredar sus credenciales. El laboratorio todavía no está instalado ni habilitado. El desarrollo habitual continúa conectado al proyecto remoto; no debe utilizarse como si fuera una base de datos de prueba.

La etapa 4 incorpora chat privado persistente y Realtime, no leídos, bloqueos/reportes y enlaces al intercambio y cita. Migración 004 instalada; `user_blocks` debe permanecer fuera de la publicación Realtime. Instrucciones, resultados de 22 pruebas A/B/C y configuración pendiente de voz en [docs/ETAPA-4.md](docs/ETAPA-4.md). Las llamadas no están habilitadas y su botón lo indica.

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

La corrección de mensajes no instala dependencias ni cambia funcionalidades. Las fotografías de portada y su licencia siguen documentadas en [public/images/ATTRIBUTION.md](public/images/ATTRIBUTION.md).
