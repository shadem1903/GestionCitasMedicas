const express = require("express");
const cors    = require("cors");
const mysql   = require("mysql2/promise");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const SERVICIO   = "ms-auth";
const PORT       = process.env.PORT       || 3006;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const JWT_EXPIRES= process.env.JWT_EXPIRES|| "8h";

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

async function bootstrapAuthSchema() {
  // Verificar si password_hash ya existe (puede no estar en despliegues antiguos)
  const [cols] = await pool.execute(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'password_hash'`
  );
  if (!Number(cols[0].c)) {
    log("WARN", "Columna password_hash no encontrada — agregando al esquema");
    await pool.execute("ALTER TABLE usuarios ADD COLUMN password_hash VARCHAR(255) NULL");
  }

  // Asignar contrasena inicial a usuarios demo sin hash
  const [rows] = await pool.execute(
    "SELECT id FROM usuarios WHERE password_hash IS NULL OR password_hash = ''"
  );
  if (rows.length) {
    log("INFO", `Asignando contrasena inicial a ${rows.length} usuario(s) sin hash`);
    const hash = await bcrypt.hash("123456", 10);
    for (const row of rows) {
      await pool.execute("UPDATE usuarios SET password_hash = ? WHERE id = ?", [hash, row.id]);
    }
    log("INFO", "Contrasenas iniciales asignadas");
  }
}

app.get("/health", (req, res) => {
  res.json({ servicio: SERVICIO, estado: "ok", timestamp: new Date() });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  log("INFO", `POST /login — email=${email}`);

  if (!email || !password) {
    return res.status(400).json({ error: "Campos requeridos: email, password" });
  }

  try {
    const [rows] = await pool.execute(
      "SELECT id, nombre, email, rol, activo, password_hash FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );
    if (!rows.length) {
      log("WARN", `POST /login — email no encontrado: ${email}`);
      return res.status(401).json({ error: "Credenciales invalidas" });
    }

    const user = rows[0];
    if (!user.activo) {
      log("WARN", `POST /login — usuario inactivo id=${user.id}`);
      return res.status(403).json({ error: "Usuario inactivo" });
    }

    const ok = await bcrypt.compare(password, user.password_hash || "");
    if (!ok) {
      log("WARN", `POST /login — contrasena incorrecta para email=${email}`);
      return res.status(401).json({ error: "Credenciales invalidas" });
    }

    const payload = { sub: user.id, rol: user.rol, email: user.email, nombre: user.nombre };
    const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    log("INFO", `POST /login — sesion iniciada id=${user.id} rol=${user.rol}`);
    return res.json({
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol },
      expires_in: JWT_EXPIRES,
    });
  } catch (err) {
    log("ERROR", `POST /login — ${err.message}`);
    return res.status(500).json({ error: "Error en autenticacion", detalle: err.message });
  }
});

app.get("/verify", (req, res) => {
  const auth = req.headers.authorization || "";
  const [, token] = auth.split(" ");
  if (!token) return res.status(401).json({ error: "Token requerido" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ valid: true, user: decoded });
  } catch {
    return res.status(401).json({ valid: false, error: "Token invalido" });
  }
});

app.use((err, req, res, next) => {
  log("ERROR", `Error no capturado en ${req.method} ${req.path}: ${err.message}`);
  res.status(500).json({ error: "Error interno del servidor" });
});

verificarDB()
  .then(() => bootstrapAuthSchema())
  .then(() => {
    app.listen(PORT, () => {
      log("INFO", `Corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    log("ERROR", `Error de arranque: ${err.message}`);
    process.exit(1);
  });
