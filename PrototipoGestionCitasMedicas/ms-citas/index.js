const express = require("express");
const mysql = require("mysql2/promise");
const fetch = require("node-fetch");
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

const PORT = process.env.PORT || 3004;
const MS_USUARIOS_URL = process.env.MS_USUARIOS_URL || "http://localhost:3001";
const MS_HISTORIAL_URL = process.env.MS_HISTORIAL_URL || "http://localhost:3005";

function enHorarioLaboral(horaInicio, horaFin) {
  return horaInicio >= "08:00" && horaFin <= "18:00";
}

function normalizarHora(hhmm) {
  return `${hhmm}:00`;
}

function normalizarFechaSql(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const str = String(value);
  const m = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : str;
}

async function validarUsuario(id) {
  try {
    const res = await fetch(`${MS_USUARIOS_URL}/usuarios/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function registrarEventoHistorial(cita, accion, detalle = null) {
  if (!cita) return;

  try {
    const response = await fetch(`${MS_HISTORIAL_URL}/historial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cita_id: cita.id,
        paciente_id: cita.paciente_id,
        medico_id: cita.medico_id,
        estado: cita.estado,
        accion,
        detalle,
        fecha: normalizarFechaSql(cita.fecha),
        hora_inicio: cita.hora_inicio,
        hora_fin: cita.hora_fin,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[ms-citas] Historial no acepto el evento (${response.status}): ${body}`);
    }
  } catch (err) {
    console.error("[ms-citas] No se pudo registrar historial:", err.message);
  }
}

async function obtenerCitaPorId(id) {
  const [rows] = await pool.execute("SELECT * FROM citas WHERE id = ?", [id]);
  return rows.length ? rows[0] : null;
}

app.get("/", (req, res) => {
  res.json({
    servicio: "ms-citas",
    version: "2.1.0",
    endpoints: [
      "GET   /health",
      "GET   /citas",
      "GET   /citas/:id",
      "POST  /citas",
      "PATCH /citas/:id/cancelar",
      "PATCH /citas/:id/confirmar",
      "PATCH /citas/:id/completar",
    ],
  });
});

app.get("/health", (req, res) => {
  res.json({ servicio: "ms-citas", estado: "ok", timestamp: new Date() });
});

app.get("/citas", async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT c.id, c.fecha, c.hora_inicio, c.hora_fin, c.estado, c.notas,
             p.nombre AS paciente, m.nombre AS medico
      FROM citas c
      JOIN usuarios p ON c.paciente_id = p.id
      JOIN usuarios m ON c.medico_id   = m.id
      ORDER BY c.fecha DESC, c.hora_inicio DESC
    `);
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/citas/:id", async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT c.*, p.nombre AS paciente, m.nombre AS medico
      FROM citas c
      JOIN usuarios p ON c.paciente_id = p.id
      JOIN usuarios m ON c.medico_id   = m.id
      WHERE c.id = ?
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: "Cita no encontrada" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/citas", async (req, res) => {
  const { paciente_id, medico_id, fecha, hora_inicio, hora_fin, notas } = req.body;

  if (!paciente_id || !medico_id || !fecha || !hora_inicio || !hora_fin) {
    return res.status(400).json({
      error: "Campos requeridos: paciente_id, medico_id, fecha, hora_inicio, hora_fin",
    });
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
    return res.status(422).json({ error: "No se pudo verificar el paciente" });
  }
  if (paciente.rol !== "paciente") {
    return res.status(422).json({ error: `El usuario ${paciente_id} no tiene rol 'paciente'` });
  }

  const medico = await validarUsuario(medico_id);
  if (!medico) {
    return res.status(422).json({ error: "No se pudo verificar el medico" });
  }
  if (medico.rol !== "medico") {
    return res.status(422).json({ error: `El usuario ${medico_id} no tiene rol 'medico'` });
  }

  try {
    const [conflicto] = await pool.execute(`
      SELECT id
      FROM citas
      WHERE medico_id = ?
        AND fecha = ?
        AND estado IN ('pendiente', 'confirmada')
        AND hora_inicio < ?
        AND hora_fin > ?
      LIMIT 1
    `, [
      medico_id,
      fecha,
      normalizarHora(hora_fin),
      normalizarHora(hora_inicio),
    ]);

    if (conflicto.length) {
      return res.status(409).json({
        error: "El medico ya tiene una cita en ese rango de tiempo",
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO citas (paciente_id, medico_id, fecha, hora_inicio, hora_fin, notas)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [paciente_id, medico_id, fecha, normalizarHora(hora_inicio), normalizarHora(hora_fin), notas || null]
    );

    const citaCreada = await obtenerCitaPorId(result.insertId);
    await registrarEventoHistorial(citaCreada, "creada", "Cita agendada");

    const [rows] = await pool.execute(
      `SELECT c.*, p.nombre AS paciente, m.nombre AS medico
       FROM citas c
       JOIN usuarios p ON c.paciente_id = p.id
       JOIN usuarios m ON c.medico_id = m.id
       WHERE c.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      mensaje: "Cita agendada correctamente",
      cita: rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/citas/:id/cancelar", async (req, res) => {
  try {
    const [r] = await pool.execute(
      "UPDATE citas SET estado = 'cancelada' WHERE id = ? AND estado IN ('pendiente','confirmada')",
      [req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: "Cita no encontrada o no cancelable" });

    const cita = await obtenerCitaPorId(req.params.id);
    await registrarEventoHistorial(cita, "cancelada", "Cita cancelada");

    res.json({ mensaje: "Cita cancelada correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/citas/:id/confirmar", async (req, res) => {
  try {
    const [r] = await pool.execute(
      "UPDATE citas SET estado = 'confirmada' WHERE id = ? AND estado = 'pendiente'",
      [req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: "Cita no encontrada o no confirmable" });

    const cita = await obtenerCitaPorId(req.params.id);
    await registrarEventoHistorial(cita, "confirmada", "Cita confirmada por el sistema");

    res.json({ mensaje: "Cita confirmada" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/citas/:id/completar", async (req, res) => {
  try {
    const [r] = await pool.execute(
      "UPDATE citas SET estado = 'completada' WHERE id = ? AND estado = 'confirmada'",
      [req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: "Cita no encontrada o no completable" });

    const cita = await obtenerCitaPorId(req.params.id);
    await registrarEventoHistorial(cita, "completada", "Cita completada");

    res.json({ mensaje: "Cita completada" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[ms-citas] Corriendo en puerto ${PORT}`);
  console.log(`[ms-citas] ms-usuarios en ${MS_USUARIOS_URL}`);
  console.log(`[ms-citas] ms-historial en ${MS_HISTORIAL_URL}`);
});
