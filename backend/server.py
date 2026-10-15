import json
import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

load_dotenv()

from db import pool  # noqa: E402  (önce .env yüklenmeli)
from redis_client import redis_client  # noqa: E402

FOCUS_DURATION = 25 * 60  # 1500 saniye


# ---------------- Yardımcılar ----------------

def to_js_date(value):
    """Tarihleri Node.js'in JSON çıktısıyla aynı biçime çevirir:
    2026-10-15T08:30:00.123Z  (UTC, milisaniyeli, sonunda Z)
    Saat dilimi olmayan TIMESTAMP ve DATE değerleri, Node'daki pg gibi
    sunucunun yerel saati kabul edilip UTC'ye çevrilir.
    Böylece frontend'de hiçbir şey değişmeden çalışır."""
    if isinstance(value, date) and not isinstance(value, datetime):
        value = datetime(value.year, value.month, value.day)
    if isinstance(value, datetime):
        value = value.astimezone(timezone.utc)  # saat dilimsizse yerel saat kabul edilir
        return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"
    return value


def serialize(data):
    if isinstance(data, list):
        return [serialize(item) for item in data]
    if isinstance(data, dict):
        return {key: serialize(value) for key, value in data.items()}
    return to_js_date(data)


def reply(data, status_code=200):
    return JSONResponse(content=serialize(data), status_code=status_code)


def password_bytes(password: str) -> bytes:
    # bcrypt en fazla 72 byte kullanır; Node da fazlasını yok sayıyor
    return password.encode("utf-8")[:72]


# ---------------- Uygulama ----------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Node'daki startServer(): önce Redis'e bağlan, sonra dinlemeye başla
    try:
        redis_client.ping()
        print("Redis bağlantısı başarılı")
    except Exception as error:
        print("Redis bağlantısı kurulamadı:", error)
        raise
    pool.open()
    yield
    pool.close()
    redis_client.close()


app = FastAPI(title="FocusTrack API", lifespan=lifespan)

# Node'daki app.use(cors()) karşılığı: her adresten gelen isteğe izin ver
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Hata cevapları da Node'daki gibi {"message": "..."} şeklinde dönsün
@app.exception_handler(HTTPException)
async def http_error_handler(request: Request, exc: HTTPException):
    return JSONResponse({"message": exc.detail}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return JSONResponse({"message": "Geçersiz istek"}, status_code=400)


# ---------------- Middleware: authenticateToken ----------------

def authenticate_token(authorization: Optional[str] = Header(default=None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Token gerekli")

    parts = authorization.split(" ")
    token = parts[1] if len(parts) > 1 else None

    if not token:
        raise HTTPException(status_code=401, detail="Token gerekli")

    try:
        user = jwt.decode(token, os.getenv("JWT_SECRET"), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=403, detail="Geçersiz veya süresi dolmuş token")

    return user  # Node'daki req.user


# ---------------- İstek gövdeleri (req.body) ----------------

class RegisterBody(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None


class LoginBody(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None


class TaskBody(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None


# ---------------- Genel ----------------

@app.get("/")
def home():
    return reply({"message": "FocusTrack API çalışıyor"})


@app.get("/db-test")
def db_test():
    try:
        with pool.connection() as conn:
            row = conn.execute("SELECT NOW()").fetchone()
        return reply({"message": "PostgreSQL bağlantısı başarılı", "time": row["now"]})
    except Exception as error:
        print(error)
        return reply({"message": "Veritabanı bağlantısı başarısız"}, 500)


# ---------------- Kayıt ve giriş ----------------

@app.post("/register")
def register(body: RegisterBody):
    try:
        if not body.name or not body.email or not body.password:
            return reply({"message": "Tüm alanlar zorunludur"}, 400)

        with pool.connection() as conn:
            existing_user = conn.execute(
                "SELECT id FROM users WHERE email = %s", [body.email]
            ).fetchone()

            if existing_user:
                return reply({"message": "Bu e-posta zaten kayıtlı"}, 400)

            hashed_password = bcrypt.hashpw(
                password_bytes(body.password), bcrypt.gensalt(rounds=10)
            ).decode("utf-8")

            user = conn.execute(
                """INSERT INTO users (name, email, password)
                   VALUES (%s, %s, %s)
                   RETURNING id, name, email, created_at""",
                [body.name, body.email, hashed_password],
            ).fetchone()

        return reply({"message": "Kullanıcı başarıyla oluşturuldu", "user": user}, 201)
    except Exception as error:
        print(error)
        return reply({"message": "Kayıt işlemi başarısız"}, 500)


@app.post("/login")
def login(body: LoginBody):
    try:
        if not body.email or not body.password:
            return reply({"message": "E-posta ve şifre zorunludur"}, 400)

        with pool.connection() as conn:
            user = conn.execute(
                "SELECT * FROM users WHERE email = %s", [body.email]
            ).fetchone()

        if not user:
            return reply({"message": "E-posta veya şifre hatalı"}, 401)

        password_match = bcrypt.checkpw(
            password_bytes(body.password), user["password"].encode("utf-8")
        )

        if not password_match:
            return reply({"message": "E-posta veya şifre hatalı"}, 401)

        now = datetime.now(timezone.utc)
        token = jwt.encode(
            {
                "userId": user["id"],
                "email": user["email"],
                "iat": now,
                "exp": now + timedelta(days=7),
            },
            os.getenv("JWT_SECRET"),
            algorithm="HS256",
        )

        return reply({
            "message": "Giriş başarılı",
            "token": token,
            "user": {"id": user["id"], "name": user["name"], "email": user["email"]},
        })
    except Exception as error:
        print(error)
        return reply({"message": "Giriş işlemi başarısız"}, 500)


# ---------------- Görevler (CRUD) ----------------

@app.get("/tasks")
def get_tasks(user: dict = Depends(authenticate_token)):
    try:
        with pool.connection() as conn:
            tasks = conn.execute(
                """SELECT *
                   FROM tasks
                   WHERE user_id = %s
                   ORDER BY created_at DESC""",
                [user["userId"]],
            ).fetchall()
        return reply(tasks)
    except Exception as error:
        print(error)
        return reply({"message": "Görevler alınamadı"}, 500)


@app.post("/tasks")
def create_task(body: TaskBody, user: dict = Depends(authenticate_token)):
    try:
        if not body.title:
            return reply({"message": "Görev başlığı zorunludur"}, 400)

        with pool.connection() as conn:
            task = conn.execute(
                """INSERT INTO tasks
                   (user_id, title, description, status, priority, due_date)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING *""",
                [
                    user["userId"],
                    body.title,
                    body.description or None,
                    body.status or "To Do",
                    body.priority or "Medium",
                    body.due_date or None,
                ],
            ).fetchone()

        return reply({"message": "Görev oluşturuldu", "task": task}, 201)
    except Exception as error:
        print(error)
        return reply({"message": "Görev oluşturulamadı"}, 500)


@app.put("/tasks/{id}")
def update_task(id: str, body: TaskBody, user: dict = Depends(authenticate_token)):
    try:
        with pool.connection() as conn:
            task = conn.execute(
                """UPDATE tasks
                   SET
                     title = COALESCE(%s, title),
                     description = COALESCE(%s, description),
                     status = COALESCE(%s, status),
                     priority = COALESCE(%s, priority),
                     due_date = COALESCE(%s, due_date)
                   WHERE id = %s AND user_id = %s
                   RETURNING *""",
                [
                    body.title,
                    body.description,
                    body.status,
                    body.priority,
                    body.due_date,
                    id,
                    user["userId"],
                ],
            ).fetchone()

        if not task:
            return reply({"message": "Görev bulunamadı"}, 404)

        return reply({"message": "Görev güncellendi", "task": task})
    except Exception as error:
        print(error)
        return reply({"message": "Görev güncellenemedi"}, 500)


@app.delete("/tasks/{id}")
def delete_task(id: str, user: dict = Depends(authenticate_token)):
    try:
        with pool.connection() as conn:
            task = conn.execute(
                """DELETE FROM tasks
                   WHERE id = %s AND user_id = %s
                   RETURNING *""",
                [id, user["userId"]],
            ).fetchone()

        if not task:
            return reply({"message": "Görev bulunamadı"}, 404)

        return reply({"message": "Görev silindi", "task": task})
    except Exception as error:
        print(error)
        return reply({"message": "Görev silinemedi"}, 500)


# ---------------- FOCUS TIMER ----------------

@app.post("/focus/start/{task_id}")
def start_focus(task_id: str, user: dict = Depends(authenticate_token)):
    try:
        user_id = user["userId"]

        with pool.connection() as conn:
            task = conn.execute(
                "SELECT * FROM tasks WHERE id = %s AND user_id = %s",
                [task_id, user_id],
            ).fetchone()

            if not task:
                return reply({"message": "Görev bulunamadı"}, 404)

            focus_key = f"focus:user:{user_id}"

            if redis_client.get(focus_key):
                return reply({"message": "Zaten aktif bir odak oturumun var"}, 400)

            session = conn.execute(
                """INSERT INTO focus_sessions
                   (user_id, task_id, started_at)
                   VALUES (%s, %s, NOW())
                   RETURNING *""",
                [user_id, task_id],
            ).fetchone()

        focus_data = {
            "taskId": int(task_id),
            "sessionId": session["id"],
            "startedAt": to_js_date(session["started_at"]),
        }

        # Redis'e 25 dakika (1500 sn) ömürlü anahtar yaz
        redis_client.set(
            focus_key,
            json.dumps(focus_data, separators=(",", ":")),
            ex=FOCUS_DURATION,
        )

        return reply({
            "message": "25 dakikalık odak oturumu başladı",
            "taskId": int(task_id),
            "sessionId": session["id"],
            "duration": FOCUS_DURATION,
        }, 201)
    except Exception as error:
        print(error)
        return reply({"message": "Odak oturumu başlatılamadı"}, 500)


@app.get("/focus")
def get_focus(user: dict = Depends(authenticate_token)):
    try:
        focus_key = f"focus:user:{user['userId']}"
        focus_data = redis_client.get(focus_key)

        if not focus_data:
            return reply({"active": False})

        ttl = redis_client.ttl(focus_key)

        return reply({
            "active": True,
            "focus": json.loads(focus_data),
            "remainingSeconds": ttl,
        })
    except Exception as error:
        print(error)
        return reply({"message": "Odak oturumu alınamadı"}, 500)


@app.delete("/focus")
def stop_focus(user: dict = Depends(authenticate_token)):
    try:
        user_id = user["userId"]
        focus_key = f"focus:user:{user_id}"

        focus_data_raw = redis_client.get(focus_key)

        if not focus_data_raw:
            return reply({"message": "Aktif odak oturumu yok"}, 404)

        focus_data = json.loads(focus_data_raw)
        ttl = redis_client.ttl(focus_key)
        elapsed_seconds = FOCUS_DURATION - max(ttl, 0)

        with pool.connection() as conn:
            conn.execute(
                """UPDATE focus_sessions
                   SET
                     ended_at = NOW(),
                     duration_seconds = %s
                   WHERE id = %s AND user_id = %s""",
                [elapsed_seconds, focus_data["sessionId"], user_id],
            )

        redis_client.delete(focus_key)

        return reply({
            "message": "Odak oturumu durduruldu",
            "durationSeconds": elapsed_seconds,
        })
    except Exception as error:
        print(error)
        return reply({"message": "Odak oturumu durdurulamadı"}, 500)


@app.get("/focus/history")
def focus_history(user: dict = Depends(authenticate_token)):
    try:
        with pool.connection() as conn:
            sessions = conn.execute(
                """SELECT
                     fs.id,
                     fs.task_id,
                     t.title AS task_title,
                     fs.started_at,
                     fs.ended_at,
                     fs.duration_seconds
                   FROM focus_sessions fs
                   JOIN tasks t ON t.id = fs.task_id
                   WHERE fs.user_id = %s
                   ORDER BY fs.started_at DESC""",
                [user["userId"]],
            ).fetchall()
        return reply(sessions)
    except Exception as error:
        print(error)
        return reply({"message": "Odak geçmişi alınamadı"}, 500)


# `python server.py` ile de çalıştırılabilsin (Node'daki `node server.js` gibi)
if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "5000"))
    print(f"Server http://localhost:{port} üzerinde çalışıyor")
    uvicorn.run(app, host="0.0.0.0", port=port)
