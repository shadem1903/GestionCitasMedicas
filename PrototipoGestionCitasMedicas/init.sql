-- ─────────────────────────────────────────────────────────────
-- Plataforma de Gestión de Citas Médicas
-- Script de inicialización (desarrollo)
-- ─────────────────────────────────────────────────────────────

-- ── MS-1: Tabla de usuarios (pacientes, médicos y admin)
CREATE TABLE IF NOT EXISTS usuarios (
  id        SERIAL PRIMARY KEY,
  nombre    VARCHAR(100) NOT NULL,
  email     VARCHAR(150) UNIQUE NOT NULL,
  rol       VARCHAR(20)  NOT NULL CHECK (rol IN ('paciente', 'medico', 'admin')),
  activo    BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ── MS-7: Catálogo de especialidades médicas
CREATE TABLE IF NOT EXISTS especialidades (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ── MS-3: Bloques de disponibilidad de médicos
CREATE TABLE IF NOT EXISTS disponibilidad (
  id              SERIAL PRIMARY KEY,
  medico_id       INTEGER   NOT NULL,
  especialidad_id INTEGER   REFERENCES especialidades(id),
  fecha           DATE      NOT NULL,
  hora_inicio     TIME      NOT NULL,
  hora_fin        TIME      NOT NULL,
  activo          BOOLEAN   NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (hora_inicio < hora_fin)
);

-- ── MS-4: Tabla de citas médicas
CREATE TABLE IF NOT EXISTS citas (
  id           SERIAL PRIMARY KEY,
  paciente_id  INTEGER     NOT NULL REFERENCES usuarios(id),
  medico_id    INTEGER     NOT NULL REFERENCES usuarios(id),
  fecha_hora   TIMESTAMP   NOT NULL,
  estado       VARCHAR(20) NOT NULL DEFAULT 'programada'
                CHECK (estado IN ('programada', 'cancelada', 'completada')),
  notas        TEXT,
  creado_en    TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- Datos de prueba
-- ─────────────────────────────────────────────────────────────

-- Usuarios
INSERT INTO usuarios (nombre, email, rol) VALUES
  ('Ana Torres',       'ana.torres@demo.com',    'paciente'),
  ('Luis Gómez',       'luis.gomez@demo.com',    'paciente'),
  ('Dra. Martínez',    'martinez@demo.com',      'medico'),
  ('Dr. Hernández',    'hernandez@demo.com',     'medico'),
  ('Admin Principal',  'admin@demo.com',         'admin')
ON CONFLICT (email) DO NOTHING;

-- Especialidades
INSERT INTO especialidades (nombre, descripcion) VALUES
  ('Medicina General',  'Atención primaria y consultas generales'),
  ('Cardiología',       'Diagnóstico y tratamiento de enfermedades del corazón'),
  ('Pediatría',         'Atención médica para niños y adolescentes'),
  ('Dermatología',      'Enfermedades de la piel, cabello y uñas')
ON CONFLICT (nombre) DO NOTHING;

-- Disponibilidad (bloques para los médicos de prueba — hoy y mañana)
INSERT INTO disponibilidad (medico_id, especialidad_id, fecha, hora_inicio, hora_fin) VALUES
  (3, 1, CURRENT_DATE,       '08:00', '12:00'),
  (3, 1, CURRENT_DATE,       '14:00', '18:00'),
  (3, 1, CURRENT_DATE + 1,   '08:00', '13:00'),
  (4, 2, CURRENT_DATE,       '09:00', '13:00'),
  (4, 2, CURRENT_DATE + 1,   '10:00', '16:00');
