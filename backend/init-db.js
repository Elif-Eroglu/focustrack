const fs = require("fs");
const path = require("path");
const pool = require("./db");

async function initDatabase() {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, "init.sql"),
      "utf8"
    );

    await pool.query(sql);

    console.log("Veritabanı tabloları başarıyla hazırlandı.");
  } catch (error) {
    console.error("Veritabanı hazırlanamadı:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

initDatabase();