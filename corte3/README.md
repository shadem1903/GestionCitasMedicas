# Fase 1 – Observar y Analizar

## ¿Qué hace el sistema actualmente?

El sistema funciona como un API Gateway que envía peticiones a los microservicios.

Si un servicio responde correctamente, devuelve los datos.
Si falla (caída, timeout o error), el gateway:
Captura la excepción
Incrementa un contador de fallos
Retorna HTTP 503 (Servicio no disponible)



---

## ¿Se protege o insiste?

El sistema primero intenta comunicarse, pero luego se protege.

Cuando se alcanzan 3 fallos consecutivos:

Se activa el Circuit Breaker
El estado pasa a OPEN (circuito_abierto = True)
Se bloquean nuevas peticiones al servicio

Esto evita sobrecarga y fallos en cascada.
---

# Fase 2 - Preguntas de Análisis y Decisiones

## ¿Cada servicio debe tener su propio contador de fallos?

Sí. Cada microservicio puede fallar de forma independiente, por lo que necesita su propio contador.

fallos_mascotas
fallos_usuarios

Esto permite detectar fallos sin afectar a otros servicios que siguen funcionando.

<img width="1576" height="894" alt="fase2" src="https://github.com/user-attachments/assets/7db36621-33c3-41ff-b08c-0c956df4cba0" />

```

---

## ¿El circuito debe abrirse de forma independiente por servicio?

Sí. El Circuit Breaker debe ser independiente por servicio para aislar errores.

circuito_abierto_mascotas = True

Así, si un servicio falla, los demás continúan operando normalmente.
---

## ¿Qué pasa si falla un servicio pero el otro sigue funcionando?

El sistema responde de forma parcial.

Si un servicio falla, el gateway:

Devuelve los datos del servicio disponible
Indica cuál servicio falló

Ejemplo:

{
  "data": {
    "mascotas": [
      {"id": 1, "nombre": "Firulais"}
    ]
  },
  "errores": {
    "usuarios": "Bloqueado"
  }
}

Esto permite mantener el sistema funcionando y mejora la tolerancia a fallos.
---

# Fase 3 – Investigar (Half-Open)

Es un estado intermedio del Circuit Breaker.

Después de que el circuito se abre por fallos, el sistema espera un tiempo y luego hace una petición de prueba.

 Si el servicio responde → el circuito se cierra
 Si falla → el circuito se abre nuevamente

Permite verificar si el servicio ya se recuperó sin saturarlo.
---

## ¿Cuándo se vuelve a intentar una llamada?

La llamada se vuelve a intentar después de que pasa un tiempo de bloqueo configurado por el desarrollador.

Después de un tiempo de bloqueo configurado:

tiempo_bloqueo_usuarios = 10

Cuando se cumple ese tiempo:

Se realiza una petición de prueba
El circuito pasa a Half-Open
Se verifica si el servicio se recuperó
if time.time() - ultimo_fallo_usuarios > tiempo_bloqueo_usuarios:
```

---

## ¿Qué pasa si el servicio vuelve a fallar?

Si falla en estado Half-Open:

El circuito se abre nuevamente
Se bloquean las peticiones
Se reinicia el tiempo de espera
circuito_abierto_usuarios = True

Evita seguir enviando solicitudes a un servicio inestable.
---

# 5 evidencias

<img width="1359" height="937" alt="fase4" src="https://github.com/user-attachments/assets/7d7c82f4-3398-422d-b26a-6bd0156a0fb6" />

<img width="424" height="326" alt="fase5" src="https://github.com/user-attachments/assets/46e78407-97aa-41f0-81fb-1a69a9f110ce" />

<img width="832" height="456" alt="fase5 1" src="https://github.com/user-attachments/assets/c196bc85-9e6e-46d6-a79a-f5a94c8bbd2a" />
 <img width="438" height="419" alt="fase5 2" src="https://github.com/user-attachments/assets/ec0c06df-5e0b-41c9-9a0e-dc7a59e9c295" />


---

# 3. Análisis Final
El sistema ahora es más tolerante a fallos gracias al Circuit Breaker.

Detecta fallos automáticamente
Bloquea servicios inestables
Evita errores repetitivos al usuario
Intenta recuperarse con estado Half-Open
Se restablece automáticamente cuando el servicio vuelve

 Resultado: mayor estabilidad y resiliencia.


---

## ¿Qué decisiones tomaron en la implementación?

Circuit Breaker independiente por servicio:
usuarios
mascotas
Límite de fallos: 3 intentos
Tiempo de bloqueo antes de reintentar
Uso del estado Half-Open
Implementación de timeouts en peticiones HTTP
Manejo de errores con try/except

 Permite un sistema más estable y controlado frente a fallos.

---

## ¿Qué dificultades encontraron?

Timeouts al simular fallos
Comprensión del estado Half-Open
Problemas de sincronización en Docker
Errores de conexión al iniciar servicios
Diferenciar fallos del servicio vs Circuit Breaker

 Estas dificultades ayudaron a entender mejor la tolerancia a fallos en sistemas distribuidos.