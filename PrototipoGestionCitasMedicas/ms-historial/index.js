const express = require("express");
const mysql   = require("mysql2/promise");
const cors    = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const SERVICIO = "ms-historial";

function log(nivel, mensaje) {
  console.log(`[${new Date().toISOString()}] [${SERVICIO}] [${nivel}] ${mensaje}`);
}

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || "localhost",
  port:             parseInt(process.env.DB_PORT || "3306", 10),
  user:             process.env.DB_USER     || "admin",
  password:         process.env.DB_PASSWORD || "admin123",
  database:         process.env.DB_NAME     || "db_historial",
  waitForConnections: true,
  connectionLimit:  10,
});

const PORT = process.env.PORT || 3005;

// ── Verificación de DB al arrancar ───────────────────────────
async function verificarDB(reintentos = 10, espera = 2000) {
  for (let intento = 1; intento <= reintentos; intento++) {
    try {
      await pool.execute("SELECT 1");
      log("INFO", `Conexion a DB establecida (intento ${intento}/${reintentos})`);
      return;
    } catch (err) {
      log("WARN", `DB no disponible, intento ${intento}/${reintentos}: ${err.message}`);
      if (intento === reintentos) {
        log("ERROR", "No se pudo conectar a la DB tras todos los intentos — abortando");
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, espera));
    }
  }
}

app.get("/", (req, res) => {
  res.json({
    servicio: SERVICIO,
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
  res.json({ servicio: SERVICIO, estado: "ok", timestamp: new Date() });
});

app.get("/historial", async (req, res) => {
  const { cita_id, medico_id, paciente_id, estado, limit = "200" } = req.query;
  log("INFO", `GET /historial — filtros: ${JSON.stringify({ cita_id, medico_id, paciente_id, estado, limit })}`);

  const params = [];
  let sql = "SELECT * FROM historial_citas WHERE 1=1";

  if (cita_id)    { sql += " AND cita_id = ?";    params.push(cita_id); }
  if (medico_id)  { sql += " AND medico_id = ?";  params.push(medico_id); }
  if (paciente_id){ sql += " AND paciente_id = ?";params.push(paciente_id); }
  if (estado)     { sql += " AND estado = ?";     params.push(estado); }

  const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 200, 1000));
  sql += ` ORDER BY creado_en DESC LIMIT ${safeLimit}`;

  try {
    const [rows] = await pool.execute(sql, params);
    log("INFO", `GET /historial — ${rows.length} resultado(s)`);
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    log("ERROR", `GET /historial — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/historial/cita/:citaId", async (req, res) => {
  log("INFO", `GET /historial/cita/${req.params.citaId}`);
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM historial_citas WHERE cita_id = ? ORDER BY creado_en DESC",
      [req.params.citaId]
    );
    log("INFO", `GET /historial/cita/${req.params.citaId} — ${rows.length} evento(s)`);
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    log("ERROR", `GET /historial/cita/${req.params.citaId} — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/historial", async (req, res) => {
  const {
    cita_id,
    paciente_id = null,
    medico_id   = null,
    estado,
    accion,
    detalle     = null,
    fecha       = null,
    hora_inicio = null,
    hora_fin    = null,
  } = req.body;

  log("INFO", `POST /historial — cita_id=${cita_id} accion=${accion} estado=${estado}`);

  if (!cita_id || !estado || !accion) {
    return res.status(400).json({ error: "Campos requeridos: cita_id, estado, accion" });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO historial_citas
         (cita_id, paciente_id, medico_id, estado, accion, detalle, fecha, hora_inicio, hora_fin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cita_id, paciente_id, medico_id, estado, accion, detalle, fecha, hora_inicio, hora_fin]
    );
    const [rows] = await pool.execute("SELECT * FROM historial_citas WHERE id = ?", [result.insertId]);
    log("INFO", `POST /historial — evento registrado id=${result.insertId} cita=${cita_id}`);
    res.status(201).json({ mensaje: "Evento de historial registrado", evento: rows[0] });
  } catch (err) {
    log("ERROR", `POST /historial — error DB: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  log("ERROR", `Error no capturado en ${req.method} ${req.path}: ${err.message}`);
  res.status(500).json({ error: "Error interno del servidor" });
});

verificarDB().then(() => {
  app.listen(PORT, () => {
    log("INFO", `Corriendo en puerto ${PORT}`);
  });
});
