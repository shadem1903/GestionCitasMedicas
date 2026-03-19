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
