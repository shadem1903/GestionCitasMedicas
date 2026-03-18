// ============================================================
//  BibliotecaNet – Backend API REST
//  Tecnología: Node.js + Express + PostgreSQL + Redis
// ============================================================

const express = require('express');
const { Pool } = require('pg');
const redis   = require('redis');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middlewares ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Conexión a PostgreSQL ────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'biblioteca_db',
  user:     process.env.DB_USER     || 'admin_biblioteca',
  password: process.env.DB_PASSWORD || 'Segura#2024',
});

// ── Conexión a Redis (caché) ─────────────────────────────────
let redisClient = null;

async function conectarRedis() {
  try {
    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'cache',
        port: parseInt(process.env.REDIS_PORT) || 6379,
      },
      password: process.env.REDIS_PASSWORD || 'Cache#2024',
    });

    redisClient.on('error', (err) => {
      console.warn('[Redis] Error de conexión (continuando sin caché):', err.message);
      redisClient = null;
    });

    await redisClient.connect();
    console.log('[Redis] Caché conectado correctamente');
  } catch (err) {
    console.warn('[Redis] No disponible – el sistema funcionará sin caché:', err.message);
    redisClient = null;
  }
}

// ── Helpers ──────────────────────────────────────────────────
async function getCache(key) {
  if (!redisClient) return null;
  try {
    const val = await redisClient.get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

async function setCache(key, data, ttl = 60) {
  if (!redisClient) return;
  try { await redisClient.setEx(key, ttl, JSON.stringify(data)); } catch {}
}

async function delCache(key) {
  if (!redisClient) return;
  try { await redisClient.del(key); } catch {}
}

// ── RUTAS ────────────────────────────────────────────────────

// GET /api/health  — Estado del sistema
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status:       'ok',
      servicio:     'BibliotecaNet API',
      base_datos:   'conectada',
      cache:        redisClient ? 'conectado' : 'no disponible',
      timestamp:    new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ status: 'error', detalle: err.message });
  }
});

// GET /api/stats  — Estadísticas generales
app.get('/api/stats', async (req, res) => {
  const cacheKey = 'stats:general';
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE true)                 AS total_libros,
        COUNT(*) FILTER (WHERE disponible = true)    AS disponibles,
        COUNT(*) FILTER (WHERE disponible = false)   AS prestados
      FROM libros
    `);
    const { rows: uRows } = await pool.query(`SELECT COUNT(*) AS usuarios FROM usuarios`);

    const data = {
      total_libros: parseInt(rows[0].total_libros),
      disponibles:  parseInt(rows[0].disponibles),
      prestados:    parseInt(rows[0].prestados),
      usuarios:     parseInt(uRows[0].usuarios),
    };

    await setCache(cacheKey, data, 30);  // caché 30 segundos
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estadísticas', detalle: err.message });
  }
});

// GET /api/libros  — Listar / buscar libros
app.get('/api/libros', async (req, res) => {
  const { q } = req.query;
  const cacheKey = q ? `libros:busqueda:${q}` : 'libros:todos';
  const cached = await getCache(cacheKey);
  if (cached) { console.log(`[Caché] HIT – ${cacheKey}`); return res.json(cached); }

  try {
    let query, params;
    if (q) {
      query  = `SELECT * FROM libros WHERE titulo ILIKE $1 OR autor ILIKE $1 OR genero ILIKE $1 ORDER BY titulo`;
      params = [`%${q}%`];
    } else {
      query  = `SELECT * FROM libros ORDER BY titulo`;
      params = [];
    }
    const { rows } = await pool.query(query, params);
    await setCache(cacheKey, rows, 60);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar libros', detalle: err.message });
  }
});

// GET /api/libros/:id  — Detalle de un libro
app.get('/api/libros/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM libros WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Libro no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener libro', detalle: err.message });
  }
});

// POST /api/libros  — Agregar un libro
app.post('/api/libros', async (req, res) => {
  const { titulo, autor, isbn, anio, genero, editorial } = req.body;
  if (!titulo || !autor) {
    return res.status(400).json({ error: 'Título y autor son obligatorios' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO libros (titulo, autor, isbn, anio_publicacion, genero, editorial, disponible)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *`,
      [titulo, autor, isbn || null, anio || null, genero || null, editorial || null]
    );
    await delCache('libros:todos');
    await delCache('stats:general');
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El ISBN ya está registrado' });
    res.status(500).json({ error: 'Error al registrar libro', detalle: err.message });
  }
});

// GET /api/prestamos  — Listar préstamos activos
app.get('/api/prestamos', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id, u.nombre AS usuario_nombre, l.titulo AS libro_titulo,
             p.fecha_prestamo, p.fecha_vencimiento, p.activo
      FROM prestamos p
      JOIN usuarios u ON u.id = p.usuario_id
      JOIN libros   l ON l.id = p.libro_id
      WHERE p.activo = true
      ORDER BY p.fecha_vencimiento ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener préstamos', detalle: err.message });
  }
});

// POST /api/prestamos  — Registrar un préstamo
app.post('/api/prestamos', async (req, res) => {
  const { libro_id, usuario_nombre } = req.body;
  if (!libro_id || !usuario_nombre) {
    return res.status(400).json({ error: 'libro_id y usuario_nombre son requeridos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar disponibilidad
    const { rows: libro } = await client.query(
      'SELECT * FROM libros WHERE id = $1 FOR UPDATE', [libro_id]
    );
    if (!libro.length)        throw { status: 404, error: 'Libro no encontrado' };
    if (!libro[0].disponible) throw { status: 409, error: 'El libro no está disponible actualmente' };

    // Buscar o crear usuario
    let { rows: userRows } = await client.query('SELECT id FROM usuarios WHERE nombre = $1', [usuario_nombre]);
    if (!userRows.length) {
      const ins = await client.query('INSERT INTO usuarios (nombre, email) VALUES ($1, $2) RETURNING id', [usuario_nombre, `${usuario_nombre.toLowerCase().replace(/\s/g,'.')}@biblioteca.co`]);
      userRows = ins.rows;
    }
    const usuario_id = userRows[0].id;

    // Crear préstamo (vence en 15 días)
    const { rows: prestamo } = await client.query(
      `INSERT INTO prestamos (usuario_id, libro_id, fecha_prestamo, fecha_vencimiento, activo)
       VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + INTERVAL '15 days', true) RETURNING *`,
      [usuario_id, libro_id]
    );

    // Marcar libro como no disponible
    await client.query('UPDATE libros SET disponible = false WHERE id = $1', [libro_id]);

    await client.query('COMMIT');

    await delCache('libros:todos');
    await delCache('stats:general');

    res.status(201).json({ message: 'Préstamo registrado', prestamo: prestamo[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    const status = err.status || 500;
    res.status(status).json({ error: err.error || 'Error al registrar préstamo', detalle: err.message });
  } finally {
    client.release();
  }
});

// GET /api/usuarios  — Listar usuarios
app.get('/api/usuarios', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.nombre, u.email, u.telefono,
             COUNT(p.id) FILTER (WHERE p.activo = true) AS prestamos_activos
      FROM usuarios u
      LEFT JOIN prestamos p ON p.usuario_id = u.id
      GROUP BY u.id
      ORDER BY u.nombre
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios', detalle: err.message });
  }
});

// ── INICIAR SERVIDOR ─────────────────────────────────────────
async function main() {
  await conectarRedis();

  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   BibliotecaNet API  –  Puerto ${PORT}    ║
║   Base de datos: ${process.env.DB_HOST || 'localhost'}          ║
╚════════════════════════════════════════╝
    `);
  });
}

main();
