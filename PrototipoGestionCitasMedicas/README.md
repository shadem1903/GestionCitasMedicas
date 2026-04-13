# Plataforma de Gestión de Citas Médicas
### Proyecto — Sistemas Distribuidos

Plataforma distribuida para el agendamiento de citas médicas, desarrollada con arquitectura de **microservicios**. Cada servicio es autónomo, expone una API REST y se comunica con los demás mediante HTTP usando nombres de servicio Docker.

---

## Arquitectura

```
                        [ citas_net — red Docker bridge ]
                                      │
              ┌───────────────────────┼──────────────────────┐
              │                       │                      │
         ms-frontend             ms-usuarios          ms-especialidades
           :80 (nginx)              :3001                  :3007
                                      ↑                      ↑
                               ┌──────┴──────────────────────┘
                               │               ↑
                        ms-disponibilidad      │
                              :3003 ───────────┘
                               ↑
                          ms-citas
                            :3004
                         ↙         ↘
                  ms-usuarios   ms-disponibilidad
                                        │
                              ┌─────────┴────────┐
                              ▼                  ▼
                           MySQL 8.0  ←  (todos comparten BD)
                            :3306
```

---

## Servicios

| # | Servicio | Contenedor | Puerto | Tecnología | Descripción |
|---|---|---|---|---|---|
| DB | `mysql` | `citas_mysql` | `3306` | MySQL 8.0 | Base de datos compartida |
| MS-1 | `ms-usuarios` | `ms_usuarios` | `3001` | Node.js + Express | Gestión de pacientes, médicos y admins |
| MS-3 | `ms-disponibilidad` | `ms_disponibilidad` | `3003` | Node.js + Express | Bloques de disponibilidad de médicos |
| MS-4 | `ms-citas` | `ms_citas` | `3004` | Node.js + Express | Agendamiento y gestión de citas |
| MS-7 | `ms-especialidades` | `ms_especialidades` | `3007` | Node.js + Express | Catálogo de especialidades médicas |
| FE | `ms-frontend` | `ms_frontend` | `80` | nginx + HTML/CSS/JS | Interfaz web SPA |

---

## Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y en ejecución
- Puertos libres: `80`, `3001`, `3003`, `3004`, `3306`, `3007`

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
# Edita .env si deseas cambiar credenciales (opcional para desarrollo local)
```

### 3. Levantar todos los servicios

```bash
docker compose up --build
```

> La primera vez descarga las imágenes base (~1-2 min). Al finalizar verás:
> ```
> [ms-usuarios]       Corriendo en puerto 3001
> [ms-especialidades] Corriendo en puerto 3007
> [ms-disponibilidad] Corriendo en puerto 3003
> [ms-citas]          Corriendo en puerto 3004
> ```

### 4. Abrir la interfaz web

Navega a **http://localhost** en tu navegador.

### 5. Detener los servicios

```bash
# Solo detener (conserva los datos):
docker compose down

# Detener y borrar todos los datos:
docker compose down -v
```

---

## Estructura del proyecto

```
PrototipoGestionCitasMedicas/
├── docker-compose.yml          ← Orquestación de todos los servicios
├── init.sql                    ← Tablas y datos de prueba (MySQL)
├── .env.example                ← Plantilla de variables de entorno
├── .gitignore
│
├── ms-usuarios/                ← MS-1: Gestión de Usuarios
│   ├── Dockerfile
│   ├── package.json
│   ├── .dockerignore
│   └── index.js
│
├── ms-disponibilidad/          ← MS-3: Disponibilidad Médica
│   ├── Dockerfile
│   ├── package.json
│   ├── .dockerignore
│   └── index.js
│
├── ms-citas/                   ← MS-4: Gestión de Citas
│   ├── Dockerfile
│   ├── package.json
│   ├── .dockerignore
│   └── index.js
│
├── ms-especialidades/          ← MS-7: Especialidades Médicas
│   ├── Dockerfile
│   ├── package.json
│   ├── .dockerignore
│   └── index.js
│
└── ms-frontend/                ← Frontend SPA (nginx)
    ├── Dockerfile
    └── public/
        ├── index.html
        ├── style.css
        └── app.js
```

---

## Descripción de Endpoints

### MS-1 · Usuarios `http://localhost:3001`

| Método | Ruta | Descripción | Body requerido |
|---|---|---|---|
| `GET` | `/health` | Estado del servicio | — |
| `GET` | `/usuarios` | Listar todos los usuarios | — |
| `GET` | `/usuarios/:id` | Obtener usuario por ID | — |
| `POST` | `/usuarios` | Crear nuevo usuario | `{ nombre, email, rol }` |
| `PUT` | `/usuarios/:id` | Actualizar datos del usuario | `{ nombre, email, rol }` |
| `DELETE` | `/usuarios/:id` | Desactivar usuario (soft delete) | — |

**Roles válidos:** `paciente` · `medico` · `admin`

Ejemplo — Crear usuario:
```bash
curl -X POST http://localhost:3001/usuarios \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Carlos Ruiz", "email": "carlos@demo.com", "rol": "paciente"}'
```

---

### MS-7 · Especialidades `http://localhost:3007`

| Método | Ruta | Descripción | Body requerido |
|---|---|---|---|
| `GET` | `/health` | Estado del servicio | — |
| `GET` | `/especialidades` | Listar todas las especialidades | — |
| `GET` | `/especialidades/:id` | Obtener especialidad por ID | — |
| `POST` | `/especialidades` | Crear nueva especialidad | `{ nombre, descripcion? }` |
| `PUT` | `/especialidades/:id` | Actualizar especialidad | `{ nombre, descripcion? }` |
| `DELETE` | `/especialidades/:id` | Desactivar especialidad | — |

Ejemplo — Crear especialidad:
```bash
curl -X POST http://localhost:3007/especialidades \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Neurología", "descripcion": "Enfermedades del sistema nervioso"}'
```

---

### MS-3 · Disponibilidad `http://localhost:3003`

| Método | Ruta | Descripción | Body / Params |
|---|---|---|---|
| `GET` | `/health` | Estado del servicio | — |
| `GET` | `/disponibilidad` | Listar bloques activos | `?medico_id=&fecha=` (opcionales) |
| `GET` | `/disponibilidad/verificar` | Verificar si un médico está disponible en un horario | `?medico_id=&fecha=&hora=` |
| `GET` | `/disponibilidad/:id` | Detalle de un bloque | — |
| `POST` | `/disponibilidad` | Registrar bloque de disponibilidad | `{ medico_id, fecha, hora_inicio, hora_fin, especialidad_id? }` |
| `DELETE` | `/disponibilidad/:id` | Eliminar bloque | — |

> Este servicio valida que el `medico_id` exista en **MS-1** antes de registrar.

Ejemplo — Registrar disponibilidad:
```bash
curl -X POST http://localhost:3003/disponibilidad \
  -H "Content-Type: application/json" \
  -d '{
    "medico_id": 3,
    "especialidad_id": 1,
    "fecha": "2026-04-20",
    "hora_inicio": "08:00",
    "hora_fin": "12:00"
  }'
```

---

### MS-4 · Citas `http://localhost:3004`

| Método | Ruta | Descripción | Body requerido |
|---|---|---|---|
| `GET` | `/health` | Estado del servicio | — |
| `GET` | `/citas` | Listar todas las citas | — |
| `GET` | `/citas/:id` | Detalle de una cita | — |
| `POST` | `/citas` | Agendar nueva cita | `{ paciente_id, medico_id, fecha_hora, notas? }` |
| `PATCH` | `/citas/:id/cancelar` | Cancelar cita programada | — |
| `PATCH` | `/citas/:id/completar` | Marcar cita como completada | — |

> `POST /citas` realiza **3 validaciones REST** antes de insertar:
> 1. Verifica `paciente_id` en MS-1 (debe existir y tener `rol = paciente`)
> 2. Verifica `medico_id` en MS-1 (debe existir y tener `rol = medico`)
> 3. Verifica disponibilidad en MS-3 (el médico debe tener bloque activo en ese horario)

Ejemplo — Agendar cita:
```bash
curl -X POST http://localhost:3004/citas \
  -H "Content-Type: application/json" \
  -d '{
    "paciente_id": 1,
    "medico_id": 3,
    "fecha_hora": "2026-04-20T09:00:00",
    "notas": "Control de rutina"
  }'
```

---

## Base de datos

Las tablas se crean automáticamente desde `init.sql` al primer inicio.

| Tabla | Servicio dueño | Descripción |
|---|---|---|
| `usuarios` | MS-1 | Pacientes, médicos y administradores |
| `especialidades` | MS-7 | Catálogo de especialidades médicas |
| `disponibilidad` | MS-3 | Bloques de horario disponible por médico |
| `citas` | MS-4 | Registro de citas médicas |

**Datos de prueba cargados:**

| ID | Nombre | Rol |
|---|---|---|
| 1 | Ana Torres | paciente |
| 2 | Luis Gómez | paciente |
| 3 | Dra. Martínez | medico |
| 4 | Dr. Hernández | medico |
| 5 | Admin Principal | admin |

Acceso directo a MySQL (opcional):
```bash
docker exec -it citas_mysql mysql -uadmin -padmin123 citas_db
```

---

## Flujo de comunicación entre servicios

```
POST /citas
    │
    ├─[1]─► GET ms-usuarios:3001/usuarios/{paciente_id}   → valida rol = paciente
    ├─[2]─► GET ms-usuarios:3001/usuarios/{medico_id}     → valida rol = medico
    ├─[3]─► GET ms-disponibilidad:3003/disponibilidad/verificar → valida horario libre
    └─[4]─► INSERT en tabla citas (MySQL)

POST /disponibilidad
    │
    ├─[1]─► GET ms-usuarios:3001/usuarios/{medico_id}         → valida que sea médico
    └─[2]─► GET ms-especialidades:3007/especialidades/{id}    → enriquece respuesta
```

---

## Tecnologías utilizadas

| Componente | Tecnología |
|---|---|
| Backend | Node.js 18 + Express.js 4 |
| Base de datos | MySQL 8.0 |
| Comunicación inter-servicio | HTTP REST (node-fetch) |
| Contenerización | Docker + Docker Compose |
| Frontend | HTML5 + CSS3 + JavaScript (Vanilla) |
| Servidor web frontend | nginx:alpine |

---

## Equipo

Proyecto universitario — Curso de Sistemas Distribuidos
