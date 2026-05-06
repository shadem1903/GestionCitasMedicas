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

const PORT = process.env.PORT || 3001;

// ── GET / — información del servicio
app.get("/", (req, res) => {
  res.json({
    servicio: "ms-usuarios",
    version: "1.0.0",
    endpoints: [
      "GET  /health",
      "GET  /usuarios",
      "GET  /usuarios/:id",
      "POST /usuarios",
      "PUT  /usuarios/:id",
      "DELETE /usuarios/:id",
    ],
  });
});

// ── GET /health
app.get("/health", (req, res) => {
  res.json({ servicio: "ms-usuarios", estado: "ok", timestamp: new Date() });
});

// ── GET /usuarios — listar todos
app.get("/usuarios", async (req, res) => {
  try {
    const [rows] = await pool.execute(
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
    const [rows] = await pool.execute(
      "SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?",
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
    const [result] = await pool.execute(
      "INSERT INTO usuarios (nombre, email, rol) VALUES (?, ?, ?)",
      [nombre, email, rol]
    );
    const [rows] = await pool.execute(
      "SELECT * FROM usuarios WHERE id = ?",
      [result.insertId]
    );
    res.status(201).json({ mensaje: "Usuario creado", usuario: rows[0] });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "El email ya está registrado" });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /usuarios/:id — actualizar datos del usuario
app.put("/usuarios/:id", async (req, res) => {
  const { nombre, email, rol } = req.body;

  if (!nombre || !email || !rol) {
    return res.status(400).json({ error: "Campos requeridos: nombre, email, rol" });
  }
  if (!["paciente", "medico", "admin"].includes(rol)) {
    return res.status(400).json({ error: "Rol inválido. Opciones: paciente, medico, admin" });
  }

  try {
    const [result] = await pool.execute(
      "UPDATE usuarios SET nombre = ?, email = ?, rol = ? WHERE id = ?",
      [nombre, email, rol, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    const [rows] = await pool.execute(
      "SELECT * FROM usuarios WHERE id = ?",
      [req.params.id]
    );
    res.json({ mensaje: "Usuario actualizado", usuario: rows[0] });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "El email ya está en uso por otro usuario" });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /usuarios/:id — desactivar usuario (soft delete)
app.delete("/usuarios/:id", async (req, res) => {
  try {
    const [result] = await pool.execute(
      "UPDATE usuarios SET activo = FALSE WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    res.json({ mensaje: "Usuario desactivado correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Inicio
app.listen(PORT, () => {
  console.log(`[ms-usuarios] Corriendo en puerto ${PORT}`);
});
