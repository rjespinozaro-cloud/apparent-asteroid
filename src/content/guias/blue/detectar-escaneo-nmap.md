---
titulo: Detectar un escaneo de Nmap en los logs
herramienta: nmap
equipo: blue
nivel: basico
acceso: gratis
guiaPareja: red/nmap-basico
fecha: 2026-10-01
---

## Objetivo

Aprenderás a reconocer un escaneo de Nmap en los registros de un laboratorio propio y a aplicar una regla básica de detección.

## 1. Revisar los registros

Trabajaremos con la IP privada `192.168.56.10` como servidor de laboratorio. Busca conexiones repetidas a varios puertos en los registros del servicio:

```text
192.168.56.20 - conexión rechazada en los puertos 21, 22, 80 y 443
```

<aside class="nota nota--azul">
  <h3>Cómo se detecta o se evita</h3>
  <p>Un volumen anómalo de intentos desde una misma IP y hacia muchos puertos es una señal útil para una alerta inicial. Ajusta el umbral con el tráfico normal de tu laboratorio.</p>
</aside>

## 2. Añadir una regla básica

En un sistema de laboratorio, una regla inicial puede buscar varios rechazos desde una misma dirección en una ventana corta:

```text
alerta si ip_origen=192.168.56.20 y rechazos_puerto >= 4 en 60s
```

La regla es deliberadamente sencilla: sirve para observar la señal y después comparar falsos positivos con el comportamiento habitual.
