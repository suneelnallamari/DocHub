const express = require("express");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;

const ROOT = __dirname;
const UPLOADS = path.join(ROOT, "uploads");
const DB_FILE = path.join(ROOT, "database.db");

const sections = {
  "cv-ml": "CV & ML",
  "ssp": "SSP",
  "fsd": "FSD"
};

Object.keys(sections).forEach((section) => {
  fs.mkdirSync(path.join(UPLOADS, section), { recursive: true });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOADS));
app.use(express.static(path.join(ROOT, "public")));

const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      filepath TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    )
  `);
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let category = req.body.category;
    if (!sections[category]) {
      category = "cv-ml";
    }
    cb(null, path.join(UPLOADS, category));
  },
  filename: (req, file, cb) => {
    const safeBase = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80);
    cb(null, `${Date.now()}-${safeBase}.pdf`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      path.extname(file.originalname).toLowerCase() === ".pdf";

    if (!isPdf) return cb(new Error("Only PDF files are allowed."));
    cb(null, true);
  }
});

app.get("/api/documents", (req, res) => {
  const { category } = req.query;

  let sql = `
    SELECT id, name, category, filename, original_name, uploaded_at
    FROM documents
  `;
  const params = [];

  if (category) {
    if (!sections[category]) {
      return res.status(400).json({ error: "Invalid section." });
    }
    sql += " WHERE category = ?";
    params.push(category);
  }

  sql += " ORDER BY id DESC";

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error." });

    const result = rows.map((row) => ({
      ...row,
      category_name: sections[row.category],
      url: `/uploads/${row.category}/${row.filename}`
    }));

    res.json(result);
  });
});

app.post("/api/documents/upload", (req, res) => {
  upload.single("pdf")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Please select a PDF file." });
    }

    let category = req.body.category;
    if (!sections[category]) {
      category = "cv-ml";
    }

    let name = (req.body.name || "").trim();
    if (!name) {
      const orig = req.file.originalname || "Document";
      name = path.basename(orig, path.extname(orig)).replace(/[_-]+/g, " ").trim();
      if (!name) name = "Document";
    }

    const uploadedAt = new Date().toISOString();
    const relativePath = path.relative(ROOT, req.file.path).replace(/\\/g, "/");

    db.run(
      `
      INSERT INTO documents
      (name, category, filename, original_name, filepath, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        name,
        category,
        req.file.filename,
        req.file.originalname,
        relativePath,
        uploadedAt
      ],
      function (dbErr) {
        if (dbErr) {
          try { fs.unlinkSync(req.file.path); } catch (_) {}
          return res.status(500).json({ error: "Could not save document." });
        }

        res.status(201).json({
          message: "PDF uploaded successfully.",
          document: {
            id: this.lastID,
            name,
            category,
            category_name: sections[category],
            original_name: req.file.originalname,
            filename: req.file.filename,
            uploaded_at: uploadedAt,
            url: `/uploads/${category}/${req.file.filename}`
          }
        });
      }
    );
  });
});

app.delete("/api/documents/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid document ID." });
  }

  db.get("SELECT * FROM documents WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: "Database error." });
    if (!row) return res.status(404).json({ error: "Document not found." });

    db.run("DELETE FROM documents WHERE id = ?", [id], (deleteErr) => {
      if (deleteErr) {
        return res.status(500).json({ error: "Could not delete document." });
      }

      const fullPath = path.join(ROOT, row.filepath);
      fs.unlink(fullPath, (fileErr) => {
        if (fileErr && fileErr.code !== "ENOENT") {
          console.error("File deletion warning:", fileErr.message);
        }
        res.json({ message: "Document deleted successfully." });
      });
    });
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Document Hub is running." });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Document Hub running on port ${PORT}`);
});
