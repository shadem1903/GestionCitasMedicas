const express = require("express");
const mysql   = require("mysql2/promise");
const cors    = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const SERVICIO = "ms-usuarios";

function log(nivel, mensaje) {
  console.log(`[${new Date().toISOString()}] [${SERVICIO}] [${nivel}] ${mensaje}`);
}

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
  res.json({ servicio: SERVICIO, estado: "ok", timestamp: new Date() });
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

app.use((err, req, res, next) => {
  log("ERROR", `Error no capturado en ${req.method} ${req.path}: ${err.message}`);
  res.status(500).json({ error: "Error interno del servidor" });
});

verificarDB().then(() => {
  app.listen(PORT, () => {
    log("INFO", `Corriendo en puerto ${PORT}`);
  });
});
