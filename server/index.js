import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { initializeDatabase } from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

/*
  DATABASE INITIALIZATION
*/
let databaseReady = false;

try {
  await initializeDatabase();
  databaseReady = true;
  console.log("✅ Peacely PostgreSQL database is ready");
} catch (error) {
  console.error("❌ Database initialization failed:", error);
}

/*
  HEALTH CHECK
*/
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    application: "Peacely",
    database: databaseReady ? "connected" : "failed",
    message: databaseReady
      ? "Peacely API and database are working successfully"
      : "Peacely API is running but database initialization failed",
  });
});

/*
  API ROOT
*/
app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to Peacely API",
  });
});

/*
  SERVE REACT FRONTEND
*/
const distPath = path.join(__dirname, "../dist");

app.use(express.static(distPath));

/*
  REACT ROUTING FALLBACK
*/
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

/*
  START SERVER
*/
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Peacely server running on port ${PORT}`);
  console.log(`🌐 Port: ${PORT}`);
});
