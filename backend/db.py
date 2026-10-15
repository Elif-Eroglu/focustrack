import os

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


def build_conninfo():
    # Railway'de DATABASE_URL kullanılır; lokalde DB_HOST, DB_USER... değişkenleri
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return database_url

    parts = {
        "host": os.getenv("DB_HOST"),
        "port": os.getenv("DB_PORT"),
        "user": os.getenv("DB_USER"),
        "password": os.getenv("DB_PASSWORD"),
        "dbname": os.getenv("DB_NAME"),
    }
    return " ".join(f"{key}={value}" for key, value in parts.items() if value)


# Node'daki pg Pool'un karşılığı: bağlantılar havuzda tutulur ve tekrar kullanılır.
# dict_row sayesinde her satır {"id": 1, "title": ...} şeklinde sözlük olarak gelir.
pool = ConnectionPool(
    conninfo=build_conninfo(),
    kwargs={"row_factory": dict_row},
    open=False,
)
