const express = require("express");
const mysql   = require("mysql2/promise");
const cors    = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let serviceLogs = [];
let avgResponseTime = 0;
let totalRequests = 0;
let errorCount = 0;

const SERVICIO = "ms-usuarios";

function log(nivel, mensaje) {
  const line = `[${new Date().toISOString()}] [${SERVICIO}] [${nivel}] ${mensaje}`;
  console.log(line);
  serviceLogs.push(line);
  if (serviceLogs.length > 100) serviceLogs.shift();
}

// Middleware de tiempos de respuesta y conteo
app.use((req, res, next) => {
  totalRequests++;
  const start = Date.now();
  res.on("finish", () => {
    const elapsed = Date.now() - start;
    avgResponseTime = (avgResponseTime * 0.9) + (elapsed * 0.1);
    if (res.statusCode >= 400) errorCount++;
  });
  next();
});

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || "localhost",
  port:             parseInt(process.env.DB_PORT || "3306", 10),
  user:             process.env.DB_USER     || "admin",
  password:         process.env.DB_PASSWORD || "admin123",
  database:         process.env.DB_NAME     || "db_usuarios",
  waitForConnections: true,
  connectionLimit:  10,
});

const PORT = process.env.PORT || 3001;

app.get("/", (req, res) => {
  res.json({
    servicio: SERVICIO,
    version: "1.0.0",
    endpoints: [
      "GET    /health",
      "GET    /usuarios",
      "GET    /usuarios/:id",
      "POST   /usuarios",
      "PUT    /usuarios/:id",
      "DELETE /usuarios/:id",
    ],
  });
});

app.get("/health", (req, res) => {
  res.json({
    servicio: SERVICIO,
    estado: "ok",
    response_time_ms: Math.round(avgResponseTime),
    timestamp: new Date()
  });
});

app.get("/logs", (req, res) => {
  res.json(serviceLogs);
});

app.get("/metrics", (req, res) => {
  res.json({
    servicio: SERVICIO,
    uptime_seconds: Math.round(process.uptime()),
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
    total_requests: totalRequests,
    error_count: errorCount,
    avg_response_time_ms: Math.round(avgResponseTime)
  });
});

app.get("/usuarios", async (req, res) => {
  log("INFO", "GET /usuarios");
  try {
    const [rows] = await pool.execute(
      "SELECT id, nombre, email, rol, activo, creado_en FROM usuarios ORDER BY id"
    );
    log("INFO", `GET /usuarios — ${rows.length} resultado(s)`);
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    log("ERROR", `GET /usuarios — ${err.message}`);
    res.status(500).json({ error: "Error al consultar usuarios", detalle: err.message });
  }
});

app.get("/usuarios/:id", async (req, res) => {
  log("INFO", `GET /usuarios/${req.params.id}`);
  try {
    const [rows] = await pool.execute(
      "SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json(rows[0]);
  } catch (err) {
    log("ERROR", `GET /usuarios/${req.params.id} — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/usuarios", async (req, res) => {
  const { nombre, email, rol } = req.body;
  log("INFO", `POST /usuarios — email=${email} rol=${rol}`);

  if (!nombre || !email || !rol) {
    return res.status(400).json({ error: "Campos requeridos: nombre, email, rol" });
  }
  if (!["paciente", "medico", "admin"].includes(rol)) {
    return res.status(400).json({ error: "Rol invalido. Opciones: paciente, medico, admin" });
  }

  try {
    const [result] = await pool.execute(
      "INSERT INTO usuarios (nombre, email, rol) VALUES (?, ?, ?)",
      [nombre, email, rol]
    );
    const [rows] = await pool.execute("SELECT * FROM usuarios WHERE id = ?", [result.insertId]);
    log("INFO", `POST /usuarios — creado id=${result.insertId}`);
    res.status(201).json({ mensaje: "Usuario creado", usuario: rows[0] });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      log("WARN", `POST /usuarios — email duplicado: ${email}`);
      return res.status(409).json({ error: "El email ya esta registrado" });
    }
    log("ERROR", `POST /usuarios — error DB: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.put("/usuarios/:id", async (req, res) => {
  const { nombre, email, rol } = req.body;
  log("INFO", `PUT /usuarios/${req.params.id}`);

  if (!nombre || !email || !rol) {
    return res.status(400).json({ error: "Campos requeridos: nombre, email, rol" });
  }
  if (!["paciente", "medico", "admin"].includes(rol)) {
    return res.status(400).json({ error: "Rol invalido. Opciones: paciente, medico, admin" });
  }

  try {
    const [result] = await pool.execute(
      "UPDATE usuarios SET nombre = ?, email = ?, rol = ? WHERE id = ?",
      [nombre, email, rol, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Usuario no encontrado" });
    const [rows] = await pool.execute("SELECT * FROM usuarios WHERE id = ?", [req.params.id]);
    log("INFO", `PUT /usuarios/${req.params.id} — OK`);
    res.json({ mensaje: "Usuario actualizado", usuario: rows[0] });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      log("WARN", `PUT /usuarios/${req.params.id} — email duplicado: ${email}`);
      return res.status(409).json({ error: "El email ya esta en uso por otro usuario" });
    }
    log("ERROR", `PUT /usuarios/${req.params.id} — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/usuarios/:id", async (req, res) => {
  log("INFO", `DELETE /usuarios/${req.params.id}`);
  try {
    const [result] = await pool.execute(
      "UPDATE usuarios SET activo = FALSE WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Usuario no encontrado" });
    log("INFO", `DELETE /usuarios/${req.params.id} — OK`);
    res.json({ mensaje: "Usuario desactivado correctamente" });
  } catch (err) {
    log("ERROR", `DELETE /usuarios/${req.params.id} — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.patch("/usuarios/:id/activar", async (req, res) => {
  log("INFO", `PATCH /usuarios/${req.params.id}/activar`);
  try {
    const [result] = await pool.execute(
      "UPDATE usuarios SET activo = TRUE WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Usuario no encontrado" });
    log("INFO", `PATCH /usuarios/${req.params.id}/activar — OK`);
    res.json({ mensaje: "Usuario activado correctamente" });
  } catch (err) {
    log("ERROR", `PATCH /usuarios/${req.params.id}/activar — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Notificaciones ──────────────────────────────────────────
app.get("/usuarios/:id/notificaciones", async (req, res) => {
  log("INFO", `GET /usuarios/${req.params.id}/notificaciones`);
  try {
    const [rows] = await pool.execute(
      "SELECT id, mensaje, leida, creado_en FROM notificaciones WHERE usuario_id = ? ORDER BY creado_en DESC LIMIT 50",
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    log("ERROR", `GET /usuarios/${req.params.id}/notificaciones — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/usuarios/:id/notificaciones", async (req, res) => {
  const { mensaje } = req.body;
  log("INFO", `POST /usuarios/${req.params.id}/notificaciones`);
  if (!mensaje) return res.status(400).json({ error: "mensaje requerido" });
  try {
    const [result] = await pool.execute(
      "INSERT INTO notificaciones (usuario_id, mensaje) VALUES (?, ?)",
      [req.params.id, mensaje]
    );
    res.status(201).json({ id: result.insertId, mensaje });
  } catch (err) {
    log("ERROR", `POST /usuarios/${req.params.id}/notificaciones — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.put("/usuarios/:id/notificaciones/:notif_id/read", async (req, res) => {
  log("INFO", `PUT /usuarios/${req.params.id}/notificaciones/${req.params.notif_id}/read`);
  try {
    await pool.execute(
      "UPDATE notificaciones SET leida = TRUE WHERE id = ? AND usuario_id = ?",
      [req.params.notif_id, req.params.id]
    );
    res.json({ mensaje: "Notificacion marcada como leida" });
  } catch (err) {
    log("ERROR", `PUT .../notificaciones/.../read — ${err.message}`);
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
