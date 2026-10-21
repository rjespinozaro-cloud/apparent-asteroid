# Índice de la documentación

Todo lo que hay escrito sobre JOANIX, y para qué sirve cada cosa.

## Empezar por aquí

| Documento | Contenido |
|---|---|
| [../README.md](../README.md) | Qué es el proyecto, cómo se arranca, comandos, estructura y límites conocidos |
| [REDACTAR-GUIAS.md](REDACTAR-GUIAS.md) | **Cómo se escribe y se publica una guía**: campos, reglas, Markdown, corte de la vista previa, publicación y tienda |
| [../AGENTS.md](../AGENTS.md) | Reglas del proyecto para quien trabaje en el repositorio (idéntico a `CLAUDE.md`) |
| [../README-PUBLICAR.md](../README-PUBLICAR.md) | Subir a `main`, publicar en `gh-pages` y revertir |

## Sistema

| Documento | Contenido |
|---|---|
| [ARQUITECTURA-JOANIX.md](ARQUITECTURA-JOANIX.md) | Arquitectura: rutas, datos, autenticación, permisos, despliegue |
| [arquitectura-ia.md](arquitectura-ia.md) | El asistente IA: proveedores, límites por minuto, cifrado de la clave y consumo |
| [AUDITORIA-UI-SISTEMA.md](AUDITORIA-UI-SISTEMA.md) | Marca, huecos de CSS, deuda de interfaz y estado del flujo de pago |
| [AUDITORIA-PLATAFORMA-TIENDA-2026-10-20.md](AUDITORIA-PLATAFORMA-TIENDA-2026-10-20.md) | Auditoría de plataforma, panel y tienda: hallazgos priorizados, plan por bloques y módulos pendientes |
| [CI-PROPUESTA.md](CI-PROPUESTA.md) | Propuesta de integración continua |

## Bloque 0 (tienda apagada y base de datos al día)

| Documento | Contenido |
|---|---|
| [BLOQUE-0-PASO-1-VERIFICACION-PRODUCCION.md](BLOQUE-0-PASO-1-VERIFICACION-PRODUCCION.md) | Estado real del fix de permisos en producción y receta del parche mínimo (`hotfix-editor`) |
| [BLOQUE-0-PASO-3-MIGRACION-REMOTA.md](BLOQUE-0-PASO-3-MIGRACION-REMOTA.md) | Migraciones 0006-0008: qué hacen, ensayos en local y comandos de respaldo, migración, verificación y rollback |
| [BLOQUE-0-PASO-4-MODELO-COMPRADOR.md](BLOQUE-0-PASO-4-MODELO-COMPRADOR.md) | Diseño del modelo de comprador: tabla `cuentas`, céntimos enteros e historial de ventas |

## Informes de trabajo

| Documento | Contenido |
|---|---|
| [informe-qa-post-portal.md](informe-qa-post-portal.md) | QA del portal: inventario de salidas del cuerpo, mapa de rutas y hallazgos |
| [informe-rutas-camino.md](informe-rutas-camino.md) | El camino de leyendas: temario, nodos y cómo se activan |
| [informe-inicio-carrusel.md](informe-inicio-carrusel.md) | El carrusel de la portada |
| [PUBLICAR-PREVIEW.md](PUBLICAR-PREVIEW.md) | Publicar la vista previa estática |

## Material de origen

- `Árbol de contenido — JOANIX GUIDES (RED BLUE).docx`: el guion de contenido
  original de las guías. No se edita desde el repositorio.

## Regla de oro

Si un documento y el código no coinciden, **manda el código**: los
documentos describen el estado en la fecha en que se escribieron, y el
`git log` cuenta la verdad.
