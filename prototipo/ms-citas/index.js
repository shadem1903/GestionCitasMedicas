const express = require("express");
const { Pool } = require("pg");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

//Conexión a PostgreSQL
const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER     || "admin",
  password: process.env.DB_PASSWORD || "admin123",
  database: process.env.DB_NAME     || "citas_db",
});

const PORT             = process.env.PORT            || 3004;
const MS_USUARIOS_URL  = process.env.MS_USUARIOS_URL || "http://localhost:3001";

// Valida que un usuario exista en ms-usuarios (comunicación REST síncrona)
async function validarUsuario(id) {
  try {
    const res = await fetch(`${MS_USUARIOS_URL}/usuarios/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // ms-usuarios no responde → bloqueamos la operación
  }
}

// Health check básico para monitoreo
app.get("/health", (req, res) => {
  res.json({ servicio: "ms-citas", estado: "ok", timestamp: new Date() });
});

// GET /citas — listar todas 
app.get("/citas", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.fecha_hora, c.estado, c.notas,
             p.nombre AS paciente, m.nombre AS medico
      FROM citas c
      JOIN usuarios p ON c.paciente_id = p.id
      JOIN usuarios m ON c.medico_id   = m.id
      ORDER BY c.fecha_hora DESC
    `);
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//  GET /citas/:id — detalle de una cita 
app.get("/citas/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, p.nombre AS paciente, m.nombre AS medico
      FROM citas c
      JOIN usuarios p ON c.paciente_id = p.id
      JOIN usuarios m ON c.medico_id   = m.id
      WHERE c.id = $1
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Cita no encontrada" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /citas — agendar cita 
// Valida paciente y médico en ms-usuarios antes de registrar
app.post("/citas", async (req, res) => {
  const { paciente_id, medico_id, fecha_hora, notas } = req.body;

  if (!paciente_id || !medico_id || !fecha_hora) {
    return res.status(400).json({ error: "Campos requeridos: paciente_id, medico_id, fecha_hora" });
  }

  // ── Validación 1: verificar paciente (REST → ms-usuarios) ──
  const paciente = await validarUsuario(paciente_id);
  if (!paciente) {
    return res.status(422).json({
      error: "No se pudo verificar el paciente. El servicio de usuarios no responde o el ID no existe."
    });
  }
  if (paciente.rol !== "paciente") {
    return res.status(422).json({ error: `El usuario ${paciente_id} no tiene rol 'paciente'` });
  }

  // ── Validación 2: verificar médico (REST → ms-usuarios) 
  const medico = await validarUsuario(medico_id);
  if (!medico) {
    return res.status(422).json({
      error: "No se pudo verificar el médico. El servicio de usuarios no responde o el ID no existe."
    });
  }
  if (medico.rol !== "medico") {
    return res.status(422).json({ error: `El usuario ${medico_id} no tiene rol 'medico'` });
  }

  // ── Verificar que no haya conflicto de horario 
  const { rows: conflicto } = await pool.query(`
    SELECT id FROM citas
    WHERE medico_id = $1
      AND fecha_hora = $2
      AND estado = 'programada'
  `, [medico_id, fecha_hora]);

  if (conflicto.length > 0) {
    return res.status(409).json({ error: "El médico ya tiene una cita en ese horario" });
  }

  // ── Registrar la cita 
  try {
    const { rows } = await pool.query(
      "INSERT INTO citas (paciente_id, medico_id, fecha_hora, notas) VALUES ($1, $2, $3, $4) RETURNING *",
      [paciente_id, medico_id, fecha_hora, notas || null]
    );
    res.status(201).json({
      mensaje: "Cita agendada correctamente",
      cita: {
        ...rows[0],
        paciente: paciente.nombre,
        medico:   medico.nombre
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /citas/:id/cancelar — cancelar cita 
app.patch("/citas/:id/cancelar", async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE citas SET estado = 'cancelada' WHERE id = $1 AND estado = 'programada'",
      [req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: "Cita no encontrada o ya no está programada" });
    }
    res.json({ mensaje: "Cita cancelada correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Inicio 
app.listen(PORT, () => {
  console.log(`[ms-citas] Corriendo en puerto ${PORT}`);
  console.log(`[ms-citas] Conectado a ms-usuarios en ${MS_USUARIOS_URL}`);
});
