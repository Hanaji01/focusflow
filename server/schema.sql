-- FocusFlow AI — schema del database (MySQL 8 / MariaDB 10.5+)
-- Le tabelle vengono create solo se non esistono: lo script si può rilanciare senza perdere dati.

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(40)  NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tasks (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  title      VARCHAR(200) NOT NULL,
  category   ENUM('lavoro','casa','studio','salute','personale') NOT NULL DEFAULT 'personale',
  priority   ENUM('alta','media','bassa') NOT NULL DEFAULT 'media',
  task_type  ENUM('evento','scadenza') NOT NULL DEFAULT 'evento',
  due_date   DATE NOT NULL,
  created_on DATE NOT NULL,
  done       TINYINT(1) NOT NULL DEFAULT 0,
  done_on    DATE NULL,
  deleted_at DATETIME NULL,              -- eliminazione "morbida": la riga resta per lo storico
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tasks_user_due (user_id, deleted_at, due_date),
  CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subtasks (
  id       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id  BIGINT UNSIGNED NOT NULL,
  title    VARCHAR(200) NOT NULL,
  done     TINYINT(1) NOT NULL DEFAULT 0,
  position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  KEY idx_subtasks_task (task_id, position),
  CONSTRAINT fk_subtasks_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Un fiore per giornata e per utente
CREATE TABLE IF NOT EXISTS flowers (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          INT UNSIGNED NOT NULL,
  flower_date      DATE NOT NULL,
  kind             ENUM('normal','rest') NOT NULL DEFAULT 'normal',
  petals_total     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  petals_completed SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  bonus_petals     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  delivered_by_cat TINYINT(1) NOT NULL DEFAULT 0,   -- il gattino ha già consegnato il fiore
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_flowers_user_date (user_id, flower_date),
  CONSTRAINT fk_flowers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Storico di riprogrammazioni ed eliminazioni (to_date è NULL se il task è stato eliminato)
CREATE TABLE IF NOT EXISTS task_reschedules (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id    BIGINT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  action     ENUM('postponed','deleted') NOT NULL,
  from_date  DATE NOT NULL,
  to_date    DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_resched_user (user_id, created_at),
  CONSTRAINT fk_resched_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_resched_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Misure tecniche (tempi del modello, latenza API…): nessun testo dei task
CREATE TABLE IF NOT EXISTS telemetry_logs (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  metric     VARCHAR(40) NOT NULL,
  value      DOUBLE NULL,
  meta       TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tel_metric (metric, created_at),
  CONSTRAINT fk_tel_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
