# BibliotecaNet 📚
Sistema distribuido de gestión de biblioteca – Taller Docker Compose

## Estructura del proyecto

```
bibliotecanet/
├── docker-compose.yml       ← Orquestación de los 4 servicios
├── .env                     ← Variables de entorno (NO subir a Git)
│
├── frontend/
│   └── html/
│       └── index.html       ← Interfaz web (HTML + CSS + JS)
│
├── backend/
│   ├── server.js            ← API REST (Node.js + Express)
│   └── package.json         ← Dependencias npm
│
└── db/
    └── init.sql             ← Tablas + datos de ejemplo (PostgreSQL)
```

## Servicios

| Servicio     | Imagen            | Puerto  | Descripción                        |
|--------------|-------------------|---------|------------------------------------|
| frontend     | nginx:alpine      | 3000    | Interfaz web del usuario           |
| backend      | node:18-alpine    | 4000    | API REST – lógica de negocio       |
| base_datos   | postgres:15-alpine| 5432    | Persistencia de datos              |
| cache        | redis:7-alpine    | 6379    | Caché de sesiones y búsquedas      |

## Cómo ejecutar

```bash
# 1. Clonar / descomprimir el proyecto
cd bibliotecanet

# 2. Levantar todos los servicios
docker compose up

# 3. Abrir el navegador
http://localhost:3000

# 4. Verificar el API
http://localhost:4000/api/health

# Para detener:
docker compose down

# Para detener y borrar volúmenes (borra los datos de la BD):
docker compose down -v
```

## Endpoints del API

| Método | Ruta                | Descripción                      |
|--------|---------------------|----------------------------------|
| GET    | /api/health         | Estado del sistema               |
| GET    | /api/stats          | Estadísticas generales           |
| GET    | /api/libros         | Listar todos los libros          |
| GET    | /api/libros?q=texto | Buscar libros                    |
| POST   | /api/libros         | Agregar un libro                 |
| GET    | /api/prestamos      | Listar préstamos activos         |
| POST   | /api/prestamos      | Registrar un préstamo            |
| GET    | /api/usuarios       | Listar usuarios                  |

## Posibles errores al iniciar

| Error                              | Causa                              | Solución                              |
|------------------------------------|------------------------------------|---------------------------------------|
| `ECONNREFUSED 5432`                | Backend arrancó antes que la BD    | Esperar – el healthcheck lo reintenta |
| `password authentication failed`  | Variables .env incorrectas         | Revisar el archivo .env               |
| `getaddrinfo ENOTFOUND base_datos` | Servicios en redes distintas       | Verificar que ambos usen biblioteca_net|
| `port is already allocated`        | Puerto ocupado en el host          | Cambiar el puerto en docker-compose.yml|
