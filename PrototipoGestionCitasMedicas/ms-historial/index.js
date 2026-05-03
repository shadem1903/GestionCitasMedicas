const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "admin",
  password: process.env.DB_PASSWORD || "admin123",
  database: process.env.DB_NAME || "citas_db",
  waitForConnections: true,
  connectionLimit: 10,
});

const PORT = process.env.PORT || 3005;

async function ensureSchema() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS historial_citas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cita_id INT NOT NULL,
      paciente_id INT NULL,
      medico_id INT NULL,
      estado VARCHAR(20) NOT NULL,
      accion VARCHAR(30) NOT NULL,
      detalle TEXT NULL,
      fecha DATE NULL,
      hora_inicio TIME NULL,
      hora_fin TIME NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
      INDEX idx_hist_cita (cita_id),
      INDEX idx_hist_estado (estado),
      INDEX idx_hist_creado (creado_en)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

app.get("/", (req, res) => {
  res.json({
    servicio: "ms-historial",
    version: "1.0.0",
    endpoints: [
      "GET  /health",
      "GET  /historial",
      "GET  /historial/cita/:citaId",
      "POST /historial",
    ],
  });
});

app.get("/health", (req, res) => {
  res.json({ servicio: "ms-historial", estado: "ok", timestamp: new Date() });
});

app.get("/historial", async (req, res) => {
  const { cita_id, medico_id, paciente_id, estado, limit = "200" } = req.query;
  const params = [];
  let sql = "SELECT * FROM historial_citas WHERE 1=1";

  if (cita_id) {
    sql += " AND cita_id = ?";
    params.push(cita_id);
  }
  if (medico_id) {
    sql += " AND medico_id = ?";
    params.push(medico_id);
  }
  if (paciente_id) {
    sql += " AND paciente_id = ?";
    params.push(paciente_id);
  }
  if (estado) {
    sql += " AND estado = ?";
    params.push(estado);
  }

  const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 200, 1000));
  sql += ` ORDER BY creado_en DESC LIMIT ${safeLimit}`;

  try {
    const [rows] = await pool.execute(sql, params);
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/historial/cita/:citaId", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM historial_citas WHERE cita_id = ? ORDER BY creado_en DESC",
      [req.params.citaId]
    );
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/historial", async (req, res) => {
  const {
    cita_id,
    paciente_id = null,
    medico_id = null,
    estado,
    accion,
    detalle = null,
    fecha = null,
    hora_inicio = null,
    hora_fin = null,
  } = req.body;

  if (!cita_id || !estado || !accion) {
    return res.status(400).json({
      error: "Campos requeridos: cita_id, estado, accion",
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO historial_citas
       (cita_id, paciente_id, medico_id, estado, accion, detalle, fecha, hora_inicio, hora_fin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cita_id, paciente_id, medico_id, estado, accion, detalle, fecha, hora_inicio, hora_fin]
    );

    const [rows] = await pool.execute(
      "SELECT * FROM historial_citas WHERE id = ?",
      [result.insertId]
    );

    res.status(201).json({ mensaje: "Evento de historial registrado", evento: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[ms-historial] Corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[ms-historial] Error inicializando esquema:", err.message);
    process.exit(1);
  });
