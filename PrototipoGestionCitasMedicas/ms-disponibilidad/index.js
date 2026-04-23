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
    version: "1.0.0",
    endpoints: [
      "GET  /health",
      "GET  /disponibilidad",
      "GET  /disponibilidad/verificar?medico_id=&fecha=&hora=",
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

// ── GET /disponibilidad — listar bloques (filtrables por medico_id y/o fecha)
app.get("/disponibilidad", async (req, res) => {
  const { medico_id, fecha } = req.query;

  try {
    let sql = `
      SELECT id, medico_id, especialidad_id, fecha,
             hora_inicio, hora_fin, activo, creado_en
      FROM disponibilidad
      WHERE activo = TRUE
    `;
    const params = [];

    if (medico_id) {
      sql += " AND medico_id = ?";
      params.push(medico_id);
    }
    if (fecha) {
      sql += " AND fecha = ?";
      params.push(fecha);
    }
    sql += " ORDER BY fecha, hora_inicio";

    const [rows] = await pool.execute(sql, params);
    res.json({ total: rows.length, datos: rows });
  } catch (err) {
    res.status(500).json({ error: "Error al consultar disponibilidad", detalle: err.message });
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
      SELECT id, hora_inicio, hora_fin, especialidad_id
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
    const [result] = await pool.execute(
      `INSERT INTO disponibilidad (medico_id, especialidad_id, fecha, hora_inicio, hora_fin)
       VALUES (?, ?, ?, ?, ?)`,
      [medico_id, especialidad_id || null, fecha, hora_inicio, hora_fin]
    );
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
