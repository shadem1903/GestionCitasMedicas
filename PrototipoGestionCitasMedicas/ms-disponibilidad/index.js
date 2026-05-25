const express = require("express");
const mysql   = require("mysql2/promise");
const fetch   = require("node-fetch");
const cors    = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const SERVICIO = "ms-disponibilidad";

let serviceLogs = [];
let avgResponseTime = 0;
let totalRequests = 0;
let errorCount = 0;

function log(nivel, mensaje) {
  const line = `[${new Date().toISOString()}] [${SERVICIO}] [${nivel}] ${mensaje}`;
  console.log(line);
  serviceLogs.push(line);
  if (serviceLogs.length > 100) serviceLogs.shift();
}

// Middleware de tiempos de respuesta
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

// ── Circuit Breaker ──────────────────────────────────────────
class CircuitBreaker {
  constructor(nombre, { umbralFallas = 3, tiempoRecuperacion = 30000 } = {}) {
    this.nombre = nombre;
    this.umbralFallas = umbralFallas;
    this.tiempoRecuperacion = tiempoRecuperacion;
    this.estado = "CERRADO";
    this.fallas = 0;
    this.abiertaEn = null;
  }

  async ejecutar(fn) {
    if (this.estado === "ABIERTO") {
      const transcurrido = Date.now() - this.abiertaEn;
      if (transcurrido < this.tiempoRecuperacion) {
        const restante = Math.ceil((this.tiempoRecuperacion - transcurrido) / 1000);
        log("WARN", `[CB:${this.nombre}] ABIERTO — llamada bloqueada, reintento en ${restante}s`);
        throw new Error(`Servicio ${this.nombre} no disponible (circuit abierto)`);
      }
      this.estado = "SEMI_ABIERTO";
      log("INFO", `[CB:${this.nombre}] SEMI_ABIERTO — probando recuperacion`);
    }

    try {
      const resultado = await fn();
      if (this.estado !== "CERRADO") {
        log("INFO", `[CB:${this.nombre}] Recuperado exitosamente — Estado: CERRADO`);
      }
      this.estado = "CERRADO";
      this.fallas = 0;
      return resultado;
    } catch (err) {
      this.fallas++;
      this.abiertaEn = Date.now();
      if (this.fallas >= this.umbralFallas || this.estado === "SEMI_ABIERTO") {
        this.estado = "ABIERTO";
        log("ERROR", `[CB:${this.nombre}] ABIERTO — ${this.fallas} falla(s) consecutivas: ${err.message}`);
      } else {
        log("WARN", `[CB:${this.nombre}] Falla ${this.fallas}/${this.umbralFallas}: ${err.message}`);
      }
      throw err;
    }
  }
}

const cbUsuarios       = new CircuitBreaker("ms-usuarios");
const cbEspecialidades = new CircuitBreaker("ms-especialidades");
const cbCitas          = new CircuitBreaker("ms-citas");

// ── Pool DB ──────────────────────────────────────────────────
const pool = mysql.createPool({
  host:             process.env.DB_HOST     || "localhost",
  port:             parseInt(process.env.DB_PORT || "3306", 10),
  user:             process.env.DB_USER     || "admin",
  password:         process.env.DB_PASSWORD || "admin123",
  database:         process.env.DB_NAME     || "db_disponibilidad",
  waitForConnections: true,
  connectionLimit:  10,
});

const PORT                  = process.env.PORT                  || 3003;
const MS_USUARIOS_URL       = process.env.MS_USUARIOS_URL       || "http://localhost:3001";
const MS_ESPECIALIDADES_URL = process.env.MS_ESPECIALIDADES_URL || "http://localhost:3007";
const MS_CITAS_URL          = process.env.MS_CITAS_URL          || "http://localhost:3004";

// ── Helpers inter-servicio ───────────────────────────────────
async function validarMedico(medico_id) {
  try {
    return await cbUsuarios.ejecutar(async () => {
      const res = await fetch(`${MS_USUARIOS_URL}/usuarios/${medico_id}`, { timeout: 5000 });
      if (!res.ok) {
        if (res.status >= 500) throw new Error(`HTTP ${res.status} de ms-usuarios`);
        return null;
      }
      const usuario = await res.json();
      return usuario.rol === "medico" ? usuario : null;
    });
  } catch {
    return null;
  }
}

async function obtenerEspecialidad(especialidad_id) {
  try {
    return await cbEspecialidades.ejecutar(async () => {
      const res = await fetch(`${MS_ESPECIALIDADES_URL}/especialidades/${especialidad_id}`, { timeout: 5000 });
      if (!res.ok) {
        if (res.status >= 500) throw new Error(`HTTP ${res.status} de ms-especialidades`);
        return null;
      }
      return await res.json();
    });
  } catch {
    return null;
  }
}

async function obtenerCitasConfirmadas(medico_id, fecha) {
  try {
    return await cbCitas.ejecutar(async () => {
      const url = `${MS_CITAS_URL}/citas?medico_id=${medico_id}&fecha=${fecha}&estado=confirmada`;
      const res = await fetch(url, { timeout: 5000 });
      if (!res.ok) throw new Error(`HTTP ${res.status} de ms-citas`);
      const data = await res.json();
      return data.datos || [];
    });
  } catch (err) {
    log("WARN", `No se pudo obtener citas confirmadas para medico=${medico_id} fecha=${fecha}: ${err.message}`);
    return []; // degradacion graceful: generar slots sin verificar conflictos
  }
}

// ── Rutas ────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    servicio: SERVICIO,
    version: "2.1.0",
    endpoints: [
      "GET  /health",
      "GET  /doctor-schedules",
      "POST /doctor-schedules",
      "DELETE /doctor-schedules/:id",
      "GET  /doctor-blocks",
      "POST /doctor-blocks",
      "DELETE /doctor-blocks/:id",
      "GET  /disponibilidad",
      "GET  /disponibilidad/verificar?medico_id=&fecha=&hora=",
      "GET  /disponibilidad/slots?medico_id=&fecha=",
      "GET  /disponibilidad/:id",
      "POST /disponibilidad",
      "DELETE /disponibilidad/:id",
    ],
  });
});

app.get("/health", (req, res) => {
  res.json({
    servicio: SERVICIO,
    estado: "ok",
    response_time_ms: Math.round(avgResponseTime),
    timestamp: new Date(),
    circuit_breakers: {
      "ms-usuarios":       cbUsuarios.estado,
      "ms-especialidades": cbEspecialidades.estado,
      "ms-citas":          cbCitas.estado,
    },
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

// ── GET /doctor-schedules
app.get("/doctor-schedules", async (req, res) => {
  const { medico_id } = req.query;
  log("INFO", `GET /doctor-schedules — medico_id=${medico_id || "todos"}`);
  try {
    let sql = `
      SELECT ds.*, u.nombre AS medico
      FROM doctor_schedules ds
      JOIN db_usuarios.usuarios u ON ds.medico_id = u.id
      WHERE ds.activo = TRUE
    `;
    const params = [];
    if (medico_id) { sql += " AND ds.medico_id = ?"; params.push(medico_id); }
    sql += " ORDER BY ds.medico_id, ds.dia_semana, ds.hora_inicio";

    const [rows] = await pool.execute(sql, params);
    log("INFO", `GET /doctor-schedules — ${rows.length} resultado(s)`);
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    log("ERROR", `GET /doctor-schedules — error DB: ${err.message}`);
    res.status(500).json({ error: "Error al consultar horarios", detalle: err.message });
  }
});

// ── POST /doctor-schedules
app.post("/doctor-schedules", async (req, res) => {
  const { medico_id, dia_semana, hora_inicio, hora_fin } = req.body;
  log("INFO", `POST /doctor-schedules — medico=${medico_id} dia=${dia_semana} ${hora_inicio}-${hora_fin}`);

  if (!medico_id || dia_semana === undefined || !hora_inicio || !hora_fin) {
    return res.status(400).json({ error: "Campos requeridos: medico_id, dia_semana, hora_inicio, hora_fin" });
  }
  if (hora_inicio >= hora_fin) {
    return res.status(400).json({ error: "hora_inicio debe ser anterior a hora_fin" });
  }
  if (dia_semana < 0 || dia_semana > 6) {
    return res.status(400).json({ error: "dia_semana debe ser 0-6 (0=Domingo)" });
  }

  const medico = await validarMedico(medico_id);
  if (!medico) {
    log("WARN", `POST /doctor-schedules — medico id=${medico_id} no verificado (CB estado: ${cbUsuarios.estado})`);
    return res.status(422).json({ error: "Medico no encontrado o el usuario no tiene rol 'medico'." });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO doctor_schedules (medico_id, dia_semana, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)`,
      [medico_id, dia_semana, hora_inicio, hora_fin]
    );
    const [rows] = await pool.execute("SELECT * FROM doctor_schedules WHERE id = ?", [result.insertId]);
    log("INFO", `POST /doctor-schedules — creado id=${result.insertId}`);
    res.status(201).json({ mensaje: "Horario semanal creado", horario: rows[0] });
  } catch (err) {
    log("ERROR", `POST /doctor-schedules — error DB: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /doctor-schedules/:id
app.delete("/doctor-schedules/:id", async (req, res) => {
  log("INFO", `DELETE /doctor-schedules/${req.params.id}`);
  try {
    const [result] = await pool.execute(
      "UPDATE doctor_schedules SET activo = FALSE WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Horario no encontrado" });
    log("INFO", `DELETE /doctor-schedules/${req.params.id} — OK`);
    res.json({ mensaje: "Horario eliminado" });
  } catch (err) {
    log("ERROR", `DELETE /doctor-schedules/${req.params.id} — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /doctor-blocks
app.get("/doctor-blocks", async (req, res) => {
  const { medico_id, fecha } = req.query;
  log("INFO", `GET /doctor-blocks — medico_id=${medico_id || "todos"} fecha=${fecha || "todas"}`);
  try {
    let sql = `
      SELECT db.*, u.nombre AS medico
      FROM doctor_blocks db
      JOIN db_usuarios.usuarios u ON db.medico_id = u.id
      WHERE db.activo = TRUE
    `;
    const params = [];
    if (medico_id) { sql += " AND db.medico_id = ?"; params.push(medico_id); }
    if (fecha)     { sql += " AND db.fecha = ?";     params.push(fecha); }
    sql += " ORDER BY db.fecha, db.hora_inicio";

    const [rows] = await pool.execute(sql, params);
    log("INFO", `GET /doctor-blocks — ${rows.length} resultado(s)`);
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    log("ERROR", `GET /doctor-blocks — error DB: ${err.message}`);
    res.status(500).json({ error: "Error al consultar bloqueos", detalle: err.message });
  }
});

// ── POST /doctor-blocks
app.post("/doctor-blocks", async (req, res) => {
  const { medico_id, fecha, hora_inicio, hora_fin, motivo } = req.body;
  log("INFO", `POST /doctor-blocks — medico=${medico_id} fecha=${fecha}`);

  if (!medico_id || !fecha) {
    return res.status(400).json({ error: "Campos requeridos: medico_id, fecha" });
  }
  if (hora_inicio && hora_fin && hora_inicio >= hora_fin) {
    return res.status(400).json({ error: "hora_inicio debe ser anterior a hora_fin" });
  }

  const medico = await validarMedico(medico_id);
  if (!medico) {
    log("WARN", `POST /doctor-blocks — medico id=${medico_id} no verificado (CB estado: ${cbUsuarios.estado})`);
    return res.status(422).json({ error: "Medico no encontrado o el usuario no tiene rol 'medico'." });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO doctor_blocks (medico_id, fecha, hora_inicio, hora_fin, motivo) VALUES (?, ?, ?, ?, ?)`,
      [medico_id, fecha, hora_inicio || null, hora_fin || null, motivo || null]
    );
    const [rows] = await pool.execute("SELECT * FROM doctor_blocks WHERE id = ?", [result.insertId]);
    log("INFO", `POST /doctor-blocks — creado id=${result.insertId}`);
    res.status(201).json({ mensaje: "Bloqueo creado", bloqueo: rows[0] });
  } catch (err) {
    log("ERROR", `POST /doctor-blocks — error DB: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /doctor-blocks/:id
app.delete("/doctor-blocks/:id", async (req, res) => {
  log("INFO", `DELETE /doctor-blocks/${req.params.id}`);
  try {
    const [result] = await pool.execute(
      "UPDATE doctor_blocks SET activo = FALSE WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Bloqueo no encontrado" });
    log("INFO", `DELETE /doctor-blocks/${req.params.id} — OK`);
    res.json({ mensaje: "Bloqueo eliminado" });
  } catch (err) {
    log("ERROR", `DELETE /doctor-blocks/${req.params.id} — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /disponibilidad
app.get("/disponibilidad", async (req, res) => {
  const { medico_id, fecha } = req.query;
  log("INFO", `GET /disponibilidad — medico_id=${medico_id || "todos"} fecha=${fecha || "todas"}`);
  try {
    let sql = `
      SELECT d.*, u.nombre AS medico
      FROM disponibilidad d
      JOIN db_usuarios.usuarios u ON d.medico_id = u.id
      WHERE d.activo = TRUE
    `;
    const params = [];
    if (medico_id) { sql += " AND d.medico_id = ?"; params.push(medico_id); }
    if (fecha)     { sql += " AND d.fecha = ?";     params.push(fecha); }
    sql += " ORDER BY d.fecha, d.hora_inicio";

    const [rows] = await pool.execute(sql, params);
    log("INFO", `GET /disponibilidad — ${rows.length} resultado(s)`);
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    log("ERROR", `GET /disponibilidad — error DB: ${err.message}`);
    res.status(500).json({ error: "Error al consultar disponibilidades", detalle: err.message });
  }
});

// ── GET /disponibilidad/slots
app.get("/disponibilidad/slots", async (req, res) => {
  const { medico_id, fecha } = req.query;
  log("INFO", `GET /disponibilidad/slots — medico=${medico_id} fecha=${fecha}`);

  if (!medico_id || !fecha) {
    return res.status(400).json({ error: "Parametros requeridos: medico_id, fecha (YYYY-MM-DD)" });
  }

  try {
    const [medRows] = await pool.execute(
      "SELECT duracion_cita_min FROM db_usuarios.usuarios WHERE id = ? AND rol = 'medico'",
      [medico_id]
    );
    if (medRows.length === 0) return res.status(404).json({ error: "Medico no encontrado" });
    const duracion = medRows[0].duracion_cita_min || 30;

    const diaSemana = new Date(fecha).getDay();

    const [schedRows] = await pool.execute(
      "SELECT hora_inicio, hora_fin FROM doctor_schedules WHERE medico_id = ? AND dia_semana = ? AND activo = TRUE",
      [medico_id, diaSemana]
    );
    const [blockRows] = await pool.execute(
      "SELECT hora_inicio, hora_fin FROM doctor_blocks WHERE medico_id = ? AND fecha = ? AND activo = TRUE",
      [medico_id, fecha]
    );

    const citaRows = await obtenerCitasConfirmadas(medico_id, fecha);

    const slots = [];
    schedRows.forEach(sched => {
      const inicio = new Date(`${fecha}T${sched.hora_inicio}`);
      const fin    = new Date(`${fecha}T${sched.hora_fin}`);

      for (let time = new Date(inicio); time < fin; time = new Date(time.getTime() + duracion * 60000)) {
        const slotInicio = time.toTimeString().slice(0, 5);
        const slotFin    = new Date(time.getTime() + duracion * 60000).toTimeString().slice(0, 5);

        const bloqueado = blockRows.some(b => {
          if (!b.hora_inicio || !b.hora_fin) return true;
          return (slotInicio >= b.hora_inicio && slotInicio < b.hora_fin) ||
                 (slotFin > b.hora_inicio && slotFin <= b.hora_fin);
        });

        const ocupado = citaRows.some(c =>
          (slotInicio >= c.hora_inicio && slotInicio < c.hora_fin) ||
          (slotFin > c.hora_inicio && slotFin <= c.hora_fin)
        );

        if (!bloqueado && !ocupado) slots.push({ inicio: slotInicio, fin: slotFin });
      }
    });

    log("INFO", `GET /disponibilidad/slots — medico=${medico_id} fecha=${fecha} → ${slots.length} slot(s)`);
    res.json({ slots });
  } catch (err) {
    log("ERROR", `GET /disponibilidad/slots — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /disponibilidad/verificar
app.get("/disponibilidad/verificar", async (req, res) => {
  const { medico_id, fecha, hora } = req.query;
  if (!medico_id || !fecha || !hora) {
    return res.status(400).json({ error: "Parametros requeridos: medico_id, fecha (YYYY-MM-DD), hora (HH:MM)" });
  }
  try {
    const [rows] = await pool.execute(`
      SELECT id, hora_inicio, hora_fin FROM disponibilidad
      WHERE medico_id = ? AND fecha = ? AND hora_inicio <= ? AND hora_fin > ? AND activo = TRUE
    `, [medico_id, fecha, hora, hora]);

    if (rows.length === 0) {
      return res.json({ disponible: false, razon: "El medico no tiene un bloque de disponibilidad activo en ese horario" });
    }
    res.json({ disponible: true, bloque: rows[0] });
  } catch (err) {
    log("ERROR", `GET /disponibilidad/verificar — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /disponibilidad/:id
app.get("/disponibilidad/:id", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM disponibilidad WHERE id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Bloque de disponibilidad no encontrado" });
    res.json(rows[0]);
  } catch (err) {
    log("ERROR", `GET /disponibilidad/${req.params.id} — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /disponibilidad
app.post("/disponibilidad", async (req, res) => {
  const { medico_id, especialidad_id, fecha, hora_inicio, hora_fin } = req.body;
  log("INFO", `POST /disponibilidad — medico=${medico_id} fecha=${fecha} ${hora_inicio}-${hora_fin}`);

  if (!medico_id || !fecha || !hora_inicio || !hora_fin) {
    return res.status(400).json({ error: "Campos requeridos: medico_id, fecha, hora_inicio, hora_fin" });
  }
  if (hora_inicio >= hora_fin) {
    return res.status(400).json({ error: "hora_inicio debe ser anterior a hora_fin" });
  }

  const medico = await validarMedico(medico_id);
  if (!medico) {
    log("WARN", `POST /disponibilidad — medico id=${medico_id} no verificado (CB estado: ${cbUsuarios.estado})`);
    return res.status(422).json({ error: "Medico no encontrado o el usuario no tiene rol 'medico'. Verifique ms-usuarios." });
  }

  const [solapamiento] = await pool.execute(`
    SELECT id FROM disponibilidad
    WHERE medico_id = ? AND fecha = ? AND activo = TRUE
      AND hora_inicio < ? AND hora_fin > ?
  `, [medico_id, fecha, hora_fin, hora_inicio]);

  if (solapamiento.length > 0) {
    return res.status(409).json({ error: "El medico ya tiene un bloque de disponibilidad que se superpone con ese horario" });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO disponibilidad (medico_id, especialidad_id, fecha, hora_inicio, hora_fin) VALUES (?, ?, ?, ?, ?)`,
      [medico_id, especialidad_id || null, fecha, hora_inicio, hora_fin]
    );
    const [rows] = await pool.execute("SELECT * FROM disponibilidad WHERE id = ?", [result.insertId]);
    const bloque = rows[0];

    let especialidad = null;
    if (especialidad_id) especialidad = await obtenerEspecialidad(especialidad_id);

    log("INFO", `POST /disponibilidad — creado id=${result.insertId}`);
    res.status(201).json({
      mensaje: "Bloque de disponibilidad registrado",
      disponibilidad: { ...bloque, medico: medico.nombre, especialidad: especialidad ? especialidad.nombre : null },
    });
  } catch (err) {
    log("ERROR", `POST /disponibilidad — error DB: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /disponibilidad/:id
app.delete("/disponibilidad/:id", async (req, res) => {
  log("INFO", `DELETE /disponibilidad/${req.params.id}`);
  try {
    const [result] = await pool.execute(
      "UPDATE disponibilidad SET activo = FALSE WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Bloque de disponibilidad no encontrado" });
    log("INFO", `DELETE /disponibilidad/${req.params.id} — OK`);
    res.json({ mensaje: "Bloque de disponibilidad eliminado correctamente" });
  } catch (err) {
    log("ERROR", `DELETE /disponibilidad/${req.params.id} — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Middleware de errores no capturados
app.use((err, req, res, next) => {
  log("ERROR", `Error no capturado en ${req.method} ${req.path}: ${err.message}`);
  res.status(500).json({ error: "Error interno del servidor" });
});

app.listen(PORT, () => {
  log("INFO", `Corriendo en puerto ${PORT}`);
  log("INFO", `ms-usuarios en ${MS_USUARIOS_URL}`);
  log("INFO", `ms-especialidades en ${MS_ESPECIALIDADES_URL}`);
  log("INFO", `ms-citas en ${MS_CITAS_URL}`);
});
