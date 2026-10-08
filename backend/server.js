const redisClient = require("./redis");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const pool = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({
      message: "Token gerekli",
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Token gerekli",
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (error, user) => {
    if (error) {
      return res.status(403).json({
        message: "Geçersiz veya süresi dolmuş token",
      });
    }

    req.user = user;
    next();
  });
}

app.get("/", (req, res) => {
  res.json({
    message: "FocusTrack API çalışıyor",
  });
});

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      message: "PostgreSQL bağlantısı başarılı",
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Veritabanı bağlantısı başarısız",
    });
  }
});

app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Tüm alanlar zorunludur",
      });
    }

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        message: "Bu e-posta zaten kayıtlı",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name, email, hashedPassword]
    );

    res.status(201).json({
      message: "Kullanıcı başarıyla oluşturuldu",
      user: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Kayıt işlemi başarısız",
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "E-posta ve şifre zorunludur",
      });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "E-posta veya şifre hatalı",
      });
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "E-posta veya şifre hatalı",
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.json({
      message: "Giriş başarılı",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Giriş işlemi başarısız",
    });
  }
});

app.get("/tasks", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM tasks
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Görevler alınamadı",
    });
  }
});

app.post("/tasks", authenticateToken, async (req, res) => {
  try {
    const {
      title,
      description,
      status,
      priority,
      due_date,
    } = req.body;

    if (!title) {
      return res.status(400).json({
        message: "Görev başlığı zorunludur",
      });
    }

    const result = await pool.query(
      `INSERT INTO tasks
       (user_id, title, description, status, priority, due_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.user.userId,
        title,
        description || null,
        status || "To Do",
        priority || "Medium",
        due_date || null,
      ]
    );

    res.status(201).json({
      message: "Görev oluşturuldu",
      task: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Görev oluşturulamadı",
    });
  }
});

app.put("/tasks/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const {
      title,
      description,
      status,
      priority,
      due_date,
    } = req.body;

    const result = await pool.query(
      `UPDATE tasks
       SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         status = COALESCE($3, status),
         priority = COALESCE($4, priority),
         due_date = COALESCE($5, due_date)
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [
        title,
        description,
        status,
        priority,
        due_date,
        id,
        req.user.userId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Görev bulunamadı",
      });
    }

    res.json({
      message: "Görev güncellendi",
      task: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Görev güncellenemedi",
    });
  }
});

app.delete("/tasks/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM tasks
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Görev bulunamadı",
      });
    }

    res.json({
      message: "Görev silindi",
      task: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Görev silinemedi",
    });
  }
});

//* ---------------- FOCUS TIMER ---------------- */

app.post("/focus/start/:taskId", authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.userId;

    const taskResult = await pool.query(
      "SELECT * FROM tasks WHERE id = $1 AND user_id = $2",
      [taskId, userId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({
        message: "Görev bulunamadı",
      });
    }

    const focusKey = `focus:user:${userId}`;

    const existingFocus = await redisClient.get(focusKey);

    if (existingFocus) {
      return res.status(400).json({
        message: "Zaten aktif bir odak oturumun var",
      });
    }

    const sessionResult = await pool.query(
      `INSERT INTO focus_sessions
       (user_id, task_id, started_at)
       VALUES ($1, $2, NOW())
       RETURNING *`,
      [userId, taskId]
    );

    const session = sessionResult.rows[0];

    const focusData = {
      taskId: Number(taskId),
      sessionId: session.id,
      startedAt: session.started_at,
    };

    await redisClient.set(
      focusKey,
      JSON.stringify(focusData),
      {
        EX: 25 * 60,
      }
    );

    res.status(201).json({
      message: "25 dakikalık odak oturumu başladı",
      taskId: Number(taskId),
      sessionId: session.id,
      duration: 1500,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Odak oturumu başlatılamadı",
    });
  }
});

app.get("/focus", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const focusKey = `focus:user:${userId}`;

    const focusData = await redisClient.get(focusKey);

    if (!focusData) {
      return res.json({
        active: false,
      });
    }

    const ttl = await redisClient.ttl(focusKey);

    res.json({
      active: true,
      focus: JSON.parse(focusData),
      remainingSeconds: ttl,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Odak oturumu alınamadı",
    });
  }
});

app.delete("/focus", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const focusKey = `focus:user:${userId}`;

    const focusDataRaw = await redisClient.get(focusKey);

    if (!focusDataRaw) {
      return res.status(404).json({
        message: "Aktif odak oturumu yok",
      });
    }

    const focusData = JSON.parse(focusDataRaw);

    const ttl = await redisClient.ttl(focusKey);

    const totalDuration = 25 * 60;
    const elapsedSeconds = totalDuration - Math.max(ttl, 0);

    await pool.query(
      `UPDATE focus_sessions
       SET
         ended_at = NOW(),
         duration_seconds = $1
       WHERE id = $2 AND user_id = $3`,
      [
        elapsedSeconds,
        focusData.sessionId,
        userId,
      ]
    );

    await redisClient.del(focusKey);

    res.json({
      message: "Odak oturumu durduruldu",
      durationSeconds: elapsedSeconds,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Odak oturumu durdurulamadı",
    });
  }
});

app.get("/focus/history", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT
         fs.id,
         fs.task_id,
         t.title AS task_title,
         fs.started_at,
         fs.ended_at,
         fs.duration_seconds
       FROM focus_sessions fs
       JOIN tasks t ON t.id = fs.task_id
       WHERE fs.user_id = $1
       ORDER BY fs.started_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Odak geçmişi alınamadı",
    });
  }
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await redisClient.connect();

    console.log("Redis bağlantısı başarılı");

    app.listen(PORT, () => {
      console.log(
        `Server http://localhost:${PORT} üzerinde çalışıyor`
      );
    });
  } catch (error) {
    console.error(
      "Redis bağlantısı kurulamadı:",
      error
    );
  }
};

startServer();