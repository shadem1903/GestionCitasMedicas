const express = require("express");
const mysql = require("mysql2/promise");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const SERVICIO = "ms-citas";

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

const cbUsuarios  = new CircuitBreaker("ms-usuarios");
const cbHistorial = new CircuitBreaker("ms-historial");

// ── Pool DB ──────────────────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "admin",
  password: process.env.DB_PASSWORD || "admin123",
  database: process.env.DB_NAME || "db_citas",
  waitForConnections: true,
  connectionLimit: 10,
});

const PORT             = process.env.PORT             || 3004;
const MS_USUARIOS_URL  = process.env.MS_USUARIOS_URL  || "http://localhost:3001";
const MS_HISTORIAL_URL = process.env.MS_HISTORIAL_URL || "http://localhost:3005";

// ── Helpers ──────────────────────────────────────────────────
function enHorarioLaboral(horaInicio, horaFin) {
  return horaInicio >= "08:00" && horaFin <= "18:00";
}

function normalizarHora(hhmm) {
  return `${hhmm}:00`;
}

function normalizarFechaSql(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : String(value);
}

async function validarUsuario(id) {
  try {
    return await cbUsuarios.ejecutar(async () => {
      const res = await fetch(`${MS_USUARIOS_URL}/usuarios/${id}`, { timeout: 5000 });
      if (!res.ok) {
        if (res.status >= 500) throw new Error(`HTTP ${res.status} de ms-usuarios`);
        return null; // 404 u otro 4xx: usuario no existe, no es falla del servicio
      }
      return await res.json();
    });
  } catch {
    return null;
  }
}

async function registrarEventoHistorial(cita, accion, detalle = null) {
  if (!cita) return;
  try {
    await cbHistorial.ejecutar(async () => {
      const res = await fetch(`${MS_HISTORIAL_URL}/historial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: 5000,
        body: JSON.stringify({
          cita_id:    cita.id,
          paciente_id: cita.paciente_id,
          medico_id:  cita.medico_id,
          estado:     cita.estado,
          accion,
          detalle,
          fecha:      normalizarFechaSql(cita.fecha),
          hora_inicio: cita.hora_inicio,
          hora_fin:   cita.hora_fin,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} de ms-historial`);
    });
  } catch (err) {
    // Historial es auditoria: si falla, solo se registra en log
    log("WARN", `No se pudo registrar historial para cita ${cita.id}: ${err.message}`);
  }
}

async function enviarNotificacion(usuario_id, mensaje) {
  if (!usuario_id) return;
  try {
    await cbUsuarios.ejecutar(async () => {
      const res = await fetch(`${MS_USUARIOS_URL}/usuarios/${usuario_id}/notificaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: 5000,
        body: JSON.stringify({ mensaje }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });
  } catch (err) {
    log("WARN", `No se pudo enviar notificacion al usuario ${usuario_id}: ${err.message}`);
  }
}

async function obtenerCitaPorId(id) {
  const [rows] = await pool.execute("SELECT * FROM citas WHERE id = ?", [id]);
  return rows.length ? rows[0] : null;
}

// ── Rutas ────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    servicio: SERVICIO,
    version: "2.2.0",
    endpoints: [
      "GET   /health",
      "GET   /citas?medico_id=&paciente_id=&fecha=&estado=",
      "GET   /citas/:id",
      "POST  /citas",
      "PATCH /citas/:id/cancelar",
      "PATCH /citas/:id/confirmar",
      "PATCH /citas/:id/completar",
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
      "ms-usuarios":  cbUsuarios.estado,
      "ms-historial": cbHistorial.estado,
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

app.get("/citas", async (req, res) => {
  const { medico_id, paciente_id, fecha, estado } = req.query;
  log("INFO", `GET /citas — filtros: ${JSON.stringify({ medico_id, paciente_id, fecha, estado })}`);
  try {
    let sql = `
      SELECT id, paciente_id, medico_id,
             paciente_nombre AS paciente, medico_nombre AS medico,
             fecha, hora_inicio, hora_fin, estado, notas, creado_en
      FROM citas WHERE 1=1
    `;
    const params = [];
    if (medico_id)   { sql += " AND medico_id = ?";   params.push(medico_id); }
    if (paciente_id) { sql += " AND paciente_id = ?"; params.push(paciente_id); }
    if (fecha)       { sql += " AND fecha = ?";       params.push(fecha); }
    if (estado)      { sql += " AND estado = ?";      params.push(estado); }
    sql += " ORDER BY fecha DESC, hora_inicio DESC";

    const [rows] = await pool.execute(sql, params);
    log("INFO", `GET /citas — ${rows.length} resultado(s)`);
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    log("ERROR", `GET /citas — error DB: ${err.message}`);
    res.status(500).json({ error: "Error al consultar citas", detalle: err.message });
  }
});

app.get("/citas/:id", async (req, res) => {
  log("INFO", `GET /citas/${req.params.id}`);
  try {
    const [rows] = await pool.execute(`
      SELECT id, paciente_id, medico_id,
             paciente_nombre AS paciente, medico_nombre AS medico,
             fecha, hora_inicio, hora_fin, estado, notas, creado_en
      FROM citas WHERE id = ?
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Cita no encontrada" });
    res.json(rows[0]);
  } catch (err) {
    log("ERROR", `GET /citas/${req.params.id} — error DB: ${err.message}`);
    res.status(500).json({ error: "Error al consultar cita", detalle: err.message });
  }
});

app.post("/citas", async (req, res) => {
  const { paciente_id, medico_id, fecha, hora_inicio, hora_fin, notas } = req.body;
  log("INFO", `POST /citas — paciente=${paciente_id} medico=${medico_id} fecha=${fecha} ${hora_inicio}-${hora_fin}`);

  if (!paciente_id || !medico_id || !fecha || !hora_inicio || !hora_fin) {
    return res.status(400).json({ error: "Campos requeridos: paciente_id, medico_id, fecha, hora_inicio, hora_fin" });
  }
  if (hora_inicio >= hora_fin) {
    return res.status(400).json({ error: "hora_inicio debe ser anterior a hora_fin" });
  }

  const [h1, m1] = hora_inicio.split(":").map(Number);
  const [h2, m2] = hora_fin.split(":").map(Number);
  const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins !== 30) {
    return res.status(400).json({ error: "La cita debe durar exactamente 30 minutos" });
  }
  if (!enHorarioLaboral(hora_inicio, hora_fin)) {
    return res.status(422).json({
      error: "Horario fuera del rango permitido",
      detalle: "Las citas se agendan entre 08:00 y 18:00, en bloques de 30 minutos",
    });
  }

  const paciente = await validarUsuario(paciente_id);
  if (!paciente) {
    log("WARN", `POST /citas — no se pudo verificar paciente id=${paciente_id} (CB estado: ${cbUsuarios.estado})`);
    return res.status(422).json({ error: "No se pudo verificar el paciente" });
  }
  if (paciente.rol !== "paciente") {
    return res.status(422).json({ error: `El usuario ${paciente_id} no tiene rol 'paciente'` });
  }

  const medico = await validarUsuario(medico_id);
  if (!medico) {
    log("WARN", `POST /citas — no se pudo verificar medico id=${medico_id} (CB estado: ${cbUsuarios.estado})`);
    return res.status(422).json({ error: "No se pudo verificar el medico" });
  }
  if (medico.rol !== "medico") {
    return res.status(422).json({ error: `El usuario ${medico_id} no tiene rol 'medico'` });
  }

  try {
    const [conflicto] = await pool.execute(`
      SELECT id FROM citas
      WHERE medico_id = ? AND fecha = ?
        AND estado IN ('pendiente', 'confirmada')
        AND hora_inicio < ? AND hora_fin > ?
      LIMIT 1
    `, [medico_id, fecha, normalizarHora(hora_fin), normalizarHora(hora_inicio)]);

    if (conflicto.length) {
      log("WARN", `POST /citas — conflicto de horario para medico=${medico_id} fecha=${fecha} ${hora_inicio}-${hora_fin}`);
      return res.status(409).json({ error: "El medico ya tiene una cita en ese rango de tiempo" });
    }

    const [result] = await pool.execute(
      `INSERT INTO citas
         (paciente_id, medico_id, paciente_nombre, medico_nombre, fecha, hora_inicio, hora_fin, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [paciente_id, medico_id, paciente.nombre, medico.nombre, fecha,
       normalizarHora(hora_inicio), normalizarHora(hora_fin), notas || null]
    );

    const citaCreada = await obtenerCitaPorId(result.insertId);
    log("INFO", `POST /citas — cita creada id=${result.insertId}`);
    await registrarEventoHistorial(citaCreada, "creada", "Cita agendada");

    // Enviar notificaciones
    await enviarNotificacion(paciente_id, `Se ha agendado una nueva cita con ${medico.nombre} para el ${fecha} a las ${hora_inicio}.`);
    await enviarNotificacion(medico_id, `Nueva cita agendada por el paciente ${paciente.nombre} para el ${fecha} a las ${hora_inicio}.`);

    const [rows] = await pool.execute(`
      SELECT id, paciente_id, medico_id,
             paciente_nombre AS paciente, medico_nombre AS medico,
             fecha, hora_inicio, hora_fin, estado, notas, creado_en
      FROM citas WHERE id = ?
    `, [result.insertId]);

    res.status(201).json({ mensaje: "Cita agendada correctamente", cita: rows[0] });
  } catch (err) {
    log("ERROR", `POST /citas — error DB: ${err.message}`);
    res.status(500).json({ error: "Error al agendar cita", detalle: err.message });
  }
});

app.patch("/citas/:id/cancelar", async (req, res) => {
  log("INFO", `PATCH /citas/${req.params.id}/cancelar`);
  try {
    const [r] = await pool.execute(
      "UPDATE citas SET estado = 'cancelada' WHERE id = ? AND estado IN ('pendiente','confirmada')",
      [req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: "Cita no encontrada o no cancelable" });
    const cita = await obtenerCitaPorId(req.params.id);
    await registrarEventoHistorial(cita, "cancelada", "Cita cancelada");
    log("INFO", `PATCH /citas/${req.params.id}/cancelar — OK`);
    res.json({ mensaje: "Cita cancelada correctamente" });
  } catch (err) {
    log("ERROR", `PATCH /citas/${req.params.id}/cancelar — ${err.message}`);
    res.status(500).json({ error: "Error al cancelar cita", detalle: err.message });
  }
});

app.patch("/citas/:id/confirmar", async (req, res) => {
  log("INFO", `PATCH /citas/${req.params.id}/confirmar`);
  try {
    const [r] = await pool.execute(
      "UPDATE citas SET estado = 'confirmada' WHERE id = ? AND estado = 'pendiente'",
      [req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: "Cita no encontrada o no confirmable" });
    const cita = await obtenerCitaPorId(req.params.id);
    await registrarEventoHistorial(cita, "confirmada", "Cita confirmada por el sistema");
    log("INFO", `PATCH /citas/${req.params.id}/confirmar — OK`);
    res.json({ mensaje: "Cita confirmada" });
  } catch (err) {
    log("ERROR", `PATCH /citas/${req.params.id}/confirmar — ${err.message}`);
    res.status(500).json({ error: "Error al confirmar cita", detalle: err.message });
  }
});

app.patch("/citas/:id/completar", async (req, res) => {
  log("INFO", `PATCH /citas/${req.params.id}/completar`);
  try {
    const [r] = await pool.execute(
      "UPDATE citas SET estado = 'completada' WHERE id = ? AND estado = 'confirmada'",
      [req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: "Cita no encontrada o no completable" });
    const cita = await obtenerCitaPorId(req.params.id);
    await registrarEventoHistorial(cita, "completada", "Cita completada");
    
    // Notificaciones
    await enviarNotificacion(cita.paciente_id, `Tu cita del ${cita.fecha} con ${cita.medico_nombre} ha sido completada.`);
    await enviarNotificacion(cita.medico_id, `La cita con ${cita.paciente_nombre} ha sido completada.`);
    
    log("INFO", `PATCH /citas/${req.params.id}/completar — OK`);
    res.json({ mensaje: "Cita completada" });
  } catch (err) {
    log("ERROR", `PATCH /citas/${req.params.id}/completar — ${err.message}`);
    res.status(500).json({ error: "Error al completar cita", detalle: err.message });
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
  log("INFO", `ms-historial en ${MS_HISTORIAL_URL}`);
});
