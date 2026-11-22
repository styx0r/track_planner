#!/usr/bin/env bash
set -Eeuo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Installs Docker Engine, containerd, Buildx, Docker Compose and Git from the
# official Docker/Debian or Docker/Ubuntu APT repositories.

TARGET_USER="${SUDO_USER:-}"
ADD_TO_GROUP=1
RUN_TEST=1

log()  { printf '\n\033[1;32m[+]\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\n\033[1;31m[FEHLER]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Installiert Git und Docker einschließlich Docker Compose aus den offiziellen
Docker-APT-Repositories.

Aufruf:
  sudo bash install-docker-compose-git.sh [Optionen]

Optionen:
  --user NAME       Benutzer zur Docker-Gruppe hinzufügen
  --no-user-group   Keinen Benutzer zur Docker-Gruppe hinzufügen
  --skip-test       Das hello-world-Testimage nicht starten
  -h, --help        Hilfe anzeigen

Beispiele:
  sudo bash install-docker-compose-git.sh
  sudo bash install-docker-compose-git.sh --user wks-admin
EOF
}

while (($#)); do
  case "$1" in
    --user) TARGET_USER="${2:?Benutzername fehlt}"; shift 2 ;;
    --no-user-group) ADD_TO_GROUP=0; shift ;;
    --skip-test) RUN_TEST=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unbekannte Option: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Bitte mit sudo oder als root ausführen."
[[ -r /etc/os-release ]] || die "/etc/os-release fehlt."
# shellcheck disable=SC1091
source /etc/os-release

case "${ID:-}" in
  debian)
    DOCKER_DIST="debian"
    DOCKER_SUITE="${VERSION_CODENAME:-}"
    ;;
  ubuntu)
    DOCKER_DIST="ubuntu"
    DOCKER_SUITE="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
    ;;
  *)
    die "Unterstützt werden Debian und Ubuntu; erkannt wurde ${ID:-unbekannt}."
    ;;
esac
[[ -n "$DOCKER_SUITE" ]] || die "Distributions-Codename konnte nicht ermittelt werden."
command -v apt-get >/dev/null || die "APT wurde nicht gefunden."
command -v systemctl >/dev/null || die "systemd ist erforderlich."

if [[ -z "$TARGET_USER" && $ADD_TO_GROUP -eq 1 ]]; then
  TARGET_USER="$(getent passwd | awk -F: '$3 >= 1000 && $3 < 60000 && $7 !~ /(nologin|false)$/ {print $1; exit}')"
fi
if [[ -n "$TARGET_USER" && $ADD_TO_GROUP -eq 1 ]]; then
  id "$TARGET_USER" >/dev/null 2>&1 || die "Benutzer $TARGET_USER existiert nicht."
fi

cat <<EOF

Geplante Installation
----------------------
Distribution: ${PRETTY_NAME:-$ID}
Docker-Repo:  https://download.docker.com/linux/$DOCKER_DIST
APT-Suite:    $DOCKER_SUITE
Architektur:  $(dpkg --print-architecture)
Docker-User:  $([[ $ADD_TO_GROUP -eq 1 && -n "$TARGET_USER" ]] && printf '%s' "$TARGET_USER" || printf 'keiner')
EOF

export DEBIAN_FRONTEND=noninteractive
log "Installiere Git und Voraussetzungen"
apt-get update
apt-get install -y --no-install-recommends \
  git ca-certificates curl passwd

log "Entferne gegebenenfalls kollidierende Distributionspakete"
CONFLICTS=(docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc)
INSTALLED_CONFLICTS=()
for package in "${CONFLICTS[@]}"; do
  if dpkg-query -W -f='${db:Status-Abbrev}' "$package" 2>/dev/null | grep -q '^ii'; then
    INSTALLED_CONFLICTS+=("$package")
  fi
done
if ((${#INSTALLED_CONFLICTS[@]})); then
  printf 'Entferne: %s\n' "${INSTALLED_CONFLICTS[*]}"
  apt-get remove -y "${INSTALLED_CONFLICTS[@]}"
else
  printf 'Keine kollidierenden Pakete gefunden.\n'
fi

log "Richte das offizielle Docker-APT-Repository ein"
install -m 0755 -d /etc/apt/keyrings
key_tmp="$(mktemp)"
trap 'rm -f "${key_tmp:-}"' EXIT
curl --fail --silent --show-error --location \
  "https://download.docker.com/linux/$DOCKER_DIST/gpg" \
  --output "$key_tmp"
install -m 0644 "$key_tmp" /etc/apt/keyrings/docker.asc

cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/$DOCKER_DIST
Suites: $DOCKER_SUITE
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

apt-get update

log "Installiere Docker Engine, containerd, Buildx und Compose"
apt-get install -y \
  docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

log "Aktiviere Docker beim Systemstart"
systemctl enable --now containerd.service docker.service

# The official package provides `docker compose`. This small compatibility
# wrapper also supports existing instructions using the legacy hyphenated name.
cat > /usr/local/bin/docker-compose <<'EOF'
#!/bin/sh
exec docker compose "$@"
EOF
chmod 0755 /usr/local/bin/docker-compose

if [[ $ADD_TO_GROUP -eq 1 && -n "$TARGET_USER" ]]; then
  log "Füge $TARGET_USER zur Docker-Gruppe hinzu"
  /usr/sbin/usermod -aG docker "$TARGET_USER"
fi

log "Prüfe die Installation"
docker --version
docker compose version
docker-compose version
git --version
systemctl is-active --quiet docker || die "Docker-Dienst ist nicht aktiv."

if [[ $RUN_TEST -eq 1 ]]; then
  log "Starte offiziellen hello-world-Testcontainer"
  docker run --rm hello-world
fi

cat <<EOF

Installation abgeschlossen.

Verfügbare Befehle:
  docker compose up -d
  docker-compose up -d
  docker compose ps
  docker compose logs -f
  git clone https://github.com/OWNER/REPOSITORY.git
EOF

if [[ $ADD_TO_GROUP -eq 1 && -n "$TARGET_USER" ]]; then
  cat <<EOF

$TARGET_USER wurde der Gruppe "docker" hinzugefügt.
Die neue Gruppenmitgliedschaft gilt erst nach erneutem Anmelden.
Für die aktuelle Shell alternativ:
  newgrp docker

Hinweis: Mitgliedschaft in der Docker-Gruppe gewährt praktisch Root-Rechte.
EOF
else
  warn "Kein Benutzer wurde zur Docker-Gruppe hinzugefügt. Docker daher mit sudo verwenden."
fi

warn "Docker-veröffentlichte Containerports können Regeln von ufw/firewalld umgehen. Firewallregeln bei Bedarf in der DOCKER-USER-Kette setzen."
