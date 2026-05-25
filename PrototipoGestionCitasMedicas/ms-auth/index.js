const express = require("express");
const cors    = require("cors");
const mysql   = require("mysql2/promise");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

let serviceLogs = [];
let avgResponseTime = 0;
let totalRequests = 0;
let errorCount = 0;

const SERVICIO   = "ms-auth";
const PORT       = process.env.PORT       || 3006;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const JWT_EXPIRES= process.env.JWT_EXPIRES|| "8h";

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

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || "localhost",
  port:             parseInt(process.env.DB_PORT || "3306", 10),
  user:             process.env.DB_USER     || "admin",
  password:         process.env.DB_PASSWORD || "admin123",
  database:         process.env.DB_NAME     || "db_usuarios",
  waitForConnections: true,
  connectionLimit:  10,
});

async function bootstrapAuthSchema() {
  let intentos = 0;
  const maxIntentos = 10;
  
  while (intentos < maxIntentos) {
    try {
      // Verificar si password_hash ya existe
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
      
      log("INFO", "Bootstrap completado");
      return; // Éxito, salir
      
    } catch (err) {
      intentos++;
      log("WARN", `Intento ${intentos}/${maxIntentos} fallido: ${err.message}`);
      if (intentos >= maxIntentos) {
        log("ERROR", `Maximos intentos alcanzados: ${err.message}`);
        throw err;
      }
      await new Promise(r => setTimeout(r, 3000)); // Esperar 3 segundos
    }
  }
}

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
      log("WARN", `POST /login — usuario inactivo id=${user.id}. Permitiendo login pero con acceso restringido.`);
      // Se permite loguear, pero el token reflejará activo=false
    }

    const ok = await bcrypt.compare(password, user.password_hash || "");
    if (!ok) {
      log("WARN", `POST /login — contrasena incorrecta para email=${email}`);
      return res.status(401).json({ error: "Credenciales invalidas" });
    }

    const payload = { sub: user.id, rol: user.rol, email: user.email, nombre: user.nombre, activo: !!user.activo };
    const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    log("INFO", `POST /login — sesion iniciada id=${user.id} rol=${user.rol} activo=${!!user.activo}`);
    return res.json({
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, activo: !!user.activo },
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

bootstrapAuthSchema()
  .then(() => {
    app.listen(PORT, () => {
      log("INFO", `Corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    log("ERROR", `Error de arranque: ${err.message}`);
    process.exit(1);
  });