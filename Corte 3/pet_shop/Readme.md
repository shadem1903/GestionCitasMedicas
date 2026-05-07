# Laboratorio: Sistema que aprende a fallar

## FASE 1
- ¿Qué hace el sistema actualmente?

 Cada vez que llega una petición a /mascotas, el gateway intenta conectarse al backend hasta 3 veces, espera 2 segundos cada intento, imprime el número de intento y al final retorna un error 504. Eso pasa con cada petición nueva — siempre repite los 3 intentos.

![](<Evidencias/Foto 1.png>)

- ¿Se protege o insiste?

Solo insiste — no se protege. El problema es que si el backend está caído y llegan 100 peticiones, el gateway va a intentar conectarse 300 veces en total. No tiene memoria de que ya falló antes, cada petición empieza desde cero.
 
 ## Fase 2
 - ¿Cada servicio debe tener su propio contador de fallos?

 Sí. Si se usara un solo contador para todo, un fallo en el backend le estaría "sumando puntos en contra" al servicio de usuarios también, siendo que usuarios no tiene nada que ver. Cada servicio se porta diferente, entonces cada uno necesita llevar su propio contador.


- ¿El circuito debe abrirse de forma independiente por servicio?

Sí, y es como lo implemente. Si el circuito fuera uno global, en el momento que el backend falle 3 veces, el gateway bloquearía todas las rutas incluyendo /usuarios y usuarios estaba funcionando perfecto. Entonces no sería correcto cerrar todos los servicios porque se dañó una sola sección.


- ¿Qué pasa si falla un servicio pero el otro sigue funcionando?

Con la implementación actual pasa esto:

**Backend caído → circuito_backend = True**

   GET /mascotas        → bloqueado  ✗

   GET /mascotas/<id>   → bloqueado  ✗

**Usuarios funcionando → circuito_usuarios = False**

   GET /usuarios               → responde normal  ✓

   GET /usuarios/<id>/mascotas → responde normal  ✓

   Cada circuito es independiente. El sistema no se cae completo por culpa de una sola pieza — que es justo el punto de tener microservicios.

   ![](<Evidencias/Foto 6.png.png>)


## Fase 3

- ¿Qué significa “half-open”?

Es el estado intermedio del Circuit Breaker. El circuito tiene 3 estados:

**CLOSED  →  todo normal, las peticiones pasan**

**OPEN    →  circuito abierto, bloquea todo**

**HALF-OPEN → "a ver si ya se recuperó..."**

El estado half-open permite el paso de una única solicitud de prueba para verificar si el servicio se ha recuperado, sin restablecer el flujo completo de peticiones hasta confirmar que responde correctamente.

- ¿Cuándo se vuelve a intentar una llamada?

Después de un tiempo de espera configurable — típicamente entre 30 y 60 segundos desde que el circuito se abrió. Una vez transcurrido ese tiempo, el sistema transiciona automáticamente al estado half-open y permite el paso de una petición de prueba para verificar si el servicio se recuperó.

- ¿Qué pasa si el servicio vuelve a fallar?

Si la petición de prueba en half-open falla, el circuito vuelve a abrirse:

**OPEN → (espera 30s) → HALF-OPEN → prueba → falla → OPEN otra vez**

Si la petición de prueba tiene éxito, el circuito se cierra completamente y todo vuelve a la normalidad:

**OPEN → (espera 30s) → HALF-OPEN → prueba → éxito → CLOSED ✓**

## FASE 4
El flujo completo ahora funciona así:

```
Peticiones fallidas (3) → OPEN
        ↓
     Espera 20s
        ↓
  HALF-OPEN → deja pasar una petición de prueba
        ↓                ↓
     Éxito             Falla
    CLOSED ✓      OPEN (reinicia timer)
```

Lo que se agregó:

* TIEMPO_ESPERA = 20 — tiempo configurable en un solo lugar

* tiempo_apertura_backend / tiempo_apertura_usuarios — registran cuándo se abrió cada circuito

* circuito_permite_paso() — función que centraliza la lógica de los 3 estados. Retorna dos valores: si permite el paso y si es una petición de prueba. Así cada ruta sabe cómo reaccionar ante el resultado sin repetir esa lógica

## Fase 5
Probar el sistema en diferentes escenarios:

1. Servicio funcionando

![](<Evidencias/Foto 2.png>)

2. Servicio caído

![](<Evidencias/Foto 3.png>)

3. Circuito abierto

![](<Evidencias/Foto 4.png>)

4. Recuperación del servicio

![](<Evidencias/Foto 5.png>)

**¿Qué hicimos?**

Después de que el circuito quedó abierto, volvimos a encender el backend y esperamos 20 segundos, que es el tiempo que definimos en TIEMPO_ESPERA. Una vez cumplido ese tiempo, el sistema entró automáticamente al estado half-open y dejó pasar una sola petición de prueba hacia el backend.

**¿Qué observamos?**

Que el sistema no requirió reiniciarse ni intervención manual para recuperarse. En los logs se vio:

```
Circuito en half-open, enviando petición de prueba...

Half-open exitoso, circuito de backend cerrado
```

Y respondió con 200 OK y los datos de las mascotas, confirmando que el circuito volvió al estado closed y el sistema retomó operación normal por sí solo.

**Conclusión:** El Circuit Breaker no solo protege el sistema cuando un servicio falla, sino que también sabe cuándo intentar recuperarse sin necesidad de intervención externa esa es la parte más importante del patrón.

## Análisis final
**¿Qué cambió en el comportamiento del sistema?**

Antes de implementar el Circuit Breaker, cada vez que el backend estaba caído el gateway intentaba conectarse sin importar cuántas veces había fallado antes. Eso significaba que cada petición esperaba el timeout completo antes de retornar un error, haciendo el sistema lento y poco eficiente.

Con el Circuit Breaker el sistema ahora tiene memoria. Después de 3 fallos consecutivos deja de intentarlo, responde de inmediato con un error controlado y espera 20 segundos antes de volver a probar. 

**¿Qué decisiones tomaron en la implementación?**

La principal fue tener un Circuit Breaker por servicio en lugar de uno global. Si el backend cae, el circuito de backend se abre pero el de usuarios sigue funcionando con normalidad. Un solo circuito global hubiera bloqueado todo el gateway por un fallo parcial.

También se definió el tiempo de espera en una constante TIEMPO_ESPERA = 20 en lugar de poner el número directo en el código, para que sea fácil de ajustar sin tocar la lógica.

**¿Qué dificultades encontraron?**

La más importante fue el estado half-open. El código de clase dejaba el circuito abierto permanentemente hasta reiniciar el contenedor, lo que no es un Circuit Breaker real. Implementar la transición automática requirió registrar el timestamp de apertura y crear una función separada circuito_permite_paso() que evaluara los tres estados en cada petición, sin repetir esa lógica en cada ruta.
 