-- base de datos para el sistema de biblioteca
-- se ejecuta automaticamente cuando se crea el contenedor

-- tabla de libros
CREATE TABLE libros (
    id               SERIAL PRIMARY KEY,
    titulo           VARCHAR(255) NOT NULL,
    autor            VARCHAR(255) NOT NULL,
    isbn             VARCHAR(20),
    anio_publicacion INTEGER,
    genero           VARCHAR(100),
    editorial        VARCHAR(150),
    disponible       BOOLEAN DEFAULT true,
    fecha_registro   TIMESTAMP DEFAULT NOW()
);

-- tabla de usuarios
CREATE TABLE usuarios (
    id             SERIAL PRIMARY KEY,
    nombre         VARCHAR(150) NOT NULL,
    email          VARCHAR(200),
    telefono       VARCHAR(20),
    fecha_registro TIMESTAMP DEFAULT NOW()
);

-- tabla de prestamos
CREATE TABLE prestamos (
    id                SERIAL PRIMARY KEY,
    usuario_id        INTEGER REFERENCES usuarios(id),
    libro_id          INTEGER REFERENCES libros(id),
    fecha_prestamo    DATE DEFAULT CURRENT_DATE,
    fecha_vencimiento DATE,
    activo            BOOLEAN DEFAULT true
);

-- datos de ejemplo

INSERT INTO libros (titulo, autor, isbn, anio_publicacion, genero, editorial) VALUES
    ('Cien años de soledad',     'Gabriel García Márquez', '978-0-06-088328-7', 1967, 'Novela',          'Harper Perennial'),
    ('El nombre de la rosa',     'Umberto Eco',            '978-0-15-144647-6', 1980, 'Novela',          'Harcourt'),
    ('Ficciones',                'Jorge Luis Borges',      '978-0-8021-3030-5', 1944, 'Cuento',          'Grove Press'),
    ('Dune',                     'Frank Herbert',          '978-0-441-17271-9', 1965, 'Ciencia Ficción', 'Ace Books'),
    ('Sapiens',                  'Yuval Noah Harari',      '978-0-06-231609-7', 2011, 'Historia',        'Harper Collins'),
    ('Don Quijote de la Mancha', 'Miguel de Cervantes',    '978-0-06-093434-9', 1605, 'Novela',          'Harper Collins'),
    ('1984',                     'George Orwell',          '978-0-451-52493-5', 1949, 'Novela',          'Signet Classic'),
    ('Clean Code',               'Robert C. Martin',       '978-0-13-235088-4', 2008, 'Tecnología',      'Prentice Hall');

INSERT INTO usuarios (nombre, email, telefono) VALUES
    ('Laura Morales',   'laura.morales@email.com',   '3001234567'),
    ('Carlos Herrera',  'carlos.herrera@email.com',  '3109876543'),
    ('Sofia Quintero',  'sofia.quintero@email.com',  '3205551234'),
    ('Andres Castillo', 'andres.castillo@email.com', '3157778899');

-- prestamos de ejemplo
INSERT INTO prestamos (usuario_id, libro_id, fecha_prestamo, fecha_vencimiento, activo)
VALUES (1, 2, CURRENT_DATE - 5, CURRENT_DATE + 10, true),
       (2, 5, CURRENT_DATE - 3, CURRENT_DATE + 12, true),
       (3, 7, CURRENT_DATE - 8, CURRENT_DATE + 7,  true);

-- marcar esos libros como no disponibles
UPDATE libros SET disponible = false WHERE id IN (2, 5, 7);
