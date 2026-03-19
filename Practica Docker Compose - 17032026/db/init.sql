--  BibliotecaNet – Script de inicialización de la base de datos

-- TABLA: libros─
CREATE TABLE IF NOT EXISTS libros (
    id               SERIAL PRIMARY KEY,
    titulo           VARCHAR(255)  NOT NULL,
    autor            VARCHAR(255)  NOT NULL,
    isbn             VARCHAR(20)   UNIQUE,
    anio_publicacion INTEGER,
    genero           VARCHAR(100),
    editorial        VARCHAR(150),
    disponible       BOOLEAN       NOT NULL DEFAULT true,
    fecha_registro   TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- TABLA: usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id               SERIAL PRIMARY KEY,
    nombre           VARCHAR(150)  NOT NULL,
    email            VARCHAR(200)  UNIQUE NOT NULL,
    telefono         VARCHAR(20),
    fecha_registro   TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- TABLA: préstamos 
CREATE TABLE IF NOT EXISTS prestamos (
    id                SERIAL PRIMARY KEY,
    usuario_id        INTEGER       NOT NULL REFERENCES usuarios(id),
    libro_id          INTEGER       NOT NULL REFERENCES libros(id),
    fecha_prestamo    DATE          NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento DATE          NOT NULL,
    fecha_devolucion  DATE,
    activo            BOOLEAN       NOT NULL DEFAULT true
);

-- ÍNDICES para mejorar rendimiento en búsquedas 
CREATE INDEX IF NOT EXISTS idx_libros_titulo    ON libros (titulo);
CREATE INDEX IF NOT EXISTS idx_libros_autor     ON libros (autor);
CREATE INDEX IF NOT EXISTS idx_libros_disponible ON libros (disponible);
CREATE INDEX IF NOT EXISTS idx_prestamos_activo ON prestamos (activo);

-- DATOS DE EJEMPLO

-- Libros
INSERT INTO libros (titulo, autor, isbn, anio_publicacion, genero, editorial, disponible) VALUES
    ('Cien años de soledad',       'Gabriel García Márquez', '978-0-06-088328-7', 1967, 'Novela',           'Harper Perennial',   true),
    ('El nombre de la rosa',       'Umberto Eco',            '978-0-15-144647-6', 1980, 'Novela',           'Harcourt',           false),
    ('Ficciones',                  'Jorge Luis Borges',      '978-0-8021-3030-5', 1944, 'Cuento',           'Grove Press',        true),
    ('Dune',                       'Frank Herbert',          '978-0-441-17271-9', 1965, 'Ciencia Ficción',  'Ace Books',          true),
    ('Sapiens',                    'Yuval Noah Harari',      '978-0-06-231609-7', 2011, 'Historia',         'Harper Collins',     false),
    ('Don Quijote de la Mancha',   'Miguel de Cervantes',    '978-0-06-093434-9', 1605, 'Novela',           'Harper Collins',     true),
    ('1984',                       'George Orwell',          '978-0-451-52493-5', 1949, 'Novela',           'Signet Classic',     false),
    ('Clean Code',                 'Robert C. Martin',       '978-0-13-235088-4', 2008, 'Tecnología',       'Prentice Hall',      true),
    ('El principito',              'Antoine de Saint-Exupéry','978-0-15-601219-5',1943, 'Novela',           'Harcourt',           true),
    ('Crimen y castigo',           'Fiódor Dostoyevski',     '978-0-14-044913-6', 1866, 'Novela',           'Penguin Classics',   true)
ON CONFLICT (isbn) DO NOTHING;

-- Usuarios
INSERT INTO usuarios (nombre, email, telefono) VALUES
    ('Laura Morales',    'laura.morales@email.com',   '3001234567'),
    ('Carlos Herrera',   'carlos.herrera@email.com',  '3109876543'),
    ('Sofía Quintero',   'sofia.quintero@email.com',  '3205551234'),
    ('Andrés Castillo',  'andres.castillo@email.com', '3157778899')
ON CONFLICT (email) DO NOTHING;

-- Préstamos activos (para los libros marcados como no disponibles)
INSERT INTO prestamos (usuario_id, libro_id, fecha_prestamo, fecha_vencimiento, activo)
SELECT u.id, l.id,
       CURRENT_DATE - INTERVAL '5 days',
       CURRENT_DATE + INTERVAL '10 days',
       true
FROM usuarios u, libros l
WHERE u.email = 'laura.morales@email.com' AND l.titulo = 'El nombre de la rosa'
  AND NOT EXISTS (SELECT 1 FROM prestamos WHERE libro_id = l.id AND activo = true);

INSERT INTO prestamos (usuario_id, libro_id, fecha_prestamo, fecha_vencimiento, activo)
SELECT u.id, l.id,
       CURRENT_DATE - INTERVAL '3 days',
       CURRENT_DATE + INTERVAL '12 days',
       true
FROM usuarios u, libros l
WHERE u.email = 'carlos.herrera@email.com' AND l.titulo = 'Sapiens'
  AND NOT EXISTS (SELECT 1 FROM prestamos WHERE libro_id = l.id AND activo = true);

INSERT INTO prestamos (usuario_id, libro_id, fecha_prestamo, fecha_vencimiento, activo)
SELECT u.id, l.id,
       CURRENT_DATE - INTERVAL '8 days',
       CURRENT_DATE + INTERVAL '7 days',
       true
FROM usuarios u, libros l
WHERE u.email = 'sofia.quintero@email.com' AND l.titulo = '1984'
  AND NOT EXISTS (SELECT 1 FROM prestamos WHERE libro_id = l.id AND activo = true);

-- Confirmación de inicialización
DO $$
BEGIN
  RAISE NOTICE '✅ BibliotecaNet DB inicializada correctamente – % libros, % usuarios',
    (SELECT COUNT(*) FROM libros),
    (SELECT COUNT(*) FROM usuarios);
END $$;
