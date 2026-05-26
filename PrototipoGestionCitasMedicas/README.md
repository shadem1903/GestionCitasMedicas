# Plataforma de Gestión de Citas Médicas
### Proyecto — Sistemas Distribuidos

Plataforma distribuida para el agendamiento de citas médicas, desarrollada con arquitectura de **microservicios**. Cada servicio es autónomo, expone una API REST, tiene su propia base de datos y se comunica con los demás mediante HTTP usando nombres de servicio Docker.

---

## Arquitectura

```
                     [ citas_net — red Docker bridge ]
                                    │
                               ms-frontend
                                 :80 (nginx)
                                    │
                               ms-gateway
                                :8080 (API)
                                    │
         ┌──────────┬───────────────┼──────────────────┬──────────────┐
         ▼          ▼               ▼                  ▼              ▼
    ms-usuarios  ms-auth        ms-citas        ms-disponibilidad  ms-especialidades
      :3001       :3006           :3004               :3003            :3007
         │          │               │                  │                │
         │          │        [CB] ms-usuarios    [CB] ms-usuarios       │
         │          │        [CB] ms-historial   [CB] ms-especialidades │
         │          │               │            [CB] ms-citas          │
         │          │               ▼                  │                │
         │          │          ms-historial ◄──────────┘                │
         │          │            :3005                                   │
         │          │               │                                   │
         ▼          ▼               ▼                  ▼                ▼
    db_usuarios db_usuarios    db_citas         db_disponibilidad  db_especialidades
         └──────────┘               └────────────────────────────────────┘
                                              db_historial
                                                  │
                                    ┌─────────────┴──────────────┐
                                    │     MySQL 8.0 — :3307      │
                                    │  (5 schemas desacoplados)  │
                                    └────────────────────────────┘
```

**[CB]** = Circuit Breaker activo en esa llamada inter-servicio

---

## Servicios

| Servicio | Contenedor | Puerto interno | Base de datos | Descripción |
|---|---|---|---|---|
| `mysql` | `citas_mysql` | `3306` (host: `3307`) | — | Motor MySQL 8.0 con 5 schemas |
| `ms-usuarios` | `ms_usuarios` | `3001` | `db_usuarios` | CRUD de pacientes, médicos y admins |
| `ms-auth` | `ms_auth` | `3006` | `db_usuarios` | Login JWT y verificación de token |
| `ms-especialidades` | `ms_especialidades` | `3007` | `db_especialidades` | Catálogo de especialidades médicas |
| `ms-disponibilidad` | `ms_disponibilidad` | `3003` | `db_disponibilidad` | Horarios, bloques y slots de médicos |
| `ms-citas` | `ms_citas` | `3004` | `db_citas` | Agendamiento y estados de citas |
| `ms-historial` | `ms_historial` | `3005` | `db_historial` | Auditoría de eventos de citas |
| `ms-gateway` | `ms_gateway` | `8080` | — | Proxy inverso, punto único de entrada |
| `ms-frontend` | `ms_frontend` | `80` | — | SPA servida por Nginx |

> Los microservicios **no exponen puertos al host**. Solo ms-gateway (:8080) y ms-frontend (:80) son accesibles desde fuera de la red Docker.

---

## Base de datos desacoplada

Cada microservicio tiene su propio schema dentro del mismo contenedor MySQL. No hay claves foráneas entre schemas; la integridad referencial entre servicios se valida a nivel de aplicación mediante llamadas REST.

| Schema | Tablas | Servicio dueño |
|---|---|---|
| `db_usuarios` | `usuarios` | ms-usuarios, ms-auth |
| `db_especialidades` | `especialidades` | ms-especialidades |
| `db_disponibilidad` | `doctor_schedules`, `doctor_blocks`, `disponibilidad` | ms-disponibilidad |
| `db_citas` | `citas` | ms-citas |
| `db_historial` | `historial_citas` | ms-historial |

**Datos de prueba cargados al inicio:**

| ID | Nombre | Rol | Contraseña |
|---|---|---|---|
| 1 | Ana Torres | paciente | `123456` |
| 2 | Luis Gomez | paciente | `123456` |
| 3 | Dra. Martinez | medico | `123456` |
| 4 | Dr. Hernandez | medico | `123456` |
| 5 | Admin Principal | admin | `123456` |

---

## Circuit Breaker

ms-citas y ms-disponibilidad implementan el patrón Circuit Breaker para todas sus llamadas a otros servicios.

```
Estados:
  CERRADO ──(3 fallas)──► ABIERTO ──(30s)──► SEMI_ABIERTO
     ▲                                              │
     └──────────── llamada exitosa ────────────────┘
```

| Estado | Comportamiento |
|---|---|
| **CERRADO** | Operación normal |
| **ABIERTO** | Bloquea llamadas inmediatamente; loguea segundos restantes para reintento |
| **SEMI_ABIERTO** | Deja pasar una llamada de prueba; si falla vuelve a ABIERTO |

**Degradación graceful:**
- Si ms-historial no responde → la cita se crea igual, solo se omite el registro de auditoría
- Si ms-citas no responde (slots) → los slots se generan sin verificar conflictos de citas
- Si ms-usuarios no responde → las operaciones que requieren validar médico/paciente retornan `422`

El endpoint `/health` de ms-citas y ms-disponibilidad expone el estado actual de cada CB:
```json
{
  "servicio": "ms-citas",
  "estado": "ok",
  "circuit_breakers": {
    "ms-usuarios": "CERRADO",
    "ms-historial": "CERRADO"
  }
}
```

---

## Logs

Todos los servicios emiten logs con formato uniforme:
```
[2026-05-16T17:00:00.000Z] [ms-citas] [INFO]  POST /citas — paciente=1 medico=3 fecha=2026-05-20
[2026-05-16T17:00:00.001Z] [ms-citas] [INFO]  POST /citas — cita creada id=12
[2026-05-16T17:00:00.002Z] [ms-citas] [WARN]  [CB:ms-historial] Falla 1/3: connect ECONNREFUSED
[2026-05-16T17:00:00.003Z] [ms-citas] [ERROR] [CB:ms-historial] ABIERTO — 3 fallas consecutivas
```

Para ver logs en tiempo real:
```bash
docker compose logs -f ms-citas
docker compose logs -f ms-disponibilidad
```

---

## Variables de entorno

> ⚠️ **NUNCA subas el archivo `.env` al repositorio. Contiene credenciales reales.**

El proyecto usa un archivo `.env` para centralizar todas las credenciales y puertos. Docker Compose lo lee automáticamente al levantar los servicios.

### Configuración obligatoria

```bash
# Copia la plantilla y edita los valores
cp .env.example .env
```

### Contenido de `.env.example`

```env
# ── Gestion de Citas Medicas — Variables de entorno ──────────

# ── Base de datos MySQL ───────────────────────────────────────
MYSQL_ROOT_PASSWORD=root123
DB_USER=admin
DB_PASSWORD=admin123

# ── JWT (ms-auth) ─────────────────────────────────────────────
JWT_SECRET=cambia_esto_en_produccion
JWT_EXPIRES=8h
```

| Variable | Descripción | Usado por |
|---|---|---|
| `MYSQL_ROOT_PASSWORD` | Contraseña del usuario root de MySQL | MySQL |
| `DB_USER` | Usuario de la base de datos | Todos los microservicios |
| `DB_PASSWORD` | Contraseña del usuario de DB | Todos los microservicios |
| `JWT_SECRET` | Clave secreta para firmar tokens JWT | ms-auth |
| `JWT_EXPIRES` | Tiempo de expiración del token (ej. `8h`, `1d`) | ms-auth |

> El archivo `.gitignore` ya excluye `.env`. No remover esa línea.

---

## Requisitos previos

- Docker Desktop instalado y en ejecución
- Puertos libres: `80`, `8080`, `3307`

---

## Instalación y ejecución

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd PrototipoGestionCitasMedicas
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con las credenciales reales si es necesario
```

### 3. Primera ejecución

```bash
docker compose up --build
```

Al finalizar verás logs como:
```
[ms-usuarios]       [INFO] Corriendo en puerto 3001
[ms-especialidades] [INFO] Corriendo en puerto 3007
[ms-disponibilidad] [INFO] Corriendo en puerto 3003
[ms-citas]          [INFO] Corriendo en puerto 3004
[ms-historial]      [INFO] Corriendo en puerto 3005
[ms-auth]           [INFO] Corriendo en puerto 3006
```

### 4. Abrir la interfaz web

Navega a **http://localhost** en tu navegador.

Credenciales de prueba: cualquier email de la tabla de datos + contraseña `123456`.

### 5. Detener los servicios

```bash
# Solo detener (conserva los datos):
docker compose down

# Detener y borrar todos los datos (necesario al cambiar init.sql):
docker compose down -v
```

---

## Estructura del proyecto

```
PrototipoGestionCitasMedicas/
├── docker-compose.yml          ← Orquestación de todos los servicios
├── init.sql                    ← 5 schemas + tablas + datos de prueba
├── .env.example                ← Plantilla de variables de entorno
├── .gitignore
│
├── ms-usuarios/                ← CRUD usuarios  (db_usuarios)
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
│
├── ms-auth/                    ← Login JWT       (db_usuarios)
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
│
├── ms-especialidades/          ← CRUD especialidades (db_especialidades)
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
│
├── ms-disponibilidad/          ← Horarios / slots / bloqueos (db_disponibilidad)
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
│
├── ms-citas/                   ← Agendamiento de citas (db_citas)
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
│
├── ms-historial/               ← Auditoría de eventos (db_historial)
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
│
├── ms-gateway/                 ← Proxy inverso :8080
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
│
└── ms-frontend/                ← SPA (nginx :80)
    ├── Dockerfile
    └── public/
        ├── index.html
        ├── login.html
        ├── app.js
        ├── login.js
        ├── style.css
        └── login.css
```

---

## Endpoints

Todos los endpoints son accesibles desde el gateway en `http://localhost:8080/api/...`

### Monitoreo · `/api/status`

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/status` | Estado de todos los microservicios + circuit breakers + contadores |

```bash
curl http://localhost:8080/api/status
```

Respuesta:
```json
{
  "gateway": "ok",
  "sistema": "operativo",
  "circuit_breakers": {
    "disponibilidad→ms-usuarios": "CERRADO",
    "citas→ms-historial": "CERRADO"
  },
  "servicios": {
    "ms-usuarios": {
      "errores": 0,
      "exitosos": 3,
      "health": { "servicio": "ms-usuarios", "estado": "ok", "latencia_ms": 4 }
    },
    "ms-citas": {
      "errores": 0,
      "exitosos": 3,
      "health": { "estado": "ok", "circuit_breakers": { "ms-usuarios": "CERRADO", "ms-historial": "CERRADO" }, "latencia_ms": 5 }
    }
  }
}
```

- `sistema: "degradado"` y HTTP 207 si algún servicio no responde
- `errores` / `exitosos` acumulan desde que el gateway arrancó
- Los circuit breakers de ms-citas y ms-disponibilidad se muestran al nivel raíz

---

### ms-auth · `/api/auth`

| Método | Ruta | Descripción | Body |
|---|---|---|---|
| `GET` | `/health` | Estado del servicio | — |
| `POST` | `/login` | Iniciar sesión, retorna JWT | `{ email, password }` |
| `GET` | `/verify` | Verificar token JWT | Header: `Authorization: Bearer <token>` |

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "martinez@demo.com", "password": "123456"}'
```

---

### ms-usuarios · `/api/usuarios`

| Método | Ruta | Descripción | Body |
|---|---|---|---|
| `GET` | `/health` | Estado del servicio | — |
| `GET` | `/usuarios` | Listar todos los usuarios | — |
| `GET` | `/usuarios/:id` | Obtener usuario por ID | — |
| `POST` | `/usuarios` | Crear usuario | `{ nombre, email, rol }` |
| `PUT` | `/usuarios/:id` | Actualizar usuario | `{ nombre, email, rol }` |
| `DELETE` | `/usuarios/:id` | Desactivar usuario (soft delete) | — |

**Roles válidos:** `paciente` · `medico` · `admin`

```bash
curl http://localhost:8080/api/usuarios/usuarios
curl -X POST http://localhost:8080/api/usuarios/usuarios \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Carlos Ruiz", "email": "carlos@demo.com", "rol": "paciente"}'
```

---

### ms-especialidades · `/api/especialidades`

| Método | Ruta | Descripción | Body |
|---|---|---|---|
| `GET` | `/health` | Estado del servicio | — |
| `GET` | `/especialidades` | Listar especialidades | — |
| `GET` | `/especialidades/:id` | Obtener especialidad | — |
| `POST` | `/especialidades` | Crear especialidad | `{ nombre, descripcion? }` |
| `PUT` | `/especialidades/:id` | Actualizar especialidad | `{ nombre, descripcion? }` |
| `DELETE` | `/especialidades/:id` | Desactivar especialidad | — |

---

### ms-disponibilidad · `/api/disponibilidad`

| Método | Ruta | Descripción | Body / Params |
|---|---|---|---|
| `GET` | `/health` | Estado del servicio + CB | — |
| `GET` | `/doctor-schedules` | Listar horarios semanales | `?medico_id=` |
| `POST` | `/doctor-schedules` | Crear horario semanal | `{ medico_id, dia_semana, hora_inicio, hora_fin }` |
| `DELETE` | `/doctor-schedules/:id` | Eliminar horario | — |
| `GET` | `/doctor-blocks` | Listar bloqueos / ausencias | `?medico_id=&fecha=` |
| `POST` | `/doctor-blocks` | Crear bloqueo | `{ medico_id, fecha, hora_inicio?, hora_fin?, motivo? }` |
| `DELETE` | `/doctor-blocks/:id` | Eliminar bloqueo | — |
| `GET` | `/disponibilidad` | Listar bloques manuales | `?medico_id=&fecha=` |
| `GET` | `/disponibilidad/slots` | Slots disponibles para una fecha | `?medico_id=&fecha=` |
| `GET` | `/disponibilidad/verificar` | Verificar horario puntual | `?medico_id=&fecha=&hora=` |
| `GET` | `/disponibilidad/:id` | Detalle de un bloque | — |
| `POST` | `/disponibilidad` | Registrar bloque manual | `{ medico_id, fecha, hora_inicio, hora_fin, especialidad_id? }` |
| `DELETE` | `/disponibilidad/:id` | Eliminar bloque manual | — |

**`dia_semana`:** 0=Domingo, 1=Lunes, ..., 6=Sábado

```bash
# Horarios semanales del médico 3
curl "http://localhost:8080/api/disponibilidad/doctor-schedules?medico_id=3"

# Slots disponibles
curl "http://localhost:8080/api/disponibilidad/disponibilidad/slots?medico_id=3&fecha=2026-05-19"
```

---

### ms-citas · `/api/citas`

| Método | Ruta | Descripción | Body / Params |
|---|---|---|---|
| `GET` | `/health` | Estado del servicio + CB | — |
| `GET` | `/citas` | Listar citas | `?medico_id=&paciente_id=&fecha=&estado=` |
| `GET` | `/citas/:id` | Detalle de una cita | — |
| `POST` | `/citas` | Agendar cita | `{ paciente_id, medico_id, fecha, hora_inicio, hora_fin, notas? }` |
| `PATCH` | `/citas/:id/cancelar` | Cancelar cita | — |
| `PATCH` | `/citas/:id/confirmar` | Confirmar cita | — |
| `PATCH` | `/citas/:id/completar` | Completar cita | — |

**Estados de cita:** `pendiente` → `confirmada` → `completada` · `cancelada`

```bash
# Agendar cita (hora_inicio y hora_fin en HH:MM, duración fija 30 min)
curl -X POST http://localhost:8080/api/citas/citas \
  -H "Content-Type: application/json" \
  -d '{
    "paciente_id": 1,
    "medico_id": 3,
    "fecha": "2026-05-19",
    "hora_inicio": "09:00",
    "hora_fin": "09:30",
    "notas": "Control de rutina"
  }'

# Filtrar citas de un médico
curl "http://localhost:8080/api/citas/citas?medico_id=3&fecha=2026-05-19"
```

---

### ms-historial · `/api/historial`

| Método | Ruta | Descripción | Params |
|---|---|---|---|
| `GET` | `/health` | Estado del servicio | — |
| `GET` | `/historial` | Listar eventos | `?cita_id=&medico_id=&paciente_id=&estado=&limit=` |
| `GET` | `/historial/cita/:citaId` | Eventos de una cita | — |
| `POST` | `/historial` | Registrar evento (uso interno) | `{ cita_id, estado, accion, ... }` |

```bash
# Ver todos los eventos de la cita 1
curl http://localhost:8080/api/historial/historial/cita/1
```

---

## Flujo de comunicación entre servicios

```
Login
    └─► POST ms-auth/login
            └─► SELECT en db_usuarios (bcrypt + JWT)

POST /citas (agendar cita)
    ├─[CB]─► GET ms-usuarios/usuarios/{paciente_id}   → valida rol = paciente
    ├─[CB]─► GET ms-usuarios/usuarios/{medico_id}     → valida rol = medico
    ├──────► INSERT en db_citas (con nombre denormalizado)
    └─[CB]─► POST ms-historial/historial              → registra evento "creada"

POST /disponibilidad (bloque manual)
    └─[CB]─► GET ms-usuarios/usuarios/{medico_id}     → valida que sea médico

GET /disponibilidad/slots (horarios libres)
    ├──────► SELECT doctor_schedules en db_disponibilidad
    ├──────► SELECT doctor_blocks en db_disponibilidad
    └─[CB]─► GET ms-citas/citas?medico_id=&fecha=&estado=confirmada → excluye ocupados

POST /doctor-schedules y POST /doctor-blocks
    └─[CB]─► GET ms-usuarios/usuarios/{medico_id}     → valida que sea médico
```

---

## Acceso directo a MySQL

```bash
# Conectar al contenedor MySQL
docker exec -it citas_mysql mysql -uadmin -padmin123

# Dentro de MySQL:
SHOW DATABASES;
USE db_citas;
SELECT * FROM citas;
```

---

## Tecnologías

| Componente | Tecnología |
|---|---|
| Backend | Node.js 18 + Express.js 4 |
| Base de datos | MySQL 8.0 (5 schemas desacoplados) |
| Autenticación | bcryptjs + jsonwebtoken |
| Comunicación inter-servicio | HTTP REST con node-fetch + Circuit Breaker |
| Contenerización | Docker + Docker Compose |
| Frontend | HTML5 + CSS3 + JavaScript vanilla (SPA) |
| Servidor frontend | nginx:alpine |

---

## Equipo

Proyecto universitario — Curso de Sistemas Distribuidos
