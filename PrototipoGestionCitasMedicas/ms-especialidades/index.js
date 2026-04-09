const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ── Conexión a PostgreSQL usando variables de entorno
const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER     || "admin",
  password: process.env.DB_PASSWORD || "admin123",
  database: process.env.DB_NAME     || "citas_db",
});

const PORT = process.env.PORT || 3007;

// ── GET /health
app.get("/health", (req, res) => {
  res.json({ servicio: "ms-especialidades", estado: "ok", timestamp: new Date() });
});

// ── GET /especialidades — listar todas
app.get("/especialidades", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, nombre, descripcion, activo, creado_en FROM especialidades ORDER BY nombre"
    );
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    res.status(500).json({ error: "Error al consultar especialidades", detalle: err.message });
  }
});

// ── GET /especialidades/:id — buscar por ID
app.get("/especialidades/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, nombre, descripcion, activo FROM especialidades WHERE id = $1",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Especialidad no encontrada" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /especialidades — crear especialidad
app.post("/especialidades", async (req, res) => {
  const { nombre, descripcion } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: "Campo requerido: nombre" });
  }

  try {
    const { rows } = await pool.query(
      "INSERT INTO especialidades (nombre, descripcion) VALUES ($1, $2) RETURNING *",
      [nombre, descripcion || null]
    );
    res.status(201).json({ mensaje: "Especialidad creada", especialidad: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Ya existe una especialidad con ese nombre" });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /especialidades/:id — desactivar especialidad
app.delete("/especialidades/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE especialidades SET activo = FALSE WHERE id = $1",
      [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Especialidad no encontrada" });
    res.json({ mensaje: "Especialidad desactivada correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Inicio
app.listen(PORT, () => {
  console.log(`[ms-especialidades] Corriendo en puerto ${PORT}`);
});
