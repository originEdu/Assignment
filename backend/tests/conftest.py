import os

# Settings are built at import time and JWT_SECRET has no default, so the
# suite must supply one rather than relying on a developer's local .env.
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production")
