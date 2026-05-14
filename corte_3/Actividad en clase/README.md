# Sistema de Monitoreo Básico

## Objetivo

Construir un sistema de monitoreo básico para microservicios utilizando Flask, implementando endpoints de verificación de estado (`/health`) para validar disponibilidad, detectar fallos y monitorear el funcionamiento de los servicios.

---

# Funcionalidades Implementadas

El sistema cumple con los siguientes requisitos:

- Crear endpoints `/health`
- Validar disponibilidad de servicios
- Detectar servicios caídos
- Analizar logs
- Medir tiempo de respuesta

---

# Arquitectura del Proyecto

El proyecto está compuesto por 3 servicios:

## 1. Gateway / API Principal

Servicio encargado de:

- Recibir solicitudes del cliente
- Consultar otros microservicios
- Verificar disponibilidad de los servicios
- Centralizar el monitoreo

Endpoints principales:

- `/usuarios`
- `/mascotas`
- `/estado/backend`
- `/estado/usuarios`

---

## 2. Servicio Backend

Servicio encargado de:

- Gestión de mascotas
- Conexión con base de datos MySQL
- Relación entre usuarios y mascotas

Endpoints:

- `/mascotas`
- `/relacion`
- `/health`

---

## 3. Servicio Usuarios

Servicio encargado de devolver información de usuarios.

Endpoints:

- `/usuarios`
- `/health`

---

# Implementación de Health Checks

Cada microservicio implementa un endpoint `/health` para informar si el servicio está funcionando correctamente.

## Health Check del Backend

```python
@app.route("/health")
def health():
    return{
        "status" : "ok",
        "service" : "backend"
    }
```

### Respuesta esperada

```json
{
  "status": "ok",
  "service": "backend"
}
```

---

## Health Check del Servicio Usuarios

```python
@app.route("/health")
def health():
    return{
        "status" : "ok",
        "service" : "usuarios"
    }
```

### Respuesta esperada

```json
{
  "status": "ok",
  "service": "usuarios"
}
```

---

# Validación de Disponibilidad

El Gateway consulta los endpoints `/health` para verificar si los servicios están activos.

## Estado del Backend

```python
@app.route("/estado/backend")
def estado_backend():
    try:
        response = requests.get("http://backend:5000/health", timeout=2)
        return response.json()
    except:
        return jsonify({"status" : "down"}, 503)
```

---

## Estado del Servicio Usuarios

```python
@app.route("/estado/usuarios")
def estado_usuarios():
    try:
        response = requests.get("http://usuarios:5000/health", timeout=2)
        return response.json()
    except:
        return jsonify({"status" : "down"}, 503)
```

---

# Detección de Servicios Caídos

Si un servicio no responde dentro del tiempo establecido, el sistema devuelve:

```json
{
  "status": "down"
}
```

Código HTTP:

```http
503 Service Unavailable
```

Esto permite identificar rápidamente cuando un microservicio está fuera de funcionamiento.

![](<evidencias/estadoBackendOk.png>)
![](<evidencias/estadoBackendDown.png>)
![](<evidencias/estadoUsuariosOk.png>)
![](<evidencias/estadoUsuariosDown.png>)

---

# Medición de Tiempo de Respuesta

El sistema mide el tiempo que tarda un servicio en responder utilizando timestamps antes y después de la petición HTTP.

## Implementación

```python
inicio = time.time()

response = requests.get(url, timeout=2)

fin = time.time()

print(f"[INFO] Tiempo de respuesta: {fin - inicio}", flush=True)
```

---
Para calcular cuanto demora la respuesta del servicio:
1. Se registra el tiempo inicial antes de enviar la petición.
2. Se realiza la solicitud al microservicio.
3. Se registra el tiempo final cuando llega la respuesta.
4. Se calcula la diferencia:

```python
fin - inicio
```

Esto permite conocer cuánto tardó el servicio en responder.

---

# Ejemplo de Log

```bash
[INFO] Tiempo de respuesta: 0.2451
```

---

La medición del tiempo de respuesta permite:

- Detectar servicios lentos
- Monitorear rendimiento
- Identificar posibles fallos
- Analizar estabilidad del sistema
- Mejorar la observabilidad de los microservicios
---
![](<evidencias/tiempoDeRespuesta 1.png>)