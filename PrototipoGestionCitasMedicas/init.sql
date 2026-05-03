-- ─────────────────────────────────────────────────────────────
-- Plataforma de Gestión de Citas Médicas
-- Script de inicialización — MySQL 8.0
-- ─────────────────────────────────────────────────────────────

SET NAMES utf8mb4;
SET time_zone = '-05:00';

-- ── MS-1: Tabla de usuarios (pacientes, médicos y admin)
CREATE TABLE IF NOT EXISTS usuarios (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  nombre               VARCHAR(100) NOT NULL,
  email                VARCHAR(150) NOT NULL UNIQUE,
  rol                  VARCHAR(20)  NOT NULL,
  especialidad_id      INT          DEFAULT NULL,
  sede                 VARCHAR(100) DEFAULT NULL,
  duracion_cita_min    INT          DEFAULT 30,  -- duración estándar en minutos
  activo               BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en            TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rol CHECK (rol IN ('paciente', 'medico', 'admin')),
  CONSTRAINT fk_user_esp FOREIGN KEY (especialidad_id) REFERENCES especialidades(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── MS-7: Catálogo de especialidades médicas
CREATE TABLE IF NOT EXISTS especialidades (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMP    NOT NULL DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── MS-3: Horarios semanales de médicos
CREATE TABLE IF NOT EXISTS doctor_schedules (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  medico_id   INT         NOT NULL,
  dia_semana  INT         NOT NULL,  -- 0=Domingo, 1=Lunes, ..., 6=Sábado
  hora_inicio TIME        NOT NULL,
  hora_fin    TIME        NOT NULL,
  activo      BOOLEAN     NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMP   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_dia CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT chk_horas_sched CHECK (hora_inicio < hora_fin),
  CONSTRAINT fk_sched_med FOREIGN KEY (medico_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── MS-3: Bloqueos o ausencias de médicos
CREATE TABLE IF NOT EXISTS doctor_blocks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  medico_id   INT         NOT NULL,
  fecha       DATE        NOT NULL,
  hora_inicio TIME        DEFAULT NULL,
  hora_fin    TIME        DEFAULT NULL,
  motivo      VARCHAR(255),
  activo      BOOLEAN     NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMP   NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_block_med FOREIGN KEY (medico_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── MS-3: Bloques de disponibilidad de médicos (generados dinámicamente)
CREATE TABLE IF NOT EXISTS disponibilidad (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  medico_id       INT       NOT NULL,
  fecha           DATE      NOT NULL,
  hora_inicio     TIME      NOT NULL,
  hora_fin        TIME      NOT NULL,
  activo          BOOLEAN   NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_horas CHECK (hora_inicio < hora_fin),
  CONSTRAINT fk_disp_med FOREIGN KEY (medico_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── MS-4: Tabla de citas médicas
CREATE TABLE IF NOT EXISTS citas (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  paciente_id  INT         NOT NULL,
  medico_id    INT         NOT NULL,
  fecha        DATE        NOT NULL,
  hora_inicio  TIME        NOT NULL,
  hora_fin     TIME        NOT NULL,
  estado       VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  notas        TEXT,
  creado_en    TIMESTAMP   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_estado CHECK (estado IN ('pendiente', 'confirmada', 'cancelada', 'completada')),
  CONSTRAINT chk_horas_cita CHECK (hora_inicio < hora_fin),
  CONSTRAINT fk_cita_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios(id),
  CONSTRAINT fk_cita_medico   FOREIGN KEY (medico_id)   REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- MS-5: Historial independiente de eventos de citas
CREATE TABLE IF NOT EXISTS historial_citas (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  cita_id      INT         NOT NULL,
  paciente_id  INT         DEFAULT NULL,
  medico_id    INT         DEFAULT NULL,
  estado       VARCHAR(20) NOT NULL,
  accion       VARCHAR(30) NOT NULL,
  detalle      TEXT,
  fecha        DATE        DEFAULT NULL,
  hora_inicio  TIME        DEFAULT NULL,
  hora_fin     TIME        DEFAULT NULL,
  creado_en    TIMESTAMP   NOT NULL DEFAULT NOW(),
  INDEX idx_hist_cita (cita_id),
  INDEX idx_hist_estado (estado),
  INDEX idx_hist_creado (creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- Datos de prueba
-- ─────────────────────────────────────────────────────────────

INSERT IGNORE INTO usuarios (nombre, email, rol, especialidad_id, duracion_cita_min) VALUES
  ('Ana Torres',      'ana.torres@demo.com',  'paciente', NULL, NULL),
  ('Luis Gómez',      'luis.gomez@demo.com',  'paciente', NULL, NULL),
  ('Dra. Martínez',   'martinez@demo.com',    'medico', 1, 30),
  ('Dr. Hernández',   'hernandez@demo.com',   'medico', 2, 30),
  ('Admin Principal', 'admin@demo.com',       'admin', NULL, NULL);

INSERT IGNORE INTO especialidades (nombre, descripcion) VALUES
  ('Medicina General', 'Atención primaria y consultas generales'),
  ('Cardiología',      'Diagnóstico y tratamiento de enfermedades del corazón'),
  ('Pediatría',        'Atención médica para niños y adolescentes'),
  ('Dermatología',     'Enfermedades de la piel, cabello y uñas');

INSERT INTO doctor_schedules (medico_id, dia_semana, hora_inicio, hora_fin) VALUES
  (3, 1, '08:00:00', '12:00:00'),  -- Lunes
  (3, 1, '14:00:00', '18:00:00'),  -- Lunes
  (3, 2, '09:00:00', '13:00:00'),  -- Martes
  (4, 1, '09:00:00', '13:00:00'),  -- Lunes
  (4, 3, '10:00:00', '16:00:00');  -- Miércoles


