const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// ── Conexión a PostgreSQL
const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER     || "admin",
  password: process.env.DB_PASSWORD || "admin123",
  database: process.env.DB_NAME     || "citas_db",
});

const PORT = process.env.PORT || 3001;

// ── Health check 
app.get("/health", (req, res) => {
  res.json({ servicio: "ms-usuarios", estado: "ok", timestamp: new Date() });
});

// ── GET /usuarios — listar todos 
app.get("/usuarios", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, nombre, email, rol, activo, creado_en FROM usuarios ORDER BY id"
    );
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    res.status(500).json({ error: "Error al consultar usuarios", detalle: err.message });
  }
});

// ── GET /usuarios/:id — buscar por ID 
app.get("/usuarios/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = $1",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /usuarios — crear usuario 
app.post("/usuarios", async (req, res) => {
  const { nombre, email, rol } = req.body;

  if (!nombre || !email || !rol) {
    return res.status(400).json({ error: "Campos requeridos: nombre, email, rol" });
  }
  if (!["paciente", "medico", "admin"].includes(rol)) {
    return res.status(400).json({ error: "Rol inválido. Opciones: paciente, medico, admin" });
  }

  try {
    const { rows } = await pool.query(
      "INSERT INTO usuarios (nombre, email, rol) VALUES ($1, $2, $3) RETURNING *",
      [nombre, email, rol]
    );
    res.status(201).json({ mensaje: "Usuario creado", usuario: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "El email ya está registrado" });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /usuarios/:id — desactivar usuario 
app.delete("/usuarios/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE usuarios SET activo = FALSE WHERE id = $1",
      [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json({ mensaje: "Usuario desactivado correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Inicio 
app.listen(PORT, () => {
  console.log(`[ms-usuarios] Corriendo en puerto ${PORT}`);
});
