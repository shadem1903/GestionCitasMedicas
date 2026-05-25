const express = require("express");
const mysql   = require("mysql2/promise");
const cors    = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const SERVICIO = "ms-especialidades";

function log(nivel, mensaje) {
  console.log(`[${new Date().toISOString()}] [${SERVICIO}] [${nivel}] ${mensaje}`);
}

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || "localhost",
  port:             parseInt(process.env.DB_PORT || "3306", 10),
  user:             process.env.DB_USER     || "admin",
  password:         process.env.DB_PASSWORD || "admin123",
  database:         process.env.DB_NAME     || "db_especialidades",
  waitForConnections: true,
  connectionLimit:  10,
});

const PORT = process.env.PORT || 3007;

app.get("/", (req, res) => {
  res.json({
    servicio: SERVICIO,
    version: "1.0.0",
    endpoints: [
      "GET    /health",
      "GET    /especialidades",
      "GET    /especialidades/:id",
      "POST   /especialidades",
      "PUT    /especialidades/:id",
      "DELETE /especialidades/:id",
    ],
  });
});

app.get("/health", (req, res) => {
  res.json({ servicio: SERVICIO, estado: "ok", timestamp: new Date() });
});

app.get("/especialidades", async (req, res) => {
  log("INFO", "GET /especialidades");
  try {
    const [rows] = await pool.execute(
      "SELECT id, nombre, descripcion, activo, creado_en FROM especialidades ORDER BY nombre"
    );
    log("INFO", `GET /especialidades — ${rows.length} resultado(s)`);
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    log("ERROR", `GET /especialidades — ${err.message}`);
    res.status(500).json({ error: "Error al consultar especialidades", detalle: err.message });
  }
});

app.get("/especialidades/:id", async (req, res) => {
  log("INFO", `GET /especialidades/${req.params.id}`);
  try {
    const [rows] = await pool.execute(
      "SELECT id, nombre, descripcion, activo FROM especialidades WHERE id = ?",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Especialidad no encontrada" });
    res.json(rows[0]);
  } catch (err) {
    log("ERROR", `GET /especialidades/${req.params.id} — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/especialidades", async (req, res) => {
  const { nombre, descripcion } = req.body;
  log("INFO", `POST /especialidades — nombre=${nombre}`);

  if (!nombre) {
    return res.status(400).json({ error: "Campo requerido: nombre" });
  }

  try {
    const [result] = await pool.execute(
      "INSERT INTO especialidades (nombre, descripcion) VALUES (?, ?)",
      [nombre, descripcion || null]
    );
    const [rows] = await pool.execute("SELECT * FROM especialidades WHERE id = ?", [result.insertId]);
    log("INFO", `POST /especialidades — creada id=${result.insertId}`);
    res.status(201).json({ mensaje: "Especialidad creada", especialidad: rows[0] });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      log("WARN", `POST /especialidades — nombre duplicado: ${nombre}`);
      return res.status(409).json({ error: "Ya existe una especialidad con ese nombre" });
    }
    log("ERROR", `POST /especialidades — error DB: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.put("/especialidades/:id", async (req, res) => {
  const { nombre, descripcion } = req.body;
  log("INFO", `PUT /especialidades/${req.params.id}`);

  if (!nombre) {
    return res.status(400).json({ error: "Campo requerido: nombre" });
  }

  try {
    const [result] = await pool.execute(
      "UPDATE especialidades SET nombre = ?, descripcion = ? WHERE id = ?",
      [nombre, descripcion || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Especialidad no encontrada" });
    const [rows] = await pool.execute("SELECT * FROM especialidades WHERE id = ?", [req.params.id]);
    log("INFO", `PUT /especialidades/${req.params.id} — OK`);
    res.json({ mensaje: "Especialidad actualizada", especialidad: rows[0] });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      log("WARN", `PUT /especialidades/${req.params.id} — nombre duplicado: ${nombre}`);
      return res.status(409).json({ error: "Ya existe una especialidad con ese nombre" });
    }
    log("ERROR", `PUT /especialidades/${req.params.id} — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/especialidades/:id", async (req, res) => {
  log("INFO", `DELETE /especialidades/${req.params.id}`);
  try {
    const [result] = await pool.execute(
      "UPDATE especialidades SET activo = FALSE WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Especialidad no encontrada" });
    log("INFO", `DELETE /especialidades/${req.params.id} — OK`);
    res.json({ mensaje: "Especialidad desactivada correctamente" });
  } catch (err) {
    log("ERROR", `DELETE /especialidades/${req.params.id} — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  log("ERROR", `Error no capturado en ${req.method} ${req.path}: ${err.message}`);
  res.status(500).json({ error: "Error interno del servidor" });
});

app.listen(PORT, () => {
  log("INFO", `Corriendo en puerto ${PORT}`);
});
