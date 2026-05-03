const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3006;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "8h";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "admin",
  password: process.env.DB_PASSWORD || "admin123",
  database: process.env.DB_NAME || "citas_db",
  waitForConnections: true,
  connectionLimit: 10,
});

async function bootstrapAuthSchema() {
  const [cols] = await pool.execute(
    `SELECT COUNT(*) AS c
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'usuarios'
       AND COLUMN_NAME = 'password_hash'`
  );
  if (!Number(cols[0].c)) {
    await pool.execute("ALTER TABLE usuarios ADD COLUMN password_hash VARCHAR(255) NULL");
  }

  // Password inicial para usuarios demo y usuarios sin clave: 123456
  const [rows] = await pool.execute("SELECT id FROM usuarios WHERE password_hash IS NULL OR password_hash = ''");
  if (rows.length) {
    const hash = await bcrypt.hash("123456", 10);
    for (const row of rows) {
      await pool.execute("UPDATE usuarios SET password_hash = ? WHERE id = ?", [hash, row.id]);
    }
  }
}

app.get("/health", (req, res) => {
  res.json({ servicio: "ms-auth", estado: "ok", timestamp: new Date() });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Campos requeridos: email, password" });
  }

  try {
    const [rows] = await pool.execute(
      "SELECT id, nombre, email, rol, activo, password_hash FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );
    if (!rows.length) return res.status(401).json({ error: "Credenciales invalidas" });

    const user = rows[0];
    if (!user.activo) return res.status(403).json({ error: "Usuario inactivo" });

    const ok = await bcrypt.compare(password, user.password_hash || "");
    if (!ok) return res.status(401).json({ error: "Credenciales invalidas" });

    const payload = { sub: user.id, rol: user.rol, email: user.email, nombre: user.nombre };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    return res.json({
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol },
      expires_in: JWT_EXPIRES,
    });
  } catch (err) {
    return res.status(500).json({ error: "Error en autenticacion", detalle: err.message });
  }
});

app.get("/verify", async (req, res) => {
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

bootstrapAuthSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[ms-auth] Corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[ms-auth] Error de arranque:", err.message);
    process.exit(1);
  });
