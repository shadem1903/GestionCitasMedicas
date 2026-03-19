<<<<<<< HEAD
const express = require('express')
const { Pool } = require('pg')
const cors = require('cors')

const app = express()
const PORT = 4000

app.use(cors())
app.use(express.json())

// conexion a la base de datos
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

// ruta para saber si el servidor esta funcionando
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', mensaje: 'servidor funcionando' })
  } catch (err) {
    res.status(500).json({ status: 'error', detalle: err.message })
  }
})

// estadisticas generales
app.get('/api/stats', async (req, res) => {
  try {
    const libros = await pool.query('SELECT COUNT(*) FROM libros')
    const disponibles = await pool.query('SELECT COUNT(*) FROM libros WHERE disponible = true')
    const prestados = await pool.query('SELECT COUNT(*) FROM libros WHERE disponible = false')
    const usuarios = await pool.query('SELECT COUNT(*) FROM usuarios')

    res.json({
      total_libros: parseInt(libros.rows[0].count),
      disponibles:  parseInt(disponibles.rows[0].count),
      prestados:    parseInt(prestados.rows[0].count),
      usuarios:     parseInt(usuarios.rows[0].count),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// obtener todos los libros o buscar por titulo/autor
app.get('/api/libros', async (req, res) => {
  try {
    const { q } = req.query
    let resultado

    if (q) {
      resultado = await pool.query(
        'SELECT * FROM libros WHERE titulo ILIKE $1 OR autor ILIKE $1 ORDER BY titulo',
        [`%${q}%`]
      )
    } else {
      resultado = await pool.query('SELECT * FROM libros ORDER BY titulo')
    }

    res.json(resultado.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// agregar un libro nuevo
app.post('/api/libros', async (req, res) => {
  const { titulo, autor, isbn, anio, genero, editorial } = req.body

  if (!titulo || !autor) {
    return res.status(400).json({ error: 'El titulo y autor son obligatorios' })
  }

  try {
    const resultado = await pool.query(
      'INSERT INTO libros (titulo, autor, isbn, anio_publicacion, genero, editorial) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [titulo, autor, isbn, anio, genero, editorial]
    )
    res.status(201).json(resultado.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ver prestamos activos
app.get('/api/prestamos', async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT p.id, u.nombre AS usuario_nombre, l.titulo AS libro_titulo,
             p.fecha_prestamo, p.fecha_vencimiento, p.activo
      FROM prestamos p
      JOIN usuarios u ON u.id = p.usuario_id
      JOIN libros l ON l.id = p.libro_id
      WHERE p.activo = true
    `)
    res.json(resultado.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// registrar un prestamo
app.post('/api/prestamos', async (req, res) => {
  const { libro_id, usuario_nombre } = req.body

  try {
    // buscar si el libro esta disponible
    const libro = await pool.query('SELECT * FROM libros WHERE id = $1', [libro_id])
    if (!libro.rows[0].disponible) {
      return res.status(400).json({ error: 'El libro no esta disponible' })
    }

    // buscar o crear usuario
    let usuario = await pool.query('SELECT * FROM usuarios WHERE nombre = $1', [usuario_nombre])
    if (usuario.rows.length === 0) {
      usuario = await pool.query(
        'INSERT INTO usuarios (nombre, email) VALUES ($1, $2) RETURNING *',
        [usuario_nombre, usuario_nombre.toLowerCase().replace(/ /g, '.') + '@biblioteca.co']
      )
    }

    // crear el prestamo
    await pool.query(
      'INSERT INTO prestamos (usuario_id, libro_id, fecha_prestamo, fecha_vencimiento) VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + INTERVAL \'15 days\')',
      [usuario.rows[0].id, libro_id]
    )

    // marcar el libro como no disponible
    await pool.query('UPDATE libros SET disponible = false WHERE id = $1', [libro_id])

    res.status(201).json({ mensaje: 'Prestamo registrado correctamente' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// listar usuarios
app.get('/api/usuarios', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM usuarios ORDER BY nombre')
    res.json(resultado.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// iniciar el servidor
app.listen(PORT, () => {
  console.log('Servidor corriendo en el puerto ' + PORT)
})
=======
require('dotenv').config()
const express = require('express')
const mysql = require('mysql2/promise')
const redis = require('redis')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 4000

// ───── MYSQL ─────
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

// ───── REDIS ─────
let redisClient = null

async function conectarRedis() {
  try {
    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
      },
      password: process.env.REDIS_PASSWORD,
    })

    await redisClient.connect()
    console.log('✅ Redis conectado')
  } catch {
    console.log('⚠️ Redis no disponible')
    redisClient = null
  }
}

const getCache = async (key) => {
  if (!redisClient) return null
  const data = await redisClient.get(key)
  return data ? JSON.parse(data) : null
}

const setCache = async (key, data, ttl = 60) => {
  if (!redisClient) return
  await redisClient.setEx(key, ttl, JSON.stringify(data))
}

// ───── HEALTH ─────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json(err)
  }
})

// ───── STATS ─────
app.get('/api/stats', async (req, res) => {
  const cache = await getCache('stats')
  if (cache) return res.json(cache)

  const [rows] = await pool.query(`
    SELECT 
      COUNT(*) AS total_libros,
      SUM(disponible = true) AS disponibles,
      SUM(disponible = false) AS prestados
    FROM libros
  `)

  const [users] = await pool.query(`SELECT COUNT(*) AS usuarios FROM usuarios`)

  const data = {
    total_libros: rows[0].total_libros,
    disponibles: rows[0].disponibles,
    prestados: rows[0].prestados,
    usuarios: users[0].usuarios,
  }

  await setCache('stats', data)
  res.json(data)
})

// ───── LIBROS ─────
app.get('/api/libros', async (req, res) => {
  const { q } = req.query

  let query = `SELECT * FROM libros ORDER BY titulo`
  let params = []

  if (q) {
    query = `
      SELECT * FROM libros 
      WHERE titulo LIKE ? OR autor LIKE ? OR genero LIKE ?
      ORDER BY titulo
    `
    params = [`%${q}%`, `%${q}%`, `%${q}%`]
  }

  const [rows] = await pool.query(query, params)
  res.json(rows)
})

app.post('/api/libros', async (req, res) => {
  const { titulo, autor, isbn, anio, genero, editorial } = req.body

  const [result] = await pool.query(
    `INSERT INTO libros (titulo, autor, isbn, anio_publicacion, genero, editorial, disponible)
     VALUES (?, ?, ?, ?, ?, ?, true)`,
    [titulo, autor, isbn, anio, genero, editorial]
  )

  const [rows] = await pool.query('SELECT * FROM libros WHERE id = ?', [result.insertId])

  res.json(rows[0])
})

// ───── PRESTAMOS ─────
app.get('/api/prestamos', async (req, res) => {
  const [rows] = await pool.query(`
    SELECT p.id, u.nombre AS usuario, l.titulo AS libro,
           p.fecha_prestamo, p.fecha_vencimiento
    FROM prestamos p
    JOIN usuarios u ON u.id = p.usuario_id
    JOIN libros l ON l.id = p.libro_id
    WHERE p.activo = true
  `)

  res.json(rows)
})

app.post('/api/prestamos', async (req, res) => {
  const { libro_id, usuario_nombre } = req.body

  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    const [libro] = await conn.query('SELECT * FROM libros WHERE id = ? FOR UPDATE', [libro_id])

    if (!libro.length) throw 'Libro no existe'
    if (!libro[0].disponible) throw 'No disponible'

    let [user] = await conn.query('SELECT id FROM usuarios WHERE nombre = ?', [usuario_nombre])

    let usuario_id

    if (!user.length) {
      const [newUser] = await conn.query(
        'INSERT INTO usuarios (nombre, email) VALUES (?, ?)',
        [usuario_nombre, `${usuario_nombre}@correo.com`]
      )
      usuario_id = newUser.insertId
    } else {
      usuario_id = user[0].id
    }

    await conn.query(
      `INSERT INTO prestamos (usuario_id, libro_id, fecha_prestamo, fecha_vencimiento, activo)
       VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 15 DAY), true)`,
      [usuario_id, libro_id]
    )

    await conn.query('UPDATE libros SET disponible = false WHERE id = ?', [libro_id])

    await conn.commit()

    res.json({ ok: true })

  } catch (err) {
    await conn.rollback()
    res.status(500).json({ error: err })
  } finally {
    conn.release()
  }
})

// ───── USUARIOS ─────
app.get('/api/usuarios', async (req, res) => {
  const [rows] = await pool.query(`
    SELECT u.id, u.nombre, u.email,
           COUNT(p.id) AS prestamos
    FROM usuarios u
    LEFT JOIN prestamos p ON p.usuario_id = u.id AND p.activo = true
    GROUP BY u.id
  `)

  res.json(rows)
})

// ───── START ─────
app.listen(PORT, async () => {
  await conectarRedis()
  console.log(`🚀 API corriendo en puerto ${PORT}`)
})
>>>>>>> origin/JosueRivera
