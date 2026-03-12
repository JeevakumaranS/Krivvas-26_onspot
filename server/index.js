
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const ExcelJS = require("exceljs");
const { initDatabase } = require("./db");

initDatabase()
  .then(() => console.log("Database ready"))
  .catch(console.error);
const db = require("./src/db");
const { requireAdmin } = require("./middleware/auth");
const { mapRegistrationRow } = require("./src/utils");

const app = express();
const port = process.env.PORT || 4000;
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const uploadsDir = path.join(__dirname, "uploads");
const phonePattern = /^\d{10}$/;

fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadsDir),
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, "-");
    callback(null, `${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.use(
  cors({
    origin: clientUrl,
  })
);
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

function mapEventRow(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    venue: row.venue,
    fee: Number(row.fee || 0),
    isTeamEvent: Boolean(row.is_team_event),
    minTeamMembers: row.min_team_members,
    maxTeamMembers: row.max_team_members,
    capacity: row.capacity,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildSheetName(title, usedNames) {
  const sanitizedTitle = String(title || "Event")
    .replace(/[\\/*?:[\]]/g, "")
    .trim();
  const baseName = (sanitizedTitle || "Event").slice(0, 31);

  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }

  let suffix = 2;
  while (suffix < 1000) {
    const nextName = `${baseName.slice(0, 31 - String(suffix).length - 1)}-${suffix}`;
    if (!usedNames.has(nextName)) {
      usedNames.add(nextName);
      return nextName;
    }
    suffix += 1;
  }

  return `Event-${Date.now()}`.slice(0, 31);
}

async function getActiveEvents() {
  const rows = await db.query(
    `SELECT id, title, category, description, venue, fee,
            is_team_event, min_team_members, max_team_members, capacity, is_active
     FROM events
     WHERE is_active = 1
     ORDER BY title ASC`
  );

  return rows.map(mapEventRow);
}

async function getEventLookup() {
  const rows = await db.query(
    `SELECT id, title, category, venue, fee, is_team_event, min_team_members, max_team_members
     FROM events`
  );

  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        title: row.title,
        category: row.category,
        venue: row.venue,
        fee: Number(row.fee || 0),
        isTeamEvent: Boolean(row.is_team_event),
        minTeamMembers: row.min_team_members,
        maxTeamMembers: row.max_team_members,
      },
    ])
  );
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/public/events", async (_req, res, next) => {
  try {
    res.json(await getActiveEvents());
  } catch (error) {
    next(error);
  }
});

app.post("/api/public/register", upload.single("paymentProof"), async (req, res, next) => {
  try {
    const {
      participantName,
      teamName,
      collegeName,
      department,
      phone,
      selectedEventIds,
      teamSize,
      teamMembers,
      transactionId,
      paymentNotes,
    } = req.body;

    let parsedEventIds = [];
    try {
      parsedEventIds = JSON.parse(selectedEventIds || "[]");
    } catch (_error) {
      parsedEventIds = [];
    }

    if (
      !participantName ||
      !collegeName ||
      !department ||
      !phone ||
      !Array.isArray(parsedEventIds) ||
      parsedEventIds.length === 0
    ) {
      return res.status(400).json({ message: "Name, college name, department, mobile number, and at least one event are required." });
    }

    if (!phonePattern.test(String(phone || "").trim())) {
      return res.status(400).json({ message: "Mobile number must be exactly 10 digits." });
    }

    const selectedEventRows = await db.query(
      `SELECT id, fee, is_team_event, min_team_members, max_team_members
       FROM events
       WHERE id = ? AND is_active = 1`,
      [parsedEventIds[0]]
    );

    if (selectedEventRows.length === 0) {
      return res.status(400).json({ message: "Selected event is invalid or inactive." });
    }

    const selectedEvent = selectedEventRows[0];
    const numericTeamSize = Number(teamSize || 0);
    let parsedTeamMembers = [];

    try {
      parsedTeamMembers = JSON.parse(teamMembers || "[]");
    } catch (_error) {
      parsedTeamMembers = [];
    }

    if (selectedEvent.is_team_event) {
      if (!String(teamName || "").trim()) {
        return res.status(400).json({ message: "Team name is required for team events." });
      }

      if (!Number.isInteger(numericTeamSize)) {
        return res.status(400).json({ message: "Enter a valid team size for team events." });
      }

      if (
        numericTeamSize < Number(selectedEvent.min_team_members || 1) ||
        numericTeamSize > Number(selectedEvent.max_team_members || numericTeamSize)
      ) {
        return res.status(400).json({
          message: `Team size must be between ${selectedEvent.min_team_members} and ${selectedEvent.max_team_members}.`,
        });
      }

      if (!Array.isArray(parsedTeamMembers) || parsedTeamMembers.length !== numericTeamSize - 1) {
        return res.status(400).json({ message: "Enter all additional team member details." });
      }

      const hasInvalidMember = parsedTeamMembers.some((member) => {
        return !member?.name || !phonePattern.test(String(member?.phone || "").trim()) || !member?.collegeName || !member?.department;
      });

      if (hasInvalidMember) {
        return res.status(400).json({ message: "Each team member must have name, 10-digit mobile number, college name, and department." });
      }
    }

    const fullTeamMembers = [
      {
        name: participantName,
        phone,
        collegeName,
        department,
        isLeader: true,
      },
      ...parsedTeamMembers.map((member) => ({
        name: member.name,
        phone: member.phone,
        collegeName: member.collegeName,
        department: member.department,
        isLeader: false,
      })),
    ];

    const result = await db.execute(
      `INSERT INTO registrations (
        participant_name, team_name, college_name, department, year_of_study, email, phone,
        selected_event_ids, team_size, team_members, transaction_id, payment_notes, payment_proof_path, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        participantName,
        selectedEvent.is_team_event ? String(teamName || "").trim() : null,
        collegeName,
        department,
        "",
        "",
        phone,
        JSON.stringify(parsedEventIds),
        selectedEvent.is_team_event ? numericTeamSize : 1,
        JSON.stringify(fullTeamMembers),
        transactionId || "",
        paymentNotes || "",
        req.file?.filename || null,
      ]
    );

    res.status(201).json({
      message: "Registration submitted. Awaiting payment verification.",
      registrationId: result.insertId,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required." });
    }

    const rows = await db.query("SELECT * FROM admins WHERE username = ?", [username]);
    const admin = rows[0];

    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const token = jwt.sign(
      { adminId: admin.id, username: admin.username },
      process.env.JWT_SECRET || "onspot-secret",
      { expiresIn: "12h" }
    );

    res.json({
      token,
      admin: {
        id: admin.id,
        username: admin.username,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/events", requireAdmin, async (_req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT id, title, category, description, venue, fee, is_team_event, min_team_members,
              max_team_members, capacity, is_active, created_at, updated_at
       FROM events
       ORDER BY title ASC`
    );

    res.json(rows.map(mapEventRow));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/events", requireAdmin, async (req, res, next) => {
  try {
    const { title, description, venue, fee, isTeamEvent, minTeamMembers, maxTeamMembers, isActive } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Event name is required." });
    }

    if (isTeamEvent && (!minTeamMembers || !maxTeamMembers || Number(minTeamMembers) > Number(maxTeamMembers))) {
      return res.status(400).json({ message: "Team events require valid minimum and maximum team members." });
    }

    const result = await db.execute(
      `INSERT INTO events (
        title, category, description, venue, event_date, event_time, fee, is_team_event,
        min_team_members, max_team_members, capacity, is_active
      ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        "",
        description || "",
        venue || "",
        Number(fee || 0),
        isTeamEvent ? 1 : 0,
        isTeamEvent ? Number(minTeamMembers) : null,
        isTeamEvent ? Number(maxTeamMembers) : null,
        null,
        isActive ? 1 : 0,
      ]
    );

    res.status(201).json({ id: result.insertId });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/events/:id", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, venue, fee, isTeamEvent, minTeamMembers, maxTeamMembers, isActive } = req.body;

    await db.execute(
      `UPDATE events
       SET title = ?, category = ?, description = ?, venue = ?, event_date = NULL, event_time = NULL,
           fee = ?, is_team_event = ?, min_team_members = ?, max_team_members = ?,
           capacity = ?, is_active = ?
       WHERE id = ?`,
      [
        title,
        "",
        description || "",
        venue || "",
        Number(fee || 0),
        isTeamEvent ? 1 : 0,
        isTeamEvent ? Number(minTeamMembers) : null,
        isTeamEvent ? Number(maxTeamMembers) : null,
        null,
        isActive ? 1 : 0,
        id,
      ]
    );

    res.json({ message: "Event updated." });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/events/:id", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.execute("DELETE FROM events WHERE id = ?", [id]);
    res.json({ message: "Event deleted." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/registrations", requireAdmin, async (_req, res, next) => {
  try {
    const rows = await db.query("SELECT * FROM registrations ORDER BY created_at DESC");
    const eventLookup = await getEventLookup();
    res.json(rows.map((row) => mapRegistrationRow(row, eventLookup)));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/registrations/:id/status", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, adminNotes, transactionId, paymentMode } = req.body;

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ message: "Invalid registration status." });
    }

    if (paymentMode && !["cash", "upi"].includes(paymentMode)) {
      return res.status(400).json({ message: "Payment mode must be cash or UPI." });
    }

    if (status === "approved" && !paymentMode) {
      return res.status(400).json({ message: "Select cash or UPI before approving." });
    }

    if (status === "approved" && paymentMode === "upi" && !String(transactionId || "").trim()) {
      return res.status(400).json({ message: "Transaction ID is required for UPI approvals." });
    }

    await db.execute(
      `UPDATE registrations
       SET status = ?, admin_notes = ?, payment_mode = ?, transaction_id = ?
       WHERE id = ?`,
      [status, adminNotes || "", paymentMode || null, String(transactionId || "").trim(), id]
    );

    res.json({ message: "Registration status updated." });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/registrations/:id", requireAdmin, async (req, res, next) => {
  try {
    if (req.admin?.username !== "jeeva@admin") {
      return res.status(403).json({ message: "Only jeeva@admin can remove participants." });
    }

    const { id } = req.params;
    await db.execute("DELETE FROM registrations WHERE id = ?", [id]);
    res.json({ message: "Registration removed." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/dashboard", requireAdmin, async (_req, res, next) => {
  try {
    const totalRows = await db.query("SELECT COUNT(*) AS count FROM registrations");
    const pendingRows = await db.query("SELECT COUNT(*) AS count FROM registrations WHERE status = 'pending'");
    const approvedRows = await db.query("SELECT COUNT(*) AS count FROM registrations WHERE status = 'approved'");
    const rejectedRows = await db.query("SELECT COUNT(*) AS count FROM registrations WHERE status = 'rejected'");
    const countRows = await db.query(
      `SELECT e.id, e.title, COUNT(r.id) AS registrations
       FROM events e
       LEFT JOIN registrations r
         ON JSON_CONTAINS(r.selected_event_ids, JSON_ARRAY(e.id))
       GROUP BY e.id, e.title
       ORDER BY registrations DESC, e.title ASC`
    );

    res.json({
      totals: {
        totalParticipants: totalRows[0].count,
        pendingPayments: pendingRows[0].count,
        approvedCount: approvedRows[0].count,
        rejectedCount: rejectedRows[0].count,
      },
      eventCounts: countRows.map((row) => ({
        id: row.id,
        title: row.title,
        registrations: Number(row.registrations || 0),
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/export", requireAdmin, async (req, res, next) => {
  try {
    const rows = await db.query("SELECT * FROM registrations ORDER BY created_at DESC");
    const eventLookup = await getEventLookup();
    const exportMode = req.query.mode === "approved" ? "approved" : "all";
    const registrations = rows
      .map((row) => mapRegistrationRow(row, eventLookup))
      .filter((registration) => (exportMode === "approved" ? registration.status === "approved" : true));
    const registrationsByEvent = new Map();

    registrations.forEach((registration) => {
      registration.selectedEvents.forEach((event) => {
        if (!registrationsByEvent.has(event.id)) {
          registrationsByEvent.set(event.id, {
            event,
            registrations: [],
          });
        }

        registrationsByEvent.get(event.id).registrations.push(registration);
      });
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Onspot Registration";
    workbook.created = new Date();

    const usedSheetNames = new Set();
    const sheetEntries = Array.from(registrationsByEvent.values()).sort((left, right) =>
      left.event.title.localeCompare(right.event.title)
    );

    if (sheetEntries.length === 0) {
      const sheet = workbook.addWorksheet("Registrations");
      sheet.columns = [{ header: "Message", key: "message", width: 40 }];
      sheet.addRow({ message: "No registrations available." });
    }

    sheetEntries.forEach(({ event, registrations: eventRegistrations }) => {
      const worksheet = workbook.addWorksheet(buildSheetName(event.title, usedSheetNames));

      worksheet.columns = [
        { header: "Team Name", key: "teamName", width: 24 },
        { header: "Name", key: "name", width: 26 },
        { header: "Department", key: "department", width: 22 },
        { header: "College Name", key: "collegeName", width: 28 },
        { header: "Mobile Number", key: "phone", width: 18 },
        ...(exportMode === "all"
          ? [
              { header: "Application Status", key: "status", width: 18 },
              { header: "Payment Mode", key: "paymentMode", width: 18 },
              { header: "Transaction ID", key: "transactionId", width: 22 },
            ]
          : []),
      ];

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

      eventRegistrations.forEach((registration) => {
        const members = registration.teamMembers?.length
          ? registration.teamMembers
          : [
              {
                name: registration.participantName,
                department: registration.department,
                collegeName: registration.collegeName,
                phone: registration.phone,
              },
            ];

        members.forEach((member) => {
          worksheet.addRow({
            teamName: registration.teamName || "",
            name: member.name || "",
            department: member.department || registration.department || "",
            collegeName: member.collegeName || registration.collegeName || "",
            phone: member.phone || registration.phone || "",
            status: registration.status || "",
            paymentMode: registration.paymentMode || "",
            transactionId: registration.transactionId || "",
          });
        });
      });

      worksheet.eachRow((row, rowNumber) => {
        row.alignment = { vertical: "top", wrapText: true };

        if (rowNumber > 1) {
          row.height = 32;
        }
      });

      worksheet.views = [{ state: "frozen", ySplit: 1 }];
      worksheet.autoFilter = {
        from: "A1",
        to: exportMode === "all" ? "H1" : "E1",
      };
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${exportMode === "approved" ? "approved-registrations.xlsx" : "all-registrations.xlsx"}`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ message: error.message });
  }

  console.error(error);
  return res.status(500).json({ message: "Internal server error." });
});

async function start() {
  await db.initDatabase();

  if (require.main === module) {
    app.listen(port, () => {
      console.log(`Onspot server listening on http://localhost:${port}`);
    });
  }
}

start().catch((error) => {
  console.error("Failed to initialize database:", error);
  process.exit(1);
});

module.exports = app;
