import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from db import pool  # noqa: E402  (önce .env yüklenmeli)


def init_database():
    sql = (Path(__file__).parent / "init.sql").read_text(encoding="utf-8")
    try:
        pool.open()
        with pool.connection() as conn:
            conn.execute(sql)
        print("Veritabanı tabloları başarıyla hazırlandı.")
    except Exception as error:
        print("Veritabanı hazırlanamadı:", error)
        sys.exit(1)
    finally:
        pool.close()


if __name__ == "__main__":
    init_database()
