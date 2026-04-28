-- ─────────────────────────────────────────────────────────────
-- Plataforma de Gestión de Citas Médicas
-- Script de inicialización — MySQL 8.0
-- ─────────────────────────────────────────────────────────────

SET NAMES utf8mb4;
SET time_zone = '-05:00';

-- ── MS-1: Tabla de usuarios (pacientes, médicos y admin)
CREATE TABLE IF NOT EXISTS usuarios (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(100) NOT NULL,
  email     VARCHAR(150) NOT NULL UNIQUE,
  rol       VARCHAR(20)  NOT NULL,
  activo    BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rol CHECK (rol IN ('paciente', 'medico', 'admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── MS-7: Catálogo de especialidades médicas
CREATE TABLE IF NOT EXISTS especialidades (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMP    NOT NULL DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── MS-3: Bloques de disponibilidad de médicos
CREATE TABLE IF NOT EXISTS disponibilidad (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  medico_id       INT       NOT NULL,
  especialidad_id INT       DEFAULT NULL,
  fecha           DATE      NOT NULL,
  hora_inicio     TIME      NOT NULL,
  hora_fin        TIME      NOT NULL,
  activo          BOOLEAN   NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_horas CHECK (hora_inicio < hora_fin),
  CONSTRAINT fk_disp_esp FOREIGN KEY (especialidad_id) REFERENCES especialidades(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── MS-4: Tabla de citas médicas
CREATE TABLE IF NOT EXISTS citas (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  paciente_id  INT         NOT NULL,
  medico_id    INT         NOT NULL,
  fecha_hora   DATETIME    NOT NULL,
  estado       VARCHAR(20) NOT NULL DEFAULT 'programada',
  notas        TEXT,
  creado_en    TIMESTAMP   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_estado CHECK (estado IN ('programada', 'cancelada', 'completada')),
  CONSTRAINT fk_cita_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios(id),
  CONSTRAINT fk_cita_medico   FOREIGN KEY (medico_id)   REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- Datos de prueba
-- ─────────────────────────────────────────────────────────────

INSERT IGNORE INTO usuarios (nombre, email, rol) VALUES
  ('Ana Torres',      'ana.torres@demo.com',  'paciente'),
  ('Luis Gómez',      'luis.gomez@demo.com',  'paciente'),
  ('Dra. Martínez',   'martinez@demo.com',    'medico'),
  ('Dr. Hernández',   'hernandez@demo.com',   'medico'),
  ('Admin Principal', 'admin@demo.com',       'admin');

INSERT IGNORE INTO especialidades (nombre, descripcion) VALUES
  ('Medicina General', 'Atención primaria y consultas generales'),
  ('Cardiología',      'Diagnóstico y tratamiento de enfermedades del corazón'),
  ('Pediatría',        'Atención médica para niños y adolescentes'),
  ('Dermatología',     'Enfermedades de la piel, cabello y uñas');

INSERT INTO disponibilidad (medico_id, especialidad_id, fecha, hora_inicio, hora_fin) VALUES
  (3, 1, CURDATE(),                              '08:00:00', '12:00:00'),
  (3, 1, CURDATE(),                              '14:00:00', '18:00:00'),
  (3, 1, DATE_ADD(CURDATE(), INTERVAL 1 DAY),    '08:00:00', '13:00:00'),
  (4, 2, CURDATE(),                              '09:00:00', '13:00:00'),
  (4, 2, DATE_ADD(CURDATE(), INTERVAL 1 DAY),    '10:00:00', '16:00:00');
