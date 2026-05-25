-- ─────────────────────────────────────────────────────────────
-- Plataforma de Gestión de Citas Médicas
-- Script de inicialización — MySQL 8.0
-- Un schema por microservicio
-- ─────────────────────────────────────────────────────────────

SET NAMES utf8mb4;
SET time_zone = '-05:00';

-- ── Crear una base de datos por servicio
CREATE DATABASE IF NOT EXISTS db_usuarios       CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS db_especialidades CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS db_disponibilidad CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS db_citas          CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS db_historial      CHARACTER SET utf8mb4;

-- ── Permisos al usuario admin sobre cada schema
GRANT ALL PRIVILEGES ON db_usuarios.*        TO 'admin'@'%';
GRANT ALL PRIVILEGES ON db_especialidades.*  TO 'admin'@'%';
GRANT ALL PRIVILEGES ON db_disponibilidad.*  TO 'admin'@'%';
GRANT ALL PRIVILEGES ON db_citas.*           TO 'admin'@'%';
GRANT ALL PRIVILEGES ON db_historial.*       TO 'admin'@'%';
FLUSH PRIVILEGES;

-- ════════════════════════════════════════════════════════════
-- MS-USUARIOS  (db_usuarios)
-- Usado también por ms-auth
-- ════════════════════════════════════════════════════════════
USE db_usuarios;

CREATE TABLE IF NOT EXISTS usuarios (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  nombre            VARCHAR(100) NOT NULL,
  email             VARCHAR(150) NOT NULL UNIQUE,
  password_hash     VARCHAR(255) DEFAULT NULL,
  rol               VARCHAR(20)  NOT NULL,
  especialidad_id   INT          DEFAULT NULL,
  sede              VARCHAR(100) DEFAULT NULL,
  duracion_cita_min INT          DEFAULT 30,
  activo            BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en         TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rol CHECK (rol IN ('paciente', 'medico', 'admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notificaciones (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT NOT NULL,
  mensaje     VARCHAR(255) NOT NULL,
  leida       BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en   TIMESTAMP NOT NULL DEFAULT NOW(),
  INDEX idx_notif_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════
-- MS-ESPECIALIDADES  (db_especialidades)
-- ════════════════════════════════════════════════════════════
USE db_especialidades;

CREATE TABLE IF NOT EXISTS especialidades (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMP    NOT NULL DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════
-- MS-DISPONIBILIDAD  (db_disponibilidad)
-- Las FK a usuarios se eliminan; la validación es via REST
-- ════════════════════════════════════════════════════════════
USE db_disponibilidad;

CREATE TABLE IF NOT EXISTS doctor_schedules (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  medico_id   INT         NOT NULL,
  dia_semana  INT         NOT NULL,  -- 0=Domingo … 6=Sábado
  hora_inicio TIME        NOT NULL,
  hora_fin    TIME        NOT NULL,
  activo      BOOLEAN     NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMP   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_dia       CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT chk_horas_sch CHECK (hora_inicio < hora_fin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS doctor_blocks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  medico_id   INT         NOT NULL,
  fecha       DATE        NOT NULL,
  hora_inicio TIME        DEFAULT NULL,
  hora_fin    TIME        DEFAULT NULL,
  motivo      VARCHAR(255),
  activo      BOOLEAN     NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMP   NOT NULL DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS disponibilidad (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  medico_id       INT       NOT NULL,
  especialidad_id INT       DEFAULT NULL,
  fecha           DATE      NOT NULL,
  hora_inicio     TIME      NOT NULL,
  hora_fin        TIME      NOT NULL,
  activo          BOOLEAN   NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_horas CHECK (hora_inicio < hora_fin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════
-- MS-CITAS  (db_citas)
-- paciente_nombre / medico_nombre se guardan denormalizados
-- para no necesitar JOIN a db_usuarios en las consultas
-- ════════════════════════════════════════════════════════════
USE db_citas;

CREATE TABLE IF NOT EXISTS citas (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  paciente_id     INT          NOT NULL,
  medico_id       INT          NOT NULL,
  paciente_nombre VARCHAR(100) NOT NULL DEFAULT '',
  medico_nombre   VARCHAR(100) NOT NULL DEFAULT '',
  fecha           DATE         NOT NULL,
  hora_inicio     TIME         NOT NULL,
  hora_fin        TIME         NOT NULL,
  estado          VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
  notas           TEXT,
  creado_en       TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_estado     CHECK (estado IN ('pendiente', 'confirmada', 'cancelada', 'completada')),
  CONSTRAINT chk_horas_cita CHECK (hora_inicio < hora_fin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════
-- MS-HISTORIAL  (db_historial)
-- ════════════════════════════════════════════════════════════
USE db_historial;

CREATE TABLE IF NOT EXISTS historial_citas (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  cita_id     INT         NOT NULL,
  paciente_id INT         DEFAULT NULL,
  medico_id   INT         DEFAULT NULL,
  estado      VARCHAR(20) NOT NULL,
  accion      VARCHAR(30) NOT NULL,
  detalle     TEXT,
  fecha       DATE        DEFAULT NULL,
  hora_inicio TIME        DEFAULT NULL,
  hora_fin    TIME        DEFAULT NULL,
  creado_en   TIMESTAMP   NOT NULL DEFAULT NOW(),
  INDEX idx_hist_cita    (cita_id),
  INDEX idx_hist_estado  (estado),
  INDEX idx_hist_creado  (creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- Datos de prueba
-- ─────────────────────────────────────────────────────────────

USE db_especialidades;
INSERT IGNORE INTO especialidades (nombre, descripcion) VALUES
  ('Medicina General', 'Atencion primaria y consultas generales'),
  ('Cardiologia',      'Diagnostico y tratamiento de enfermedades del corazon'),
  ('Pediatria',        'Atencion medica para ninos y adolescentes'),
  ('Dermatologia',     'Enfermedades de la piel, cabello y unas');

USE db_usuarios;
INSERT IGNORE INTO usuarios (nombre, email, rol, especialidad_id, duracion_cita_min) VALUES
  ('Ana Torres',      'ana.torres@demo.com',  'paciente', NULL, NULL),
  ('Luis Gomez',      'luis.gomez@demo.com',  'paciente', NULL, NULL),
  ('Dra. Martinez',   'martinez@demo.com',    'medico',   1,    30),
  ('Dr. Hernandez',   'hernandez@demo.com',   'medico',   2,    30),
  ('Admin Principal', 'admin@demo.com',       'admin',    NULL, NULL);

USE db_disponibilidad;
INSERT IGNORE INTO doctor_schedules (medico_id, dia_semana, hora_inicio, hora_fin) VALUES
  (3, 1, '08:00:00', '12:00:00'),
  (3, 1, '14:00:00', '18:00:00'),
  (3, 2, '09:00:00', '13:00:00'),
  (4, 1, '09:00:00', '13:00:00'),
  (4, 3, '10:00:00', '16:00:00');
