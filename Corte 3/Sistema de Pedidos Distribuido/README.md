# Laboratorio: Sistema de Pedidos Distribuido

## FASE 1 — Logs

Los logs permiten observar en tiempo real lo que ocurre dentro de cada servicio. Cada servicio imprime por consola un mensaje cada vez que recibe una petición, indicando qué operación se ejecutó, con qué datos y cuánto tardó en responder.

```
[PEDIDOS]    nuevo pedido producto_id=1 cantidad=2
[INVENTARIO] verificar id=1 cantidad=2 stock=10 disponible=True - tiempo: 0.0012s
[PAGOS]      pago FALLIDO pedido=temporal monto=2400.0 - tiempo: 0.3241s
[PEDIDOS]    pago rechazado producto_id=1 total=2400.0
```

![Foto 1](Evidencias/Foto%201.png)

---

## FASE 2 — Health Checks

Los Health Checks permiten saber si un servicio está vivo y funcionando correctamente. Cada servicio expone un endpoint `GET /health` que devuelve su estado actual.

```json
{ "status": "ok", "service": "inventario", "almacenamiento": "ok" }
```

![Foto 2](Evidencias/Foto%202.png)
![Foto 3](Evidencias/Foto%203.png)
![Foto 4](Evidencias/Foto%204.png)
![Foto 5](Evidencias/Foto%205.png)

---

## FASE 3 — Monitoreo

El monitoreo se implementó en el gateway a través del endpoint `GET /monitoreo`. Este endpoint consulta el estado de los tres servicios al mismo tiempo y devuelve un resumen completo del sistema.

Cuando se llama al endpoint, el gateway ejecuta esto en los logs:

```
[GATEWAY] iniciando monitoreo de servicios
[GATEWAY] llamando a pedidos...
[GATEWAY] pedidos responde OK - 12.3ms
[GATEWAY] llamando a inventario...
[GATEWAY] inventario responde OK - 8.7ms
[GATEWAY] llamando a pagos...
[GATEWAY] pagos no responde - caido
[GATEWAY] monitoreo completado - tiempo: 2.0214s
```

![Foto 6](Evidencias/Foto%206.png)

---

## FASE 4 — Simulación de fallos

Al intentar crear un pedido con el servicio de pagos apagado, los logs muestran exactamente en qué punto falla el sistema y cuántas veces:

```
[GATEWAY] enviando pedido al servicio pedidos...
[PEDIDOS]  ERROR: servicio de pagos caido - sin respuesta
[GATEWAY]  fallo en pagos #1 - tiempo: 3.0012s
[GATEWAY]  fallo en pagos #2 - tiempo: 3.0009s
[GATEWAY]  fallo en pagos #3 - tiempo: 3.0011s
[GATEWAY]  circuit breaker ABIERTO - demasiados fallos en pagos
```

![Foto 7](Evidencias/Foto%207.png)
![Foto 8](Evidencias/Foto%208.png)

---

## FASE 5 — Métricas

Las métricas se pueden ver en `http://localhost:5000/monitoreo`. El gateway lleva la cuenta de errores, exitosos y latencia de cada servicio en tiempo real.

### Tiempos de respuesta

Cada vez que el gateway llama a un servicio registra cuánto tardó en responder. Esto se ve en los logs:

```
[GATEWAY] llamando a pedidos...
[GATEWAY] pedidos responde OK - 12.3ms
[GATEWAY] llamando a inventario...
[GATEWAY] inventario responde OK - 8.7ms
[GATEWAY] llamando a pagos...
[GATEWAY] pagos no responde - caido
```

### Cantidad de errores

El gateway cuenta cada petición clasificándola como exitosa o fallida:

```json
{
  "pedidos":    { "exitosos": 1, "errores": 3 },
  "inventario": { "exitosos": 4, "errores": 0 },
  "pagos":      { "exitosos": 0, "errores": 3 }
}
```

![Foto 9](Evidencias/Foto%209.png)
![Foto 10](Evidencias/Foto%2010.png)
![Foto 11](Evidencias/Foto%2011.png)
