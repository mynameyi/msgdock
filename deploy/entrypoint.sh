#!/bin/sh
set -eu
umask 077
export DATA_DIR="${DATA_DIR:-/data}"
export PGDATA="$DATA_DIR/postgres"
mkdir -p "$PGDATA" "$DATA_DIR/redis" "$DATA_DIR/uploads" "$DATA_DIR/secrets"
chmod 755 "$DATA_DIR"
chown postgres:postgres "$PGDATA"
chown redis:redis "$DATA_DIR/redis"
chown msgdock:msgdock "$DATA_DIR/uploads" "$DATA_DIR/secrets"
chmod 700 "$PGDATA" "$DATA_DIR/redis" "$DATA_DIR/uploads" "$DATA_DIR/secrets"
if [ -s "$PGDATA/PG_VERSION" ] && [ ! -s "$DATA_DIR/secrets/master-key" ] && [ -z "${MSGDOCK_MASTER_KEY:-}" ]; then
  echo '已有数据库缺少加密主密钥，请恢复备份或注入原 MSGDOCK_MASTER_KEY。' >&2
  exit 1
fi
for item in master-key setup-token db-password; do
  if [ ! -s "$DATA_DIR/secrets/$item" ]; then
    head -c 32 /dev/urandom | base64 | tr -d '\n' > "$DATA_DIR/secrets/$item"
    chmod 600 "$DATA_DIR/secrets/$item"
    chown msgdock:msgdock "$DATA_DIR/secrets/$item"
  fi
  chown msgdock:msgdock "$DATA_DIR/secrets/$item"
  chmod 600 "$DATA_DIR/secrets/$item"
done
if [ -f "$PGDATA/PG_VERSION" ] && [ "$(cat "$PGDATA/PG_VERSION")" != "18" ]; then
  echo '数据库主版本不匹配；请先完成备份与显式升级。' >&2
  exit 1
fi
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  su-exec postgres initdb -D "$PGDATA" --auth-local=peer --auth-host=scram-sha-256 >/dev/null
fi
stop_db() { su-exec postgres pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true; }
trap stop_db EXIT INT TERM
su-exec postgres pg_ctl -D "$PGDATA" -o "-c listen_addresses=127.0.0.1 -c timezone=$TZ" -w start >/dev/null
db_password="$(cat "$DATA_DIR/secrets/db-password")"
su-exec postgres psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres --set="password=$db_password" <<'SQL'
SELECT 'CREATE ROLE msgdock LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='msgdock') \gexec
ALTER ROLE msgdock WITH PASSWORD :'password';
SELECT 'CREATE DATABASE msgdock OWNER msgdock' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='msgdock') \gexec
SQL
encoded_password="$(node -e 'process.stdout.write(encodeURIComponent(require("fs").readFileSync(process.env.DATA_DIR+"/secrets/db-password","utf8").trim()))')"
export DATABASE_URL="postgresql://msgdock:$encoded_password@127.0.0.1:5432/msgdock?schema=public&connection_limit=12"
export REDIS_URL=redis://127.0.0.1:6379
cd /app/packages/database
su-exec msgdock node node_modules/prisma/build/index.js migrate deploy
cd /app
stop_db
trap - EXIT INT TERM
exec supervisord -n -c /app/deploy/supervisord.conf
