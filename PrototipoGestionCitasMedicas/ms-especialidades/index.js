const express = require("express");
const mysql   = require("mysql2/promise");
const cors    = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ── Pool de conexión a MySQL usando variables de entorno
const pool = mysql.createPool({
  host:             process.env.DB_HOST     || "localhost",
  port:             parseInt(process.env.DB_PORT || "3306", 10),
  user:             process.env.DB_USER     || "admin",
  password:         process.env.DB_PASSWORD || "admin123",
  database:         process.env.DB_NAME     || "citas_db",
  waitForConnections: true,
  connectionLimit:  10,
});

const PORT = process.env.PORT || 3007;

// ── GET / — información del servicio
app.get("/", (req, res) => {
  res.json({
    servicio: "ms-especialidades",
    version: "1.0.0",
    endpoints: [
      "GET  /health",
      "GET  /especialidades",
      "GET  /especialidades/:id",
      "POST /especialidades",
      "PUT  /especialidades/:id",
      "DELETE /especialidades/:id",
    ],
  });
});

// ── GET /health
app.get("/health", (req, res) => {
  res.json({ servicio: "ms-especialidades", estado: "ok", timestamp: new Date() });
});

// ── GET /especialidades — listar todas
app.get("/especialidades", async (req, res) => {
  try {
    const [rows] = await pool.execute(
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
    const [rows] = await pool.execute(
      "SELECT id, nombre, descripcion, activo FROM especialidades WHERE id = ?",
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
    const [result] = await pool.execute(
      "INSERT INTO especialidades (nombre, descripcion) VALUES (?, ?)",
      [nombre, descripcion || null]
    );
    const [rows] = await pool.execute(
      "SELECT * FROM especialidades WHERE id = ?",
      [result.insertId]
    );
    res.status(201).json({ mensaje: "Especialidad creada", especialidad: rows[0] });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Ya existe una especialidad con ese nombre" });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /especialidades/:id — actualizar especialidad
app.put("/especialidades/:id", async (req, res) => {
  const { nombre, descripcion } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: "Campo requerido: nombre" });
  }

  try {
    const [result] = await pool.execute(
      "UPDATE especialidades SET nombre = ?, descripcion = ? WHERE id = ?",
      [nombre, descripcion || null, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Especialidad no encontrada" });
    }
    const [rows] = await pool.execute(
      "SELECT * FROM especialidades WHERE id = ?",
      [req.params.id]
    );
    res.json({ mensaje: "Especialidad actualizada", especialidad: rows[0] });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Ya existe una especialidad con ese nombre" });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /especialidades/:id — desactivar especialidad
app.delete("/especialidades/:id", async (req, res) => {
  try {
    const [result] = await pool.execute(
      "UPDATE especialidades SET activo = FALSE WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Especialidad no encontrada" });
    }
    res.json({ mensaje: "Especialidad desactivada correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Inicio
app.listen(PORT, () => {
  console.log(`[ms-especialidades] Corriendo en puerto ${PORT}`);
});
