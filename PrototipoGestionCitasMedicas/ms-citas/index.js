const express = require("express");
const { Pool } = require("pg");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ── Conexión a PostgreSQL usando variables de entorno
const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER     || "admin",
  password: process.env.DB_PASSWORD || "admin123",
  database: process.env.DB_NAME     || "citas_db",
});

const PORT                  = process.env.PORT                  || 3004;
const MS_USUARIOS_URL       = process.env.MS_USUARIOS_URL       || "http://localhost:3001";
const MS_DISPONIBILIDAD_URL = process.env.MS_DISPONIBILIDAD_URL || "http://localhost:3003";

// Valida que un usuario exista en ms-usuarios (comunicación REST síncrona)
async function validarUsuario(id) {
  try {
    const res = await fetch(`${MS_USUARIOS_URL}/usuarios/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Verifica disponibilidad del médico en ms-disponibilidad (comunicación REST síncrona)
async function verificarDisponibilidad(medico_id, fecha_hora) {
  try {
    // Extraer fecha y hora desde el timestamp (ISO 8601 o "YYYY-MM-DD HH:MM")
    const dt = new Date(fecha_hora);
    const fecha = dt.toISOString().split("T")[0];
    const hora  = dt.toTimeString().substring(0, 5); // "HH:MM"

    const url = `${MS_DISPONIBILIDAD_URL}/disponibilidad/verificar?medico_id=${medico_id}&fecha=${fecha}&hora=${hora}`;
    const res = await fetch(url);
    if (!res.ok) return { disponible: false, razon: "ms-disponibilidad no responde" };
    return await res.json();
  } catch {
    return { disponible: false, razon: "No se pudo conectar con ms-disponibilidad" };
  }
}

// ── GET /health
app.get("/health", (req, res) => {
  res.json({ servicio: "ms-citas", estado: "ok", timestamp: new Date() });
});

// ── GET /citas — listar todas
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

// ── GET /citas/:id — detalle de una cita
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

// ── POST /citas — agendar cita
// Flujo de validación:
//   1. Verifica paciente en ms-usuarios  (REST → MS-1)
//   2. Verifica médico en ms-usuarios    (REST → MS-1)
//   3. Verifica disponibilidad del médico (REST → MS-3)
//   4. Verifica conflicto de horario en BD local
//   5. Registra la cita
app.post("/citas", async (req, res) => {
  const { paciente_id, medico_id, fecha_hora, notas } = req.body;

  if (!paciente_id || !medico_id || !fecha_hora) {
    return res.status(400).json({ error: "Campos requeridos: paciente_id, medico_id, fecha_hora" });
  }

  // ── Paso 1: verificar paciente (REST → ms-usuarios)
  const paciente = await validarUsuario(paciente_id);
  if (!paciente) {
    return res.status(422).json({
      error: "No se pudo verificar el paciente. El servicio ms-usuarios no responde o el ID no existe."
    });
  }
  if (paciente.rol !== "paciente") {
    return res.status(422).json({ error: `El usuario ${paciente_id} no tiene rol 'paciente'` });
  }

  // ── Paso 2: verificar médico (REST → ms-usuarios)
  const medico = await validarUsuario(medico_id);
  if (!medico) {
    return res.status(422).json({
      error: "No se pudo verificar el médico. El servicio ms-usuarios no responde o el ID no existe."
    });
  }
  if (medico.rol !== "medico") {
    return res.status(422).json({ error: `El usuario ${medico_id} no tiene rol 'medico'` });
  }

  // ── Paso 3: verificar disponibilidad del médico (REST → ms-disponibilidad)
  const disponibilidad = await verificarDisponibilidad(medico_id, fecha_hora);
  if (!disponibilidad.disponible) {
    return res.status(422).json({
      error: "El médico no está disponible en ese horario.",
      detalle: disponibilidad.razon
    });
  }

  // ── Paso 4: verificar conflicto de horario en BD local
  const { rows: conflicto } = await pool.query(`
    SELECT id FROM citas
    WHERE medico_id = $1
      AND fecha_hora = $2
      AND estado = 'programada'
  `, [medico_id, fecha_hora]);

  if (conflicto.length > 0) {
    return res.status(409).json({ error: "El médico ya tiene una cita registrada en ese horario" });
  }

  // ── Paso 5: registrar la cita
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

// ── PATCH /citas/:id/cancelar — cancelar cita
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

// ── PATCH /citas/:id/completar — marcar cita como completada
app.patch("/citas/:id/completar", async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE citas SET estado = 'completada' WHERE id = $1 AND estado = 'programada'",
      [req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: "Cita no encontrada o ya no está programada" });
    }
    res.json({ mensaje: "Cita marcada como completada" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Inicio
app.listen(PORT, () => {
  console.log(`[ms-citas] Corriendo en puerto ${PORT}`);
  console.log(`[ms-citas] ms-usuarios en ${MS_USUARIOS_URL}`);
  console.log(`[ms-citas] ms-disponibilidad en ${MS_DISPONIBILIDAD_URL}`);
});
