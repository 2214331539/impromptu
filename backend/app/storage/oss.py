from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

import oss2

from app.core.config import Settings


@dataclass(frozen=True)
class OSSConnection:
    endpoint: str
    bucket_name: str
    access_key_id: str
    access_key_secret: str


class OSSStorage:
    def __init__(self, connection: OSSConnection):
        endpoint = connection.endpoint.strip()
        if not endpoint.startswith(("http://", "https://")):
            endpoint = f"https://{endpoint}"
        auth = oss2.Auth(connection.access_key_id, connection.access_key_secret)
        self.bucket = oss2.Bucket(auth, endpoint, connection.bucket_name)
        self.bucket_name = connection.bucket_name

    @classmethod
    def from_settings(cls, settings: Settings) -> "OSSStorage":
        required = {
            "OSS_ENDPOINT": settings.oss_endpoint,
            "OSS_BUCKET_NAME": settings.oss_bucket_name,
            "OSS_ACCESS_KEY_ID": settings.oss_access_key_id,
            "OSS_ACCESS_KEY_SECRET": settings.oss_access_key_secret,
        }
        missing = [name for name, value in required.items() if not value.strip()]
        if missing:
            raise ValueError(f"Missing OSS configuration: {', '.join(missing)}")
        return cls(
            OSSConnection(
                endpoint=settings.oss_endpoint,
                bucket_name=settings.oss_bucket_name,
                access_key_id=settings.oss_access_key_id,
                access_key_secret=settings.oss_access_key_secret,
            )
        )

    def put_bytes(self, object_key: str, content: bytes, content_type: str) -> None:
        self.bucket.put_object(object_key, content, headers={"Content-Type": content_type})

    def get_bytes(self, object_key: str) -> bytes:
        return self.bucket.get_object(object_key).read()

    def open_stream(self, object_key: str, chunk_size: int = 256 * 1024) -> Iterator[bytes]:
        result = self.bucket.get_object(object_key)

        def chunks() -> Iterator[bytes]:
            try:
                while chunk := result.read(chunk_size):
                    yield chunk
            finally:
                result.close()

        return chunks()

    def delete(self, object_key: str) -> None:
        self.bucket.delete_object(object_key)

    def exists(self, object_key: str) -> bool:
        return self.bucket.object_exists(object_key)
