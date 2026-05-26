# Taller práctico monitoreo

# Sistema de Pedidos Distribuido

## Nuevo escenario

Sistema distribuido compuesto por los siguientes microservicios:

- pedidos
- inventario
- pagos

---

# Problema

El servicio de pagos presenta fallos constantes, afectando la estabilidad y disponibilidad del sistema.

---

# Objetivo

Implementar mecanismos básicos de monitoreo y observabilidad para detectar fallos, medir disponibilidad y analizar el comportamiento del sistema distribuido.

---

# Arquitectura del sistema

La arquitectura está basada en microservicios utilizando Flask y un API Gateway.

## Componentes

### API Gateway

Responsable de:

- Centralizar solicitudes.
- Redireccionar peticiones.
- Implementar Circuit Breaker.
- Monitorear servicios.
- Medir latencia y errores.

---

### Microservicio de Pedidos

Gestiona información de pedidos.

Endpoint:

```bash
/pedidos
```

---

### Microservicio de Inventario

Gestiona información de inventario.

Endpoint:

```bash
/inventario
```

---

### Microservicio de Pagos

Gestiona información de pagos.

Endpoint:

```bash
/pagos
```

---

# Diagrama de arquitectura

```text
                +------------------+
                |      Cliente     |
                +---------+--------+
                          |
                          v
               +----------+----------+
               |      API Gateway    |
               | Flask + Monitoring  |
               +----+----+----+------+
                    |    |    |
         ------------    |    -------------
        |                |                |
        v                v                v
+---------------+ +---------------+ +---------------+
| Inventario MS | | Pedidos MS    | | Pagos MS      |
+---------------+ +---------------+ +---------------+
```

---

# Monitoreo implementado

El sistema implementa:

- Logs descriptivos.
- Health checks.
- Endpoint centralizado de monitoreo.
- Métricas de latencia.
- Conteo de errores.
- Circuit Breaker.

---

# FASE 1 — Logs

## Objetivo

Implementar logs descriptivos para analizar el comportamiento del sistema.

---

## Implementación

Se agregaron logs en:

- API Gateway.
- Servicios.
- Circuit Breaker.
- Health checks.

---

## Ejemplos de logs

### Solicitud exitosa

```bash
[GATEWAY] Llamando servicio pagos...
[GATEWAY] Servicio pagos respondió correctamente
```

### Error de conexión

```bash
[ERROR] No se pudo conectar con pagos
```

### Timeout

```bash
[ERROR] Timeout en servicio pagos
```

### Circuit Breaker

```bash
[CIRCUIT BREAKER] Circuito de pagos ABIERTO
```

---

## Resultados observados

Los logs permitieron:

- Detectar fallos rápidamente.
- Identificar servicios caídos.
- Analizar tiempos de respuesta.
- Validar apertura del Circuit Breaker.


![](<evidencias/FASE 1/logs.png>)

---

# FASE 2 — Health Checks

## Objetivo

Verificar disponibilidad de los microservicios.

---

## Implementación

Cada servicio expone un endpoint:

```bash
/health
```

El gateway consume:

```bash
/health/inventario
/health/pedidos
/health/pagos
```

---

## Ejemplo de respuesta

```json
{
   "status": "ok",
   "service": "Pagos"
}
```

---

## Resultados observados

Los health checks permitieron:

- Verificar disponibilidad.
- Detectar servicios inactivos.
- Validar conectividad.


![](<evidencias/FASE 2/healthInventarioOk.png>)
![](<evidencias/FASE 2/healthInventarioDown.png>)
![](<evidencias/FASE 2/healthPagosOk.png>)
![](<evidencias/FASE 2/healthPagosDown.png>)
![](<evidencias/FASE 2/healthPedidosOk.png>)
![](<evidencias/FASE 2/healthPedidosDown.png>)
---

# FASE 3 — Monitoreo

## Objetivo

Centralizar el monitoreo del sistema.

---

## Implementación

Se creó el endpoint:

```bash
/monitor
```

Este endpoint consulta todos los servicios y retorna:

- disponibilidad
- errores
- latencia
- estado del circuito

---

## Ejemplo de respuesta

```json
{
  "gateway": "activo",
  "total_servicios": 3,
  "servicios": [
    {
      "servicio": "inventario",
      "disponibilidad": "Disponible",
      "errores": 0,
      "latencia_ms": 10.2,
      "estado_circuito": "CLOSED"
    },
    {
      "servicio": "pedidos",
      "disponibilidad": "Disponible",
      "errores": 1,
      "latencia_ms": 14.8,
      "estado_circuito": "CLOSED"
    },
    {
      "servicio": "pagos",
      "disponibilidad": "No disponible",
      "errores": 4,
      "latencia_ms": 2000.3,
      "estado_circuito": "OPEN"
    }
  ]
}
```

---

## Resultados observados

El endpoint `/monitor` permitió:

- Tener visibilidad global del sistema.
- Centralizar información.
- Consultar estado de todos los servicios.

![](<evidencias/FASE 3/monitoreo.png>)

---

# FASE 4 — Simulación de fallos

## Objetivo

Simular fallos reales apagando el servicio de pagos.

---

## Procedimiento

Se detuvo el microservicio:

```bash
pagos
```

---

# Análisis

## Logs observados

```bash
[ERROR] No se pudo conectar con pagos
```

```bash
[CIRCUIT BREAKER] Circuito de pagos ABIERTO
```

---

## Errores detectados

Después de múltiples fallos:

- aumentó el contador de errores
- el circuito se abrió
- el gateway dejó de enviar tráfico al servicio

---

## Disponibilidad observada

```json
{
   "servicio": "pagos",
   "disponibilidad": "No disponible"
}
```

---

## Resultados observados

La simulación permitió comprobar que:

- el sistema detecta fallos automáticamente
- el gateway evita sobrecarga
- los demás servicios continúan funcionando

![](<evidencias/FASE 4/SimFallos.png>)
![](<evidencias/FASE 4/LogEnFallo.png>)
---

# FASE 5 — Métricas

## Objetivo

Medir rendimiento y estabilidad del sistema.

---

## Métricas implementadas

### Tiempo de respuesta

Calculado mediante:

```python
inicio = time.time()
fin = time.time()
```

---

### Cantidad de errores

Cada servicio mantiene un contador:

```python
"fallos": 0
```

---

# Resultados observados

## Latencia

| Servicio | Latencia promedio |
|---|---|
| inventario | 10 ms |
| pedidos | 15 ms |
| pagos | 2000 ms cuando falla |

---

## Errores

El servicio de pagos acumuló múltiples errores consecutivos.

---

## Resultado general

Las métricas permitieron:

- detectar servicios lentos
- identificar fallos persistentes
- medir disponibilidad
- validar funcionamiento del Circuit Breaker

![](<evidencias/FASE 5/metricas.png>)
![](<evidencias/FASE 5/metricas2.png>)
---

# Conclusiones

El taller permitió implementar monitoreo básico en una arquitectura de microservicios.

Se logró:

- Implementar logs descriptivos.
- Validar disponibilidad mediante health checks.
- Centralizar monitoreo con `/monitor`.
- Simular escenarios reales de fallos.
- Medir latencia y errores.
- Implementar resiliencia mediante Circuit Breaker.

La solución mejora la estabilidad, observabilidad y tolerancia a fallos del sistema distribuido.

