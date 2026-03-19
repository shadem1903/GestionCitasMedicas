-- ─────────────────────────────────────────────
-- Plataforma de Gestión de Citas Médicas
-- Script de inicialización (desarrollo)
-- ─────────────────────────────────────────────

-- Tabla de usuarios (pacientes y médicos)
CREATE TABLE IF NOT EXISTS usuarios (
  id        SERIAL PRIMARY KEY,
  nombre    VARCHAR(100) NOT NULL,
  email     VARCHAR(150) UNIQUE NOT NULL,
  rol       VARCHAR(20)  NOT NULL CHECK (rol IN ('paciente', 'medico', 'admin')),
  activo    BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Tabla de citas médicas
CREATE TABLE IF NOT EXISTS citas (
  id           SERIAL PRIMARY KEY,
  paciente_id  INTEGER   NOT NULL REFERENCES usuarios(id),
  medico_id    INTEGER   NOT NULL REFERENCES usuarios(id),
  fecha_hora   TIMESTAMP NOT NULL,
  estado       VARCHAR(20) NOT NULL DEFAULT 'programada'
                CHECK (estado IN ('programada', 'cancelada', 'completada')),
  notas        TEXT,
  creado_en    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Datos de prueba
INSERT INTO usuarios (nombre, email, rol) VALUES
  ('Ana Torres',    'ana.torres@demo.com',    'paciente'),
  ('Luis Gómez',    'luis.gomez@demo.com',    'paciente'),
  ('Dra. Martínez', 'martinez@demo.com',      'medico'),
  ('Dr. Hernández', 'hernandez@demo.com',     'medico')
ON CONFLICT (email) DO NOTHING;
