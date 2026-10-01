#!/usr/bin/env bash
set -euo pipefail
if ! /usr/bin/node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
  echo "Install Node.js 22 or newer at /usr/bin/node before running host setup." >&2
  exit 1
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y python3.12-venv ffmpeg curl gnupg debian-keyring debian-archive-keyring apt-transport-https
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y caddy
id blindspot >/dev/null 2>&1 || useradd --system --home-dir /var/lib/blindspot --create-home --shell /usr/sbin/nologin blindspot
install -d -o blindspot -g blindspot /var/lib/blindspot /var/lib/blindspot/private /var/lib/blindspot/models
cd /opt/blindspot
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
chown -R root:blindspot /opt/blindspot
chmod -R g+rX /opt/blindspot
chown root:blindspot /etc/blindspot.env
chmod 640 /etc/blindspot.env
cp deploy/systemd/* /etc/systemd/system/
cp deploy/Caddyfile /etc/caddy/Caddyfile
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=100M\nMaxRetentionSec=7day\n' > /etc/systemd/journald.conf.d/blindspot.conf
systemctl restart systemd-journald
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl daemon-reload
systemctl enable --now blindspot-api blindspot-worker blindspot-web blindspot-backup.timer
systemctl enable caddy
systemctl restart caddy
curl --fail --retry 10 --retry-connrefused --retry-delay 2 http://127.0.0.1:8000/health
