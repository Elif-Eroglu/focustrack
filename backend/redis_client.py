import os

import redis

redis_client = redis.Redis.from_url(
    os.getenv("REDIS_URL", "redis://localhost:6379"),
    decode_responses=True,  # değerler bytes değil str olarak gelsin
)
