const express = require("express");
const mysql   = require("mysql2/promise");
const fetch   = require("node-fetch");
const cors    = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ── Pool de conexión a MySQL usando variables de entorno
const pool = mysql.createPool({
  host:             process.env.DB_HOST     || "localhost",
  port:             parseInt(process.env.DB_PORT) || 3306,
  user:             process.env.DB_USER     || "admin",
  password:         process.env.DB_PASSWORD || "admin123",
  database:         process.env.DB_NAME     || "citas_db",
  waitForConnections: true,
  connectionLimit:  10,
});

const PORT                  = process.env.PORT                  || 3003;
const MS_USUARIOS_URL       = process.env.MS_USUARIOS_URL       || "http://localhost:3001";
const MS_ESPECIALIDADES_URL = process.env.MS_ESPECIALIDADES_URL || "http://localhost:3007";

// Valida que el usuario exista en ms-usuarios y tenga rol médico
async function validarMedico(medico_id) {
  try {
    const res = await fetch(`${MS_USUARIOS_URL}/usuarios/${medico_id}`);
    if (!res.ok) return null;
    const usuario = await res.json();
    return usuario.rol === "medico" ? usuario : null;
  } catch {
    return null;
  }
}

// Obtiene el nombre de una especialidad desde ms-especialidades


async function loadDisponibilidadSchema() {
  const [rows] = await pool.execute(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'disponibilidad'
       AND column_name IN ('especialidad_id')`
  );
  const columns = rows.map(r => r.column_name);
  return {
    hasEspecialidadId: columns.includes('especialidad_id'),
  };
}

async function obtenerEspecialidad(especialidad_id) {
  try {
    const res = await fetch(`${MS_ESPECIALIDADES_URL}/especialidades/${especialidad_id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── GET / — información del servicio
app.get("/", (req, res) => {
  res.json({
    servicio: "ms-disponibilidad",
    version: "2.0.0",
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

// ── GET /health
app.get("/health", (req, res) => {
  res.json({ servicio: "ms-disponibilidad", estado: "ok", timestamp: new Date() });
});

// ── GET /doctor-schedules — listar horarios semanales (filtrables por medico_id)
app.get("/doctor-schedules", async (req, res) => {
  const { medico_id } = req.query;

  try {
    let sql = `
      SELECT ds.*, u.nombre AS medico
      FROM doctor_schedules ds
      JOIN usuarios u ON ds.medico_id = u.id
      WHERE ds.activo = TRUE
    `;
    const params = [];

    if (medico_id) {
      sql += " AND ds.medico_id = ?";
      params.push(medico_id);
    }
    sql += " ORDER BY ds.medico_id, ds.dia_semana, ds.hora_inicio";

    const [rows] = await pool.execute(sql, params);
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    res.status(500).json({ error: "Error al consultar horarios", detalle: err.message });
  }
});

// ── POST /doctor-schedules — crear horario semanal
app.post("/doctor-schedules", async (req, res) => {
  const { medico_id, dia_semana, hora_inicio, hora_fin } = req.body;

  if (!medico_id || dia_semana === undefined || !hora_inicio || !hora_fin) {
    return res.status(400).json({
      error: "Campos requeridos: medico_id, dia_semana, hora_inicio, hora_fin"
    });
  }
  if (hora_inicio >= hora_fin) {
    return res.status(400).json({ error: "hora_inicio debe ser anterior a hora_fin" });
  }
  if (dia_semana < 0 || dia_semana > 6) {
    return res.status(400).json({ error: "dia_semana debe ser 0-6 (0=Domingo)" });
  }

  const medico = await validarMedico(medico_id);
  if (!medico) {
    return res.status(422).json({
      error: "Médico no encontrado o el usuario no tiene rol 'medico'."
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO doctor_schedules (medico_id, dia_semana, hora_inicio, hora_fin)
       VALUES (?, ?, ?, ?)`,
      [medico_id, dia_semana, hora_inicio, hora_fin]
    );
    const [rows] = await pool.execute(
      "SELECT * FROM doctor_schedules WHERE id = ?",
      [result.insertId]
    );
    res.status(201).json({
      mensaje: "Horario semanal creado",
      horario: rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /doctor-schedules/:id — eliminar horario semanal
app.delete("/doctor-schedules/:id", async (req, res) => {
  try {
    const [result] = await pool.execute(
      "UPDATE doctor_schedules SET activo = FALSE WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Horario no encontrado" });
    }
    res.json({ mensaje: "Horario eliminado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /doctor-blocks — listar bloqueos (filtrables por medico_id, fecha)
app.get("/doctor-blocks", async (req, res) => {
  const { medico_id, fecha } = req.query;

  try {
    let sql = `
      SELECT db.*, u.nombre AS medico
      FROM doctor_blocks db
      JOIN usuarios u ON db.medico_id = u.id
      WHERE db.activo = TRUE
    `;
    const params = [];

    if (medico_id) {
      sql += " AND db.medico_id = ?";
      params.push(medico_id);
    }
    if (fecha) {
      sql += " AND db.fecha = ?";
      params.push(fecha);
    }
    sql += " ORDER BY db.fecha, db.hora_inicio";

    const [rows] = await pool.execute(sql, params);
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    res.status(500).json({ error: "Error al consultar bloqueos", detalle: err.message });
  }
});

// ── GET /disponibilidad — listar bloques de disponibilidad (filtrables por medico_id, fecha)
app.get("/disponibilidad", async (req, res) => {
  const { medico_id, fecha } = req.query;

  try {
    let sql = `
      SELECT d.*, u.nombre AS medico
      FROM disponibilidad d
      JOIN usuarios u ON d.medico_id = u.id
      WHERE d.activo = TRUE
    `;
    const params = [];

    if (medico_id) {
      sql += " AND d.medico_id = ?";
      params.push(medico_id);
    }
    if (fecha) {
      sql += " AND d.fecha = ?";
      params.push(fecha);
    }
    sql += " ORDER BY d.fecha, d.hora_inicio";

    const [rows] = await pool.execute(sql, params);
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    res.status(500).json({ error: "Error al consultar disponibilidades", detalle: err.message });
  }
});

// ── POST /doctor-blocks — crear bloqueo
app.post("/doctor-blocks", async (req, res) => {
  const { medico_id, fecha, hora_inicio, hora_fin, motivo } = req.body;

  if (!medico_id || !fecha) {
    return res.status(400).json({
      error: "Campos requeridos: medico_id, fecha"
    });
  }
  if (hora_inicio && hora_fin && hora_inicio >= hora_fin) {
    return res.status(400).json({ error: "hora_inicio debe ser anterior a hora_fin" });
  }

  const medico = await validarMedico(medico_id);
  if (!medico) {
    return res.status(422).json({
      error: "Médico no encontrado o el usuario no tiene rol 'medico'."
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO doctor_blocks (medico_id, fecha, hora_inicio, hora_fin, motivo)
       VALUES (?, ?, ?, ?, ?)`,
      [medico_id, fecha, hora_inicio || null, hora_fin || null, motivo || null]
    );
    const [rows] = await pool.execute(
      "SELECT * FROM doctor_blocks WHERE id = ?",
      [result.insertId]
    );
    res.status(201).json({
      mensaje: "Bloqueo creado",
      bloqueo: rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /doctor-blocks/:id — eliminar bloqueo
app.delete("/doctor-blocks/:id", async (req, res) => {
  try {
    const [result] = await pool.execute(
      "UPDATE doctor_blocks SET activo = FALSE WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Bloqueo no encontrado" });
    }
    res.json({ mensaje: "Bloqueo eliminado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /disponibilidad/slots — genera slots disponibles para una fecha
app.get("/disponibilidad/slots", async (req, res) => {
  const { medico_id, fecha } = req.query;

  if (!medico_id || !fecha) {
    return res.status(400).json({
      error: "Parámetros requeridos: medico_id, fecha (YYYY-MM-DD)"
    });
  }

  try {
    // Obtener duración de cita del médico
    const [medRows] = await pool.execute(
      "SELECT duracion_cita_min FROM usuarios WHERE id = ? AND rol = 'medico'",
      [medico_id]
    );
    if (medRows.length === 0) {
      return res.status(404).json({ error: "Médico no encontrado" });
    }
    const duracion = medRows[0].duracion_cita_min || 30;

    // Obtener día de la semana (0=Domingo, 1=Lunes, ..., 6=Sábado)
    const date = new Date(fecha);
    const diaSemana = date.getDay();

    // Obtener horarios semanales para ese día
    const [schedRows] = await pool.execute(
      "SELECT hora_inicio, hora_fin FROM doctor_schedules WHERE medico_id = ? AND dia_semana = ? AND activo = TRUE",
      [medico_id, diaSemana]
    );

    // Obtener bloqueos para esa fecha
    const [blockRows] = await pool.execute(
      "SELECT hora_inicio, hora_fin FROM doctor_blocks WHERE medico_id = ? AND fecha = ? AND activo = TRUE",
      [medico_id, fecha]
    );

    // Obtener citas confirmadas para esa fecha
    const [citaRows] = await pool.execute(
      "SELECT hora_inicio, hora_fin FROM citas WHERE medico_id = ? AND fecha = ? AND estado = 'confirmada'",
      [medico_id, fecha]
    );

    // Generar slots disponibles
    const slots = [];
    schedRows.forEach(sched => {
      const inicio = new Date(`${fecha}T${sched.hora_inicio}`);
      const fin = new Date(`${fecha}T${sched.hora_fin}`);
      for (let time = new Date(inicio); time < fin; time.setMinutes(time.getMinutes() + duracion)) {
        const slotInicio = time.toTimeString().slice(0, 5);
        const slotFinTime = new Date(time);
        slotFinTime.setMinutes(slotFinTime.getMinutes() + duracion);
        const slotFin = slotFinTime.toTimeString().slice(0, 5);

        // Verificar si el slot está bloqueado
        const bloqueado = blockRows.some(block => {
          if (!block.hora_inicio || !block.hora_fin) return true; // bloqueo todo el día
          const blockInicio = block.hora_inicio;
          const blockFin = block.hora_fin;
          return (slotInicio >= blockInicio && slotInicio < blockFin) ||
                 (slotFin > blockInicio && slotFin <= blockFin);
        });

        // Verificar si hay cita en ese slot
        const ocupado = citaRows.some(cita => {
          return (slotInicio >= cita.hora_inicio && slotInicio < cita.hora_fin) ||
                 (slotFin > cita.hora_inicio && slotFin <= cita.hora_fin);
        });

        if (!bloqueado && !ocupado) {
          slots.push({ inicio: slotInicio, fin: slotFin });
        }
      }
    });

    res.json({ slots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /disponibilidad/verificar — verifica si un médico tiene disponibilidad en fecha/hora
// Query params: medico_id, fecha (YYYY-MM-DD), hora (HH:MM)
app.get("/disponibilidad/verificar", async (req, res) => {
  const { medico_id, fecha, hora } = req.query;

  if (!medico_id || !fecha || !hora) {
    return res.status(400).json({
      error: "Parámetros requeridos: medico_id, fecha (YYYY-MM-DD), hora (HH:MM)"
    });
  }

  try {
    // Verificar si la hora cae dentro de algún bloque activo del médico
    const [rows] = await pool.execute(`
      SELECT id, hora_inicio, hora_fin
      FROM disponibilidad
      WHERE medico_id = ?
        AND fecha = ?
        AND hora_inicio <= ?
        AND hora_fin > ?
        AND activo = TRUE
    `, [medico_id, fecha, hora, hora]);

    if (rows.length === 0) {
      return res.json({
        disponible: false,
        razon: "El médico no tiene un bloque de disponibilidad activo en ese horario"
      });
    }

    res.json({ disponible: true, bloque: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /disponibilidad/:id — detalle de un bloque
app.get("/disponibilidad/:id", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM disponibilidad WHERE id = ?",
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Bloque de disponibilidad no encontrado" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /disponibilidad — registrar bloque de disponibilidad
// Llama a ms-usuarios para validar que el médico exista
// Llama a ms-especialidades para enriquecer la respuesta
app.post("/disponibilidad", async (req, res) => {
  const { medico_id, especialidad_id, fecha, hora_inicio, hora_fin } = req.body;

  if (!medico_id || !fecha || !hora_inicio || !hora_fin) {
    return res.status(400).json({
      error: "Campos requeridos: medico_id, fecha, hora_inicio, hora_fin"
    });
  }
  if (hora_inicio >= hora_fin) {
    return res.status(400).json({ error: "hora_inicio debe ser anterior a hora_fin" });
  }

  // ── Validar médico via ms-usuarios (comunicación REST entre servicios)
  const medico = await validarMedico(medico_id);
  if (!medico) {
    return res.status(422).json({
      error: "Médico no encontrado o el usuario no tiene rol 'medico'. Verifique ms-usuarios."
    });
  }

  // ── Verificar solapamiento de horarios (MySQL no tiene OVERLAPS, se hace manual)
  const [solapamiento] = await pool.execute(`
    SELECT id FROM disponibilidad
    WHERE medico_id = ?
      AND fecha = ?
      AND activo = TRUE
      AND hora_inicio < ?
      AND hora_fin > ?
  `, [medico_id, fecha, hora_fin, hora_inicio]);

  if (solapamiento.length > 0) {
    return res.status(409).json({
      error: "El médico ya tiene un bloque de disponibilidad que se superpone con ese horario"
    });
  }

  try {
    const schema = await loadDisponibilidadSchema();

    let result;
    if (schema.hasEspecialidadId) {
      [result] = await pool.execute(
        `INSERT INTO disponibilidad (medico_id, especialidad_id, fecha, hora_inicio, hora_fin)
         VALUES (?, ?, ?, ?, ?)`,
        [medico_id, especialidad_id || null, fecha, hora_inicio, hora_fin]
      );
    } else {
      [result] = await pool.execute(
        `INSERT INTO disponibilidad (medico_id, fecha, hora_inicio, hora_fin)
         VALUES (?, ?, ?, ?)`,
        [medico_id, fecha, hora_inicio, hora_fin]
      );
    }

    const [rows] = await pool.execute(
      "SELECT * FROM disponibilidad WHERE id = ?",
      [result.insertId]
    );
    const bloque = rows[0];

    // Enriquecer respuesta con nombre de especialidad (si fue provista)
    let especialidad = null;
    if (especialidad_id) {
      especialidad = await obtenerEspecialidad(especialidad_id);
    }

    res.status(201).json({
      mensaje: "Bloque de disponibilidad registrado",
      disponibilidad: {
        ...bloque,
        medico:      medico.nombre,
        especialidad: especialidad ? especialidad.nombre : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /disponibilidad/:id — desactivar bloque
app.delete("/disponibilidad/:id", async (req, res) => {
  try {
    const [result] = await pool.execute(
      "UPDATE disponibilidad SET activo = FALSE WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Bloque de disponibilidad no encontrado" });
    }
    res.json({ mensaje: "Bloque de disponibilidad eliminado correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Inicio
app.listen(PORT, () => {
  console.log(`[ms-disponibilidad] Corriendo en puerto ${PORT}`);
  console.log(`[ms-disponibilidad] ms-usuarios en ${MS_USUARIOS_URL}`);
  console.log(`[ms-disponibilidad] ms-especialidades en ${MS_ESPECIALIDADES_URL}`);
});
