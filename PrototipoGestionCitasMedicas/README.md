# Prototipo Técnico — Plataforma de Gestión de Citas Médicas

Prototipo inicial con **2 microservicios** corriendo en Docker, comunicados entre sí mediante REST y compartiendo una base de datos PostgreSQL.

---

## Servicios incluidos

| Servicio | Puerto | Descripción |
|---|---|---|
| `ms-usuarios` | `3001` | MS-1 — Gestión de pacientes y médicos |
| `ms-citas` | `3004` | MS-4 — Agendamiento de citas (consulta ms-usuarios antes de registrar) |
| `postgres` | `5432` | Base de datos compartida (solo para desarrollo) |

---

## Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo
- No tener nada ocupando los puertos `3001`, `3004` o `5432`

---

## Cómo ejecutarlo

### 1. Clonar o descomprimir el proyecto

```bash
cd prototipo
```

### 2. Levantar todos los servicios

```bash
docker-compose up --build
```

> La primera vez tarda ~1-2 minutos mientras descarga las imágenes y construye los contenedores.

Deberías ver en la consola:

```
[ms-usuarios] Corriendo en puerto 3001
[ms-citas]    Corriendo en puerto 3004
[ms-citas]    Conectado a ms-usuarios en http://ms-usuarios:3001
```

### 3. Verificar que todo esté funcionando

Abre otra terminal y ejecuta:

```bash
curl http://localhost:3001/health
curl http://localhost:3004/health
```

Respuesta esperada:
```json
{ "servicio": "ms-usuarios", "estado": "ok", "timestamp": "..." }
{ "servicio": "ms-citas",    "estado": "ok", "timestamp": "..." }
```

### 4. Detener los servicios

```bash
docker-compose down
```

Para borrar también los datos de la base de datos:

```bash
docker-compose down -v
```

---

## Pruebas rápidas con curl

### MS-1 — Gestión de Usuarios

**Listar usuarios** (ya vienen 4 de prueba cargados):
```bash
curl http://localhost:3001/usuarios
```

**Crear un nuevo usuario:**
```bash
curl -X POST http://localhost:3001/usuarios \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Carlos Ruiz", "email": "carlos@demo.com", "rol": "paciente"}'
```

**Buscar usuario por ID:**
```bash
curl http://localhost:3001/usuarios/1
```

---

### MS-4 — Gestión de Citas

**Listar citas:**
```bash
curl http://localhost:3004/citas
```

**Agendar una cita** (ms-citas valida los IDs consultando ms-usuarios):
```bash
curl -X POST http://localhost:3004/citas \
  -H "Content-Type: application/json" \
  -d '{
    "paciente_id": 1,
    "medico_id": 3,
    "fecha_hora": "2026-04-15 10:00:00",
    "notas": "Control de rutina"
  }'
```

**Cancelar una cita:**
```bash
curl -X PATCH http://localhost:3004/citas/1/cancelar
```

---

## Comunicación entre servicios

Cuando se agenda una cita, `ms-citas` realiza **2 llamadas REST síncronas** a `ms-usuarios` antes de registrar:

```
Cliente → POST /citas
            │
            ├─→ GET ms-usuarios/usuarios/{paciente_id}  ← valida que exista y sea paciente
            ├─→ GET ms-usuarios/usuarios/{medico_id}    ← valida que exista y sea médico
            │
            └─→ INSERT en DB  (solo si ambas validaciones pasan)
```

Si `ms-usuarios` no responde, `ms-citas` rechaza la operación con error `422`.

---


```
prototipo/
├── docker-compose.yml       ← orquestación de servicios
├── init.sql                 ← tablas y datos de prueba
├── ms-usuarios/
│   ├── Dockerfile
│   ├── package.json
│   └── index.js             ← CRUD de usuarios
└── ms-citas/
    ├── Dockerfile
    ├── package.json
    └── index.js             ← agendamiento + validación REST
```

---

## 🗄️ Base de datos

Las tablas se crean automáticamente al levantar el stack por primera vez (`init.sql`).

**Usuarios de prueba cargados:**

| ID | Nombre | Rol |
|---|---|---|
| 1 | Ana Torres | paciente |
| 2 | Luis Gómez | paciente |
| 3 | Dra. Martínez | medico |
| 4 | Dr. Hernández | medico |

**Conexión directa** (opcional, para explorar la BD):
```bash
docker exec -it citas_postgres psql -U admin -d citas_db
```

---

## Nota

Este prototipo usa **una sola base de datos compartida** para simplificar el entorno de desarrollo. 
