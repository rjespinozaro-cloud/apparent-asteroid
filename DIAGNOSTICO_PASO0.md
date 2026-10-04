PASO 0 - DIAGNÓSTICO
=====================

1. Archivo de la portada (localización)
----------------------------------------
- Sección: src/pages/index.astro:31-70 (section class="portada")
- Estilos: src/styles/guias-listado.css:7-48 (.portada y elementos relacionados)
- No hay componentes de hero separados (no se encontró *hero*.astro, *portada*.astro)
- No hay imágenes/vídeos de fondo referenciados en CSS para portada (grep background-image en styles no devuelve referencias a portada)
- Logo usado actualmente: public/logo-joanix-guide.svg (referenciado en Base.astro:75, también usado en dist)

2. (a) Ruta/nombre incorrecto o mayúsculas
------------------------------------------
- Logo.png existe en raíz: /var/www/html/apparent-asteroid/logo.png (PNG 1774x887, no en public/)
- En código no se referencia logo.png, solo /logo-joanix-guide.svg
- En public/ hay logo-joanix-guide.svg pero NO logo.png
- No hay imágenes de hero/portada con rutas erróneas detectadas
- Diferencias de mayúsculas: no evidentes

3. (b) CSP (conflictos)
-----------------------
- Astro security.csp en astro.config.mjs:18-44
  - algorithm: SHA-256
  - directives: default-src 'self', img-src 'self' data:, font-src 'self', connect-src 'self', base-uri 'self', form-action 'self', frame-ancestors 'none', object-src 'none', manifest-src 'self', upgrade-insecure-requests
  - scriptDirective: { resources: ["'self'"] }
  - styleDirective: { resources: ["'self'"] }
- Middleware src/middleware.js:100-140
  - En producción: solo añade cabeceras si no existen (no fuerza CSP). En desarrollo (fallback): añade CSP con 'unsafe-inline' para script-src y style-src (líneas ~127-137)
  - También añade X-Frame-Options 'DENY', Referrer-Policy, etc.
- Shiki en build genera warning: "Shiki syntax highlighting uses inline styles that are not compatible with CSP" (astro build salida)
- No hay estilos inline en el código fuente actual (grep style=" no devuelve resultados)

4. (c) Altura 0 o desbordada
---------------------------
- .portada actual: padding-block var(--espacio-xl) var(--espacio-l), sin min-height definido. No es 100vh/100svh. Altura no es 0.
- Base body usa min-height: 100vh (base.css:26). Layout: .site-main tiene padding-block.

5. (d) z-index, position u overlays
-----------------------------------
- .cabecera tiene position: sticky, z-index: 20 (layout.css:23-30)
- No hay elementos con z-index que tapen la portada actual evidentes
- No hay overlays explícitos en portada

6. (e) Errores en build + wrangler dev
--------------------------------------
- npx astro check: 0 errores, 0 warnings, 1 hint (test con variable no usada)
- npx astro build: éxito (con warning de Shiki/CSP)
- wrangler dev: inicia correctamente en puerto 8788 (ya estaba corriendo)
- Estado actual de la app funcional con datos (2 guías publicadas)

7. CAUSA REAL IDENTIFICADA (evidencia)
--------------------------------------
La "portada de pantalla completa que añadí no se ve" probablemente hace referencia a la portada que debe implementarse según PASO 4. En el estado actual NO existe una portada fullscreen/animada con 100svh, logo grande, descriptor "Cybersecurity Knowledge Lab", etc. Lo que hay ahora es una portada editorial (poco alta) con otro contenido.

Evidencias:
- src/pages/index.astro:31-70 - sección .portada actual con texto "Plataforma de conocimiento · RED + BLUE", h1 diferente, botones "Explorar todas las guías"/"Ver por herramienta" (no coinciden con PASO 4)
- src/styles/guias-listado.css:7-48 - .portada sin min-height:100svh, sin fondo animado
- No hay archivos de hero/portada/cover (ni en src ni en public con nombres hero/portada)
- No hay referencias a "Cybersecurity Knowledge Lab", "Aprende seguridad ofensiva y defensiva desde una misma plataforma."

Por tanto, la causa más probable: la portada fullscreen/animada aún NO está implementada (o hay que reemplazar la actual). Los pasos siguientes indican qué implementar exactamente.
