const express = require("express");
const multer = require("multer");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 5000;

const sections = {
  "cv-ml": "CV & ML",
  "ssp": "SSP",
  "fsd": "FSD"
};

// ---- Cloudinary (file storage) ----
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ---- Postgres (metadata storage) ----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      original_name TEXT NOT NULL,
      public_id TEXT NOT NULL,
      url TEXT NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Files are received in memory, then streamed to Cloudinary (no local disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      path.extname(file.originalname).toLowerCase() === ".pdf";
    if (!isPdf) return cb(new Error("Only PDF files are allowed."));
    cb(null, true);
  }
});

function uploadBufferToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "raw", folder: `dochub/${folder}`, format: "pdf" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

app.get("/api/documents", async (req, res) => {
  try {
    const { category } = req.query;
    let sql = "SELECT * FROM documents";
    const params = [];

    if (category) {
      if (!sections[category]) {
        return res.status(400).json({ error: "Invalid section." });
      }
      sql += " WHERE category = $1";
      params.push(category);
    }
    sql += " ORDER BY id DESC";

    const { rows } = await pool.query(sql, params);
    const result = rows.map((row) => ({
      ...row,
      category_name: sections[row.category]
    }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error." });
  }
});

app.post("/api/documents/upload", (req, res) => {
  upload.single("pdf")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Please select a PDF file." });

    let category = req.body.category;
    if (!sections[category]) category = "cv-ml";

    let name = (req.body.name || "").trim();
    if (!name) {
      const orig = req.file.originalname || "Document";
      name = path.basename(orig, path.extname(orig)).replace(/[_-]+/g, " ").trim();
      if (!name) name = "Document";
    }

    try {
      const result = await uploadBufferToCloudinary(req.file.buffer, category);

      const { rows } = await pool.query(
        `INSERT INTO documents (name, category, original_name, public_id, url)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, category, req.file.originalname, result.public_id, result.secure_url]
      );

      const doc = rows[0];
      res.status(201).json({
        message: "PDF uploaded successfully.",
        document: { ...doc, category_name: sections[category] }
      });
    } catch (uploadErr) {
      console.error(uploadErr);
      res.status(500).json({ error: "Could not save document." });
    }
  });
});

app.delete("/api/documents/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid document ID." });
  }

  try {
    const { rows } = await pool.query("SELECT * FROM documents WHERE id = $1", [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: "Document not found." });

    await pool.query("DELETE FROM documents WHERE id = $1", [id]);

    try {
      await cloudinary.uploader.destroy(row.public_id, { resource_type: "raw" });
    } catch (fileErr) {
      console.error("Cloudinary deletion warning:", fileErr.message);
    }

    res.json({ message: "Document deleted successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error." });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Document Hub is running." });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

initDb()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Document Hub running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
