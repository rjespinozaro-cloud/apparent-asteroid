---
titulo: "Nmap básico: descubrir hosts del laboratorio"
herramienta: nmap
equipo: red
nivel: basico
acceso: pago
enlaceCompra: https://example.com/ciberguias/nmap-basico.pdf
guiaPareja: blue/detectar-escaneo-nmap
fecha: 2026-10-01
---

## Adelanto

Esta guía RED completa se entrega en PDF. El adelanto muestra cómo preparar un descubrimiento de hosts en una red privada de laboratorio; el documento incluye el procedimiento completo, interpretación de resultados y su correspondencia defensiva.

## 1. Delimitar el laboratorio

Usa únicamente la red privada `192.168.56.0/24`, creada para tus propias máquinas virtuales. Antes de observarla, confirma qué hosts te pertenecen y conserva los registros para que el equipo BLUE pueda revisar la actividad.

```text
red-lab: 192.168.56.0/24
host de prueba: 192.168.56.20
```

<aside class="nota nota--roja">
  <h3>Qué consigue el atacante</h3>
  <p>Obtiene una primera lista de máquinas activas dentro del laboratorio, sin salir del rango privado autorizado.</p>
</aside>

El PDF continúa con los pasos restantes y sus comprobaciones defensivas.
