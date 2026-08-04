from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import oss2

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import Settings  # noqa: E402
from app.storage import OSSStorage  # noqa: E402


def main() -> int:
    settings = Settings(_env_file=PROJECT_ROOT / ".env")
    prefix = settings.oss_test_prefix.strip("/") or "connectivity-tests"
    object_key = f"{prefix}/{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex}.txt"
    payload = f"OSS connectivity test at {datetime.now(timezone.utc).isoformat()}\n".encode()
    uploaded = False
    cleanup_error: Exception | None = None

    try:
        storage = OSSStorage.from_settings(settings)
        storage.put_bytes(object_key, payload, "text/plain; charset=utf-8")
        uploaded = True
        downloaded = storage.get_bytes(object_key)
        if downloaded != payload:
            raise RuntimeError("Downloaded content does not match uploaded content")
    except oss2.exceptions.OssError as error:
        print(
            f"OSS connectivity test failed: type={type(error).__name__}, "
            f"status={error.status}, code={error.code}, request_id={error.request_id}",
            file=sys.stderr,
        )
        return 1
    except Exception as error:
        print(f"OSS connectivity test failed: {type(error).__name__}: {error}", file=sys.stderr)
        return 1
    finally:
        if uploaded:
            try:
                storage.delete(object_key)
                if storage.exists(object_key):
                    raise RuntimeError("Object still exists after cleanup")
            except Exception as error:
                cleanup_error = error

    if cleanup_error:
        print(
            f"OSS read/write succeeded, but cleanup failed for {object_key}: "
            f"{type(cleanup_error).__name__}",
            file=sys.stderr,
        )
        return 1

    print(
        json.dumps(
            {
                "status": "ok",
                "bucket": settings.oss_bucket_name,
                "object_key": object_key,
                "bytes_verified": len(payload),
                "cleanup": "deleted_and_verified",
                "business_storage_backend": settings.storage_backend,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
