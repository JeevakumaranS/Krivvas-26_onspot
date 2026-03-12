const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const pool = mysql.createPool({
  host: process.env.mysql.railway.internal,
  port: Number(process.env.MYSQLPORT || 3306),
  user: process.env.root,
  password: process.env.xNHUECKNXUZovIBkyWQodAEbKPqCyyxu,
  database: process.env.railway,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

async function initDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS admins (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS events (
      id INT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(255),
      description TEXT,
      venue VARCHAR(255),
      event_date VARCHAR(50),
      event_time VARCHAR(50),
      fee DECIMAL(10, 2) DEFAULT 0,
      is_team_event TINYINT(1) DEFAULT 0,
      min_team_members INT NULL,
      max_team_members INT NULL,
      capacity INT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS registrations (
      id INT PRIMARY KEY AUTO_INCREMENT,
      participant_name VARCHAR(255) NOT NULL,
      team_name VARCHAR(255) NULL,
      college_name VARCHAR(255) NOT NULL,
      department VARCHAR(255),
      year_of_study VARCHAR(255),
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      selected_event_ids JSON NOT NULL,
      team_size INT NULL,
      team_members JSON NULL,
      payment_mode VARCHAR(50) NULL,
      transaction_id VARCHAR(255) NULL,
      payment_notes TEXT,
      payment_proof_path VARCHAR(255) NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      admin_notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  const registrationColumns = await query(`
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'registrations'
  `);
  const registrationColumnNames = new Set(registrationColumns.map((column) => column.COLUMN_NAME));

  if (!registrationColumnNames.has("team_members")) {
    await query("ALTER TABLE registrations ADD COLUMN team_members JSON NULL");
  }

  if (!registrationColumnNames.has("team_name")) {
    await query("ALTER TABLE registrations ADD COLUMN team_name VARCHAR(255) NULL AFTER participant_name");
  }

  const adminRows = await query("SELECT COUNT(*) AS count FROM admins");
  if (adminRows[0].count === 0) {
    const defaultUsername = process.env.ADMIN_USERNAME || "admin";
    const defaultPassword = process.env.ADMIN_PASSWORD || "admin123";
    const passwordHash = bcrypt.hashSync(defaultPassword, 10);
    await execute("INSERT INTO admins (username, password_hash) VALUES (?, ?)", [defaultUsername, passwordHash]);
  }

  const eventRows = await query("SELECT COUNT(*) AS count FROM events");
  if (eventRows[0].count === 0) {
    const defaults = [
      {
        title: "Paper Presentation",
        category: "Technical",
        description: "Present your ideas, prototypes, or research in front of the judging panel.",
        venue: "Seminar Hall A",
        fee: 150,
        is_team_event: 0,
        min_team_members: null,
        max_team_members: null,
        capacity: 80,
        is_active: 1,
      },
      {
        title: "Coding Sprint",
        category: "Technical",
        description: "Rapid-fire programming challenge for individual participants.",
        venue: "Lab 2",
        fee: 200,
        is_team_event: 0,
        min_team_members: null,
        max_team_members: null,
        capacity: 60,
        is_active: 1,
      },
      {
        title: "Design Duel",
        category: "Non-Technical",
        description: "Create visuals and campaigns within a timed design challenge.",
        venue: "Studio Block",
        fee: 100,
        is_team_event: 1,
        min_team_members: 2,
        max_team_members: 5,
        capacity: 50,
        is_active: 1,
      },
    ];

    for (const item of defaults) {
      await execute(
        `INSERT INTO events (
          title, category, description, venue, event_date, event_time, fee, is_team_event,
          min_team_members, max_team_members, capacity, is_active
        ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
        [
          item.title,
          item.category,
          item.description,
          item.venue,
          item.fee,
          item.is_team_event,
          item.min_team_members,
          item.max_team_members,
          item.capacity,
          item.is_active,
        ]
      );
    }
  }
}

module.exports = {
  pool,
  query,
  execute,
  initDatabase,
};
