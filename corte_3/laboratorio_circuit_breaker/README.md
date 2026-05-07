# Laboratorio: Sistema que aprende a fallar

Este laboratorio documenta la implementación de un patrón de diseño **Circuit Breaker** (Cortocircuito) para mejorar la resiliencia en una arquitectura de microservicios.

---

## **FASE 1 – OBSERVAR**

*   **Qué se hizo:** Se apagó el contenedor de mascotas y se enviaron múltiples peticiones desde el gateway mientras se monitoreaban los logs.
*   **Qué se observó:** El sistema inicialmente **insiste**. Por cada petición, el gateway intenta conectar, falla por *timeout* y devuelve un error. Sin código de protección, el gateway desperdicia recursos en cada intento fallido sin importar cuántas veces haya fallado antes.

### **¿Qué hace el sistema actualmente?**
Cada vez se hace una petición al servicio de mascotas, el gateway intenta conectarse **una vez por cada petición** al backend y cada vez que falla imprime en consola el contador con el número del intento. Cuando llega a fallar 3 intentos el sistema activa el circuit breaker y bloquea temporalmente el llamado al servicio y devuelve el error 503. Actualmente no tenemos implementada la lógica para desactivar el circuit breaker, entonces el llamado al servicio de mascotas estará bloqueado hasta que se reinicie el servicio de Gateway según la lógica implementada.

### **¿Se protege o insiste?**
Mi sistema primero **insiste** y luego se **protege**. Durante las primeras tres peticiones, insisto en conectar con el backend para intentar superar un fallo temporal; sin embargo, al agotar esos intentos, activo el *circuit breaker* para protegerme, bloqueando el tráfico de forma permanente para ahorrar recursos y evitar esperas inútiles en un servicio que ya doy por caído.

---

## **FASE 2 – APLICAR (Extensión del Circuit Breaker)**

### **Análisis y decisiones:**

*   **¿Cada servicio debe tener su propio contador de fallos?**
    Sí, cada microservicio debe contar con su propio contador de errores. Debido a que cada servicio opera en procesos o contenedores independientes y posee distintas dependencias, esta separación evita que los fallos de un componente específico bloqueen erróneamente a otros servicios que funcionan de manera correcta.

*   **¿El circuito debe abrirse de forma independiente por servicio?**
    Definitivamente sí, ya que esta es la base de la tolerancia a fallos. Si el circuito de mascotas se abre y se bloquea, el Gateway debe ser lo suficientemente inteligente para permitir que las peticiones a usuarios sigan pasando con normalidad. Abrir el circuito de forma global transformaría la arquitectura de microservicios en un "monolito distribuido", donde el fallo más pequeño en un servicio terminaría por tumbar todo el sistema.

*   **¿Qué pasa si falla un servicio pero el otro sigue funcionando?**
    Cuando un servicio falla mientras otro sigue operando, la funcionalidad específica deja de estar disponible, pero el resto de la aplicación permanece funcional. De esta manera, el sistema entrega una respuesta de error controlada para la sección afectada sin necesidad de que la plataforma completa deje de responder al usuario.

---

## **FASE 3 – INVESTIGAR (Half-Open)**

*   **¿Qué significa “half-open”?**
    Es un estado de prueba o "tanteo". Después de que el circuito ha estado abierto (bloqueado) durante un tiempo determinado, el sistema permite que pase una sola petición para verificar si el servicio ya se recuperó.
*   **¿Cuándo se vuelve a intentar una llamada?**
    La llamada se vuelve a intentar cuando se cumple un tiempo de espera predefinido (timeout de recuperación) configurado en el Gateway.
*   **¿Qué pasa si el servicio vuelve a fallar?**
    Si la petición de prueba en estado Half-Open falla, el circuito vuelve inmediatamente al estado Abierto y el temporizador de espera se reinicia para seguir protegiendo el sistema.

---

## **FASE 4 – IMPLEMENTAR (Recuperación)**

Se implementó la lógica de recuperación mediante una espera controlada y una decisión de cierre o apertura de circuito basada en el éxito de la conexión.

*   **Espera controlada:** El sistema registra el tiempo del último fallo y lo compara con el tiempo actual para decidir si permite un reintento.
*   **Decisión:** Si la conexión tiene éxito en estado Half-Open, el circuito se cierra automáticamente (estado normal). Si vuelve a fallar, el circuito permanece abierto.

---

## **FASE 5 – VALIDAR**

Se probó el sistema bajo los siguientes escenarios:
1.  **Servicio funcionando:** Tráfico fluido con respuestas exitosas (200 OK).
2.  **Servicio caído:** El Gateway detecta los fallos y los registra secuencialmente.
3.  **Circuito abierto:** Al tercer error consecutivo, las peticiones se bloquean instantáneamente.
4.  **Recuperación del servicio:** Tras el tiempo de espera y el reinicio del backend, el sistema restauró la comunicación de forma autónoma.

---

## **3. Análisis final**

*   **¿Qué cambió en el comportamiento del sistema?**
    El sistema pasó a ser autónomo. Antes, el gateway insistía en conectar con un servicio caído sin importar cuántas veces fallara, desperdiciando tiempo y recursos. Ahora, el sistema aprende del error: detecta el fallo, se protege abriendo el circuito para no saturarse y tiene la capacidad de validar si el servicio ya está activo para volver a la normalidad.

*   **¿Qué decisiones tomaron en la implementación?**
    Se decidió independizar los servicios para que cada microservicio tenga su propio contador y su propio circuito. De esta forma, si un servicio, por ejemplo el de mascotas falla, el gateway no interfiere con los llamados al servicio de usuarios si se encuentra activo. También se decidió centralizar todo en una función genérica para que el código sea limpio y fácil de escalar a más servicios que se agreguen a **PET_SHOP**.

*   **¿Qué dificultades encontraron?**
    Lo más complicado fue lograr que el gateway tenga en cuenta cuánto tiempo llevaba el circuito abierto. Manejar los tiempos de espera y asegurar que la transición al estado Half-Open fuera exacta requirió varias pruebas. También al momento de coordinar los servicios de Docker para entender en qué momento exacto el sistema decidía dejar de protegerse y empezar a insistir de nuevo.