# Arquitectura del Sistema: Gestion de citas medicas

## Problema que resuelve
 ¿Qué problema resuelve?
El agendamiento de citas médicas suele realizarse de forma manual o con sistemas poco eficientes, lo que genera:
Duplicidad y pérdida de citas
Demoras en la atención al paciente
Desorden en la agenda médica
Errores administrativos por manejo manual de información
Este sistema automatiza el registro de pacientes, la asignación de citas, la gestión de disponibilidad médica y el seguimiento de consultas — mejorando la organización y reduciendo los tiempos de espera.

 ¿Quién lo usa?
Actor
Rol en el sistema
Personal Administrativo
Registra pacientes, asigna y gestiona citas
Médicos
Consultan su agenda y controlan sus consultas programadas
Pacientes
Solicitan, consultan y cancelan sus propias citas
Sistemas externos
Servicios de notificación (correo, SMS, push)


 ¿Qué pasaría si no existiera?
Sin este sistema, el proceso volvería a depender de gestión manual, lo que implicaría:
Mayor probabilidad de errores y citas duplicadas
Tiempos de espera más largos para los pacientes
Menor eficiencia del personal administrativo
Pérdida de información médica relevante
Posibles sanciones legales por mal manejo de datos sensibles

## Servicios del sistema
El sistema se divide en **7 servicios independientes**, cada uno con su propia responsabilidad y base de datos.

### MS-1 — Gestión de Usuarios

- **Responsabilidad:** Registro, actualización, consulta y eliminación de pacientes, médicos y personal administrativo.
- **Independencia:** Solo administra datos personales y roles, sin depender de la lógica de citas.
- **BD:** `DB_Usuarios` — PostgreSQL


### MS-2 — Autenticación y Control de Acceso

- **Responsabilidad:** Validación de inicio de sesión, gestión de credenciales y control de permisos por rol (JWT).
- **Independencia:** Servicio transversal consumido por todos los demás; no depende de su lógica interna.
- **BD:** `DB_Auth` — PostgreSQL + Redis (sesiones activas)


### MS-3 — Gestión de Disponibilidad Médica

- **Responsabilidad:** Administración de horarios, turnos y disponibilidad de los médicos por especialidad.
- **Independencia:** Maneja la agenda base; el servicio de citas la consulta pero no la modifica directamente.
- **BD:** `DB_Disponibilidad` — PostgreSQL


### MS-4 — Gestión de Citas Médicas  (núcleo)

- **Responsabilidad:** Programar, modificar, cancelar y consultar citas médicas.
- **Independencia:** Orquesta datos de usuarios y disponibilidad, pero su lógica de negocio es propia.
- **BD:** `DB_Citas` — PostgreSQL con soporte ACID para consistencia transaccional


### MS-5 — Historial de Citas y Atenciones

- **Responsabilidad:** Registro persistente de citas realizadas, su estado y seguimiento clínico.
- **Independencia:** Almacenamiento histórico de solo lectura; recibe eventos de MS-4 por cola de mensajes.
- **BD:** `DB_Historial` — MongoDB

### MS-6 — Servicio de Notificaciones

- **Responsabilidad:** Envío de recordatorios, confirmaciones y cancelaciones vía correo, SMS y push.
- **Independencia:** Recibe eventos de MS-4 mediante cola de mensajes (asíncrono); no interviene en la lógica principal.
- **BD:** `DB_Notificaciones` — MongoDB

### MS-7 — Gestión de Especialidades Médicas

- **Responsabilidad:** Catálogo de especialidades disponibles y su relación con los médicos.
- **Independencia:** Información de referencia consultada por otros servicios; no depende de ellos.
- **BD:** `DB_Especialidades` — PostgreSQL

## Comunicación entre servicios
Los servicios se comunican de dos formas según la naturaleza de la operación:

| Tipo | Cuándo se usa | Tecnología |
|---|---|---|
| **Sincrónico** (REST) | Cuando el resultado es inmediato y necesario para continuar | HTTP / REST API |
| **Asíncrono** (cola) | Cuando la operación puede procesarse después sin bloquear | RabbitMQ / Kafka |

### Flujo de dependencias

| Servicio solicitante | Servicio proveedor | Dato / mecanismo |
|---|---|---|
| MS-4 Citas | MS-1 Usuarios | Validar datos de paciente y médico — *REST* |
| MS-4 Citas | MS-3 Disponibilidad | Verificar horarios libres — *REST* |
| MS-4 Citas | MS-7 Especialidades | Catálogo de especialidades — *REST* |
| MS-2 Autenticación | MS-1 Usuarios | Credenciales y permisos por rol — *REST* |
| MS-6 Notificaciones | MS-4 Citas | Eventos de confirmación / cancelación — *Cola (async)* |
| MS-5 Historial | MS-4 Citas | Registro de citas completadas — *Cola (async)* |

### API Gateway

Todos los microservicios se exponen a través de un **API Gateway centralizado**, punto único de entrada para los clientes. Sus responsabilidades:

- Enrutamiento de peticiones al microservicio correspondiente
- Validación del token JWT antes de redirigir la solicitud
- Rate limiting y control de tráfico
- Composición de respuestas cuando se requieren datos de múltiples servicios

---

## Tipo de arquitectura

### Arquitectura Híbrida: Microservicios + Capas

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTES                                 │
│              Web App  ·  App Móvil                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                      API GATEWAY                                │
│         Enrutamiento · Autenticación · Rate Limiting            │
└───┬─────────┬──────────┬──────────┬──────────┬─────────────────┘
    │         │          │          │          │
  MS-1      MS-2       MS-3       MS-4       MS-7
Usuarios   Auth    Disponib.   Citas   Especialidades
    │         │          │       │  │
    └─────────┘          └───────┘  │
                                    │ (eventos async)
                               ┌────▼──────────┐
                               │  Cola mensajes │
                               │  RabbitMQ/Kafka│
                               └────┬──────┬───┘
                                    │      │
                                  MS-5    MS-6
                                Historial  Notif.
```

### Estructura interna de cada microservicio (Arquitectura en Capas)

```
┌─────────────────────────────┐
│     Capa de Presentación    │  ← API REST (endpoints, validación de entrada)
├─────────────────────────────┤
│   Capa de Lógica de Negocio │  ← Reglas, orquestación, validaciones
├─────────────────────────────┤
│    Capa de Acceso a Datos   │  ← Repositorios, ORM, conexión a BD propia
└─────────────────────────────┘
```

### Justificación

| Característica | Beneficio |
|---|---|
| **Microservicios** | Escalar solo los servicios más demandados (p. ej. MS-4 en horas pico) |
| **Arquitectura en capas interna** | Código organizado, fácil de mantener y testear |
| **BD por servicio** | Sin dependencias directas entre servicios; motor óptimo para cada caso |
| **Cola de mensajes** | Notificaciones e historial no bloquean el agendamiento |
| **API Gateway** | Seguridad centralizada y punto único de control |
---

## Base de datos
### Estrategia: una base de datos por microservicio

| Microservicio | Base de datos | Motor | Justificación |
|---|---|---|---|
| MS-1 Usuarios | `DB_Usuarios` | PostgreSQL | Datos relacionales con integridad referencial |
| MS-2 Auth | `DB_Auth` + Cache | PostgreSQL + Redis | Consultas rápidas de sesión y tokens |
| MS-3 Disponibilidad | `DB_Disponibilidad` | PostgreSQL | Horarios estructurados y consultas complejas |
| MS-4 Citas | `DB_Citas` | PostgreSQL (ACID) | Consistencia transaccional crítica |
| MS-5 Historial | `DB_Historial` | MongoDB | Documentos flexibles y consultas históricas |
| MS-6 Notificaciones | `DB_Notificaciones` | MongoDB | Registros de envío con esquema variable |
| MS-7 Especialidades | `DB_Especialidades` | PostgreSQL | Catálogo relacional estable |

### Plan de resiliencia de datos

- Backups automáticos diarios + incrementales por hora
- Replicación activa en `DB_Citas` y `DB_Usuarios` (datos más críticos)
- Plan de recuperación ante desastres documentado — **RTO < 2h · RPO < 1h**

---


## Usuarios del sistema
## Roles y permisos

Cada usuario tiene permisos específicos gestionados por MS-2 mediante tokens JWT.

| Rol | Acciones permitidas |
|---|---|
| **Administrador** | Gestión total: usuarios, configuración, reportes y monitoreo |
| **Personal Administrativo** | Registrar pacientes, asignar y gestionar citas en nombre del paciente |
| **Médico** | Consultar agenda propia, aceptar o rechazar citas asignadas |
| **Paciente** | Solicitar, consultar y cancelar sus propias citas |

> El API Gateway valida el token JWT en cada petición y restringe el acceso a los endpoints permitidos para cada rol. Ningún usuario puede ejecutar operaciones fuera de su alcance.

---

## Riesgos y fallas posibles
### Escenarios de fallo y mitigación

#### Fallo del servicio de citas (MS-4)
- **Impacto:** Pacientes no pueden confirmar citas; riesgo de inconsistencias.
- **Solución:** Reintentos automáticos con idempotencia + notificaciones al usuario y administrador + registro persistente para auditoría.
- **Patrón:** `Circuit Breaker` + `Retry` con backoff exponencial.

#### Fallo de base de datos
- **Impacto:** Sin acceso a citas, agendas y datos de usuarios.
- **Solución:** Reintentos de conexión, replicación con failover automático, backups periódicos y alertas automáticas.
- **Patrón:** `Read Replica` + failover automático.

#### Fallo del servidor principal
- **Impacto:** Sistema completo inaccesible.
- **Solución:** Alta disponibilidad con servidores redundantes, balanceo de carga, reintentos desde el cliente y notificaciones al equipo técnico.
- **Patrón:** `Active-Active` con Load Balancer (Nginx / AWS ALB).

#### Fallo del servicio de notificaciones (MS-6)
- **Impacto:** Ausencias de pacientes por falta de recordatorios.
- **Solución:** Los eventos quedan persistidos en la cola (RabbitMQ/Kafka) y se reintentan al recuperarse el servicio. Entrega garantizada.
- **Patrón:** `Message Queue` + `Dead Letter Queue` para mensajes fallidos.

### Medidas transversales

-  **Balanceo de carga** entre instancias de cada microservicio
-  **Autenticación y autorización por roles** en todos los endpoints
-  **Monitoreo continuo** con alertas en tiempo real (Prometheus + Grafana)
-  **Reintentos con idempotencia** en procesos críticos
-  **Notificaciones automáticas** al equipo técnico y usuarios ante fallos críticos
-  **Política de backups** y plan de recuperación ante desastres probado periódicamente

---








