#!usrbinenv bash
set -Eeuo pipefail

# Minimal Debian installations and some sudo configurations omit sbin paths.
export PATH=usrlocalsbinusrlocalbinusrsbinusrbinsbinbin

# Standalone installer for bondagitaes67-linux-daemon on DebianUbuntu.
# Installs the RAVENNA ALSA kernel driver, daemon, WebUI and a default
# 48 kHz stereo AES67 source. RAVENNA becomes the system-wide ALSA default.

AES67_VERSION=${AES67_VERSION-v4.0.2}
AES67_REPO=httpsgithub.combondagitaes67-linux-daemon.git
IFACE=
PTP_DOMAIN=0
HTTP_PORT=8090
RTP_BASE=239.69.1.1
RTP_BASE_SECONDARY=239.69.1.1
SOURCE_NAME=MP AES67 Playback
NODE_NAME=
CREATE_SOURCE=1
AUTO_YES=0

log()  { printf 'n033[1;32m[+]033[0m %sn' $; }
warn() { printf 'n033[1;33m[!]033[0m %sn' $ &2; }
die()  { printf 'n033[1;31m[FEHLER]033[0m %sn' $ &2; exit 1; }

usage() {
  cat 'EOF'
Installation des bondagit AES67 Linux Daemons mit RAVENNA-ALSA-Treiber.

Aufruf
  sudo bash install-bondagit-aes67.sh [Optionen]

Optionen
  --interface NAME     AES67-Netzwerkkarte, z. B. eno1
  --ptp-domain NUMMER  PTP-Domain (Standard 0)
  --http-port PORT     Port der WebUI (Standard 8090; vermeidet WING-Port 8080)
  --rtp-base IP        RTP-Basisadresse (Standard 239.69.1.1)
  --rtp-base-secondary IP
                       RTP-Basisadresse für ST-2022-7 (Standard 239.69.1.1)
  --source-name NAME   Name der Stereo-AES67-Source
  --node-name NAME     Fester, im AES67-Netz eindeutiger Node-Name
  --no-source          Keine vorkonfigurierte Stereo-Source anlegen
  --yes                Rückfragen automatisch bestätigen
  -h, --help           Hilfe anzeigen

Beispiel
  sudo bash install-bondagit-aes67.sh --interface eno1 
    --ptp-domain 0 --source-name MP Durchsagen --yes
EOF
}

while (($#)); do
  case $1 in
    --interface)   IFACE=${2Name nach --interface fehlt}; shift 2 ;;
    --ptp-domain)  PTP_DOMAIN=${2Nummer nach --ptp-domain fehlt}; shift 2 ;;
    --http-port)   HTTP_PORT=${2Port nach --http-port fehlt}; shift 2 ;;
    --rtp-base)    RTP_BASE=${2IP nach --rtp-base fehlt}; shift 2 ;;
    --rtp-base-secondary) RTP_BASE_SECONDARY=${2IP nach --rtp-base-secondary fehlt}; shift 2 ;;
    --source-name) SOURCE_NAME=${2Name nach --source-name fehlt}; shift 2 ;;
    --node-name)   NODE_NAME=${2Name nach --node-name fehlt}; shift 2 ;;
    --no-source)   CREATE_SOURCE=0; shift ;;
    --yes)         AUTO_YES=1; shift ;;
    -h--help)     usage; exit 0 ;;
    ) die Unbekannte Option $1 ;;
  esac
done

[[ $EUID -eq 0 ]]  die Bitte mit sudo ausführen.
[[ -r etcos-release ]]  die etcos-release fehlt.
# shellcheck disable=SC1091
source etcos-release
case ${ID-} in
  debianubuntu) ;;
  ) die Unterstützt werden Debian und Ubuntu; erkannt wurde ${ID-unbekannt}. ;;
esac
[[ $PTP_DOMAIN =~ ^[0-9]+$ ]] && ((PTP_DOMAIN = 127))  die PTP-Domain muss 0 bis 127 sein.
[[ $HTTP_PORT =~ ^[0-9]+$ ]] && ((HTTP_PORT = 1 && HTTP_PORT = 65535))  die Ungültiger HTTP-Port.
[[ $RTP_BASE =~ ^239.([0-9]{1,3}.){2}[0-9]{1,3}$ ]]  die RTP-Basisadresse muss im Bereich 239.x.x.x liegen.
[[ $RTP_BASE_SECONDARY =~ ^239.([0-9]{1,3}.){2}[0-9]{1,3}$ ]]  die Secondary RTP-Basisadresse muss im Bereich 239.x.x.x liegen.
command -v systemctl devnull  die systemd ist erforderlich.
[[ $(systemd-detect-virt 2devnull  true) != docker ]]  die Der Kernel-Treiber kann nicht in einem Docker-Container installiert werden.

mapfile -t CANDIDATES  (
  find sysclassnet -mindepth 1 -maxdepth 1 -printf '%fn' 
    grep -Ev '^(lodocker[0-9]veth.br-.virbr.)$'  sort
)

if [[ -z $IFACE ]]; then
  ((${#CANDIDATES[@]}))  die Keine geeignete Netzwerkkarte gefunden.
  printf 'Verfügbare Netzwerkkartenn'
  for i in ${!CANDIDATES[@]}; do
    carrier=$(cat sysclassnet${CANDIDATES[$i]}carrier 2devnull  echo 0)
    address=$(ip -4 -o addr show dev ${CANDIDATES[$i]} 2devnull  awk '{print $4}'  paste -sd, -)
    printf '  %d) %-18s Link=%s  IPv4=%sn' $((i+1)) ${CANDIDATES[$i]} $carrier ${address-keine}
  done
  if ((${#CANDIDATES[@]} == 1)); then
    IFACE=${CANDIDATES[0]}
  else
    read -r -p Nummer der AES67-Netzwerkkarte  selection
    [[ $selection =~ ^[0-9]+$ ]] && ((selection = 1 && selection = ${#CANDIDATES[@]}))  die Ungültige Auswahl.
    IFACE=${CANDIDATES[$((selection-1))]}
  fi
fi
[[ -d sysclassnet$IFACE ]]  die Netzwerkkarte $IFACE existiert nicht.
[[ $IFACE != lo ]]  die Loopback kann nicht als AES67-Netzwerkkarte verwendet werden.

if [[ -z $NODE_NAME ]]; then
  NODE_NAME=AES67-$(hostname -s)
fi

cat EOF

Geplante Konfiguration
----------------------
Version       $AES67_VERSION
Interface     $IFACE
PTP-Domain    $PTP_DOMAIN
WebUI-Port    $HTTP_PORT
RTP-Basis     $RTP_BASE
RTP Secondary $RTP_BASE_SECONDARY
Node-Name     $NODE_NAME
Stereo-Source $([[ $CREATE_SOURCE -eq 1 ]] && printf '%s' $SOURCE_NAME  printf 'nein')
ALSA-Standard plughwRAVENNA (48 kHz, Stereo)
EOF
if [[ $AUTO_YES -ne 1 ]]; then
  read -r -p Installation starten [jN]  answer
  [[ $answer =~ ^[jJyY]$ ]]  die Abgebrochen.
fi

export DEBIAN_FRONTEND=noninteractive
log Installiere Build- und Laufzeitabhängigkeiten
apt-get update
apt-get install -y --no-install-recommends 
  build-essential clang git cmake wget ca-certificates jq curl 
  psmisc procps kmod passwd iproute2 
  libboost-all-dev alsa-utils libasound2-dev linuxptp 
  libavahi-client-dev avahi-daemon libsystemd-dev 
  linux-headers-$(uname -r)

SRC_DIR=usrlocalsrcaes67-linux-daemon-${AES67_VERSION}
if [[ -d $SRC_DIR.git ]]; then
  log Verwende vorhandenen Quellcode in $SRC_DIR
  git -C $SRC_DIR diff --ignore-submodules=all --quiet && 
    git -C $SRC_DIR diff --cached --ignore-submodules=all --quiet  
    die $SRC_DIR enthält lokale Änderungen; bitte sichern oder Verzeichnis umbenennen.
  git -C $SRC_DIR fetch --tags --recurse-submodules
  git -C $SRC_DIR checkout $AES67_VERSION
  git -C $SRC_DIR submodule update --init --recursive
else
  [[ ! -e $SRC_DIR ]]  die $SRC_DIR existiert, ist aber kein Git-Checkout.
  log Lade bondagit AES67 $AES67_VERSION
  git clone --branch $AES67_VERSION --depth 1 --recurse-submodules $AES67_REPO $SRC_DIR
fi

DRIVER_DIR=$SRC_DIR3rdpartyravenna-alsa-lkmdriver
[[ -f $DRIVER_DIRRTP_stream_info.h ]]  die RAVENNA-Submodul ist unvollständig.
git -C $SRC_DIR3rdpartyravenna-alsa-lkm fetch origin aes67-daemon
git -C $SRC_DIR3rdpartyravenna-alsa-lkm checkout -B aes67-daemon FETCH_HEAD

log Baue RAVENNA-ALSA-Kernelmodul für $(uname -r)
systemctl stop aes67-daemon 2devnull  true
make -C $DRIVER_DIR clean  true
kernel_major=$(uname -r  cut -d. -f1)
kernel_minor=$(uname -r  cut -d. -f2)
if ((kernel_major  7  (kernel_major == 7 && kernel_minor = 2))); then
  make -C $DRIVER_DIR CC=clang -j$(nproc)
else
  make -C $DRIVER_DIR -j$(nproc)
fi
[[ -f $DRIVER_DIRMergingRavennaALSA.ko ]]  die Kernelmodul wurde nicht erzeugt.
install -D -m 0644 $DRIVER_DIRMergingRavennaALSA.ko 
  libmodules$(uname -r)kerneldriverssoundMergingRavennaALSA.ko
usrsbindepmod -a
printf '%sn' MergingRavennaALSA  etcmodules-load.dmerging-ravenna-alsa.conf
usrsbinmodprobe MergingRavennaALSA  die Kernelmodul konnte nicht geladen werden. Secure Boot oder fehlende Kernel-Kompatibilität prüfen.

log Installiere die WebUI
WEBUI_DIR=$SRC_DIRwebui
mkdir -p $WEBUI_DIRdist
archive=$(mktemp)
trap 'rm -f ${archive-}' EXIT
if ! wget -qO $archive httpsgithub.combondagitaes67-linux-daemonreleasesdownload${AES67_VERSION}webui.tar.gz; then
  warn Versionsgebundenes WebUI-Archiv fehlt; verwende latestdownload.
  wget -qO $archive httpsgithub.combondagitaes67-linux-daemonreleaseslatestdownloadwebui.tar.gz
fi
tar -xzf $archive -C $WEBUI_DIR

log Baue den AES67-Daemon
DAEMON_DIR=$SRC_DIRdaemon
cmake -S $DAEMON_DIR -B $DAEMON_DIRbuild-mp 
  -DBoost_NO_WARN_NEW_VERSIONS=1 
  -DCPP_HTTPLIB_DIR=$SRC_DIR3rdpartycpp-httplib 
  -DRAVENNA_ALSA_LKM_DIR=$SRC_DIR3rdpartyravenna-alsa-lkm 
  -DENABLE_TESTS=OFF -DWITH_AVAHI=ON -DFAKE_DRIVER=OFF 
  -DWITH_SYSTEMD=ON -DWITH_STREAMER=OFF -DWITH_NMOS=OFF
cmake --build $DAEMON_DIRbuild-mp --parallel $(nproc)
DAEMON_BIN=$DAEMON_DIRbuild-mpaes67-daemon
[[ -x $DAEMON_BIN ]]  DAEMON_BIN=$DAEMON_DIRaes67-daemon
[[ -x $DAEMON_BIN ]]  die aes67-daemon Binary wurde nicht gefunden.

log Installiere Dienst, WebUI und Konfiguration
getent group audio devnull  usrsbingroupadd --system audio
if ! id aes67-daemon devnull 2&1; then
  usrsbinuseradd --system --gid audio --no-create-home --shell usrsbinnologin aes67-daemon
fi
install -m 0755 $DAEMON_BIN usrlocalbinaes67-daemon
install -d -o aes67-daemon -g audio etcaes67-daemon varlibaes67-daemon
install -d -o root -g root usrlocalshareaes67-daemonwebui usrlocalshareaes67-daemonscripts
cp -a $WEBUI_DIRdist. usrlocalshareaes67-daemonwebui
install -m 0755 $DAEMON_DIRscriptsptp_status.sh usrlocalshareaes67-daemonscriptsptp_status.sh

timestamp=$(date +%Y%m%d-%H%M%S)
for file in etcaes67-daemondaemon.conf varlibaes67-daemonstatus.json etcasound.conf; do
  [[ ! -e $file ]]  cp -a $file $file.backup-$timestamp
done

jq -n 
  --arg iface $IFACE --arg node $NODE_NAME 
  --arg rtp_base $RTP_BASE --arg rtp_base_secondary $RTP_BASE_SECONDARY 
  --argjson port $HTTP_PORT --argjson domain $PTP_DOMAIN 
  '{
    http_port$port, rtsp_port8854,
    http_base_dirusrlocalshareaes67-daemonwebui,
    log_severity2, playout_delay0,
    tic_frame_size_at_1fs48, max_tic_frame_size1024,
    sample_rate48000,
    rtp_mcast_base$rtp_base, rtp_mcast_base_sec$rtp_base_secondary,
    rtp_port5004, rtp_port_sec5004,
    ptp_domain$domain, ptp_dscp48,
    sap_mcast_addr239.255.255.255, sap_interval30,
    syslog_protonone, syslog_server255.255.255.2541234,
    status_filevarlibaes67-daemonstatus.json,
    interface_name$iface, mdns_enabledtrue,
    custom_node_id$node,
    ptp_status_scriptusrlocalshareaes67-daemonscriptsptp_status.sh,
    streamer_channels2, streamer_files_num8,
    streamer_file_duration1, streamer_player_buffer_files_num1,
    streamer_enabledfalse, auto_sinks_updatetrue,
    nmos_enabledfalse, nmos_registry_address127.0.0.1,
    nmos_registry_port3210, nmos_node_port3218,
    nmos_label$node
  }'  etcaes67-daemondaemon.conf

if [[ $CREATE_SOURCE -eq 1 ]]; then
  jq -n --arg name $SOURCE_NAME '{
    sources[{
      id0, enabledtrue, name$name, ioAudio Device,
      codecL24, address, max_samples_per_packet48,
      ttl15, payload_type98, dscp34,
      refclk_ptp_traceablefalse, map[0,1]
    }],
    sinks[]
  }'  varlibaes67-daemonstatus.json
else
  printf '%sn' '{sources[],sinks[]}'  varlibaes67-daemonstatus.json
fi
chown aes67-daemonaudio etcaes67-daemondaemon.conf varlibaes67-daemonstatus.json
chmod 0640 etcaes67-daemondaemon.conf varlibaes67-daemonstatus.json

cat  etcasound.conf 'EOF'
# Systemweiter ALSA-Standard bondagitMerging RAVENNA AES67
pcm.ravenna {
  type plug
  slave {
    pcm hwRAVENNA,0
    rate 48000
    channels 2
  }
}
pcm.!default {
  type plug
  slave.pcm ravenna
}
ctl.!default {
  type hw
  card RAVENNA
}
EOF

cat  etcsysctl.d90-aes67.conf 'EOF'
# Recommended by bondagit for AES67 real-time scheduling and multicast sessions.
kernel.sched_rt_runtime_us=1000000
net.ipv4.igmp_max_memberships=66
EOF
usrsbinsysctl --system devnull

cat  etcsystemdsystemaes67-daemon.service 'EOF'
[Unit]
Description=bondagit AES67 Linux daemon
Wants=network-online.target
After=network-online.target avahi-daemon.service

[Service]
Type=notify
WatchdogSec=10
TimeoutStartSec=0
User=aes67-daemon
Group=audio
ExecStartPre=usrsbinmodprobe MergingRavennaALSA
ExecStart=usrlocalbinaes67-daemon -c etcaes67-daemondaemon.conf -a 0.0.0.0
Restart=on-failure
RestartSec=3
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=strict
ReadWritePaths=etcaes67-daemon varlibaes67-daemon
DevicePolicy=closed
DeviceAllow=char-alsa rw
DeviceAllow=devsnd rw
RestrictAddressFamilies=AF_INET AF_NETLINK AF_UNIX

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now avahi-daemon aes67-daemon
sleep 3

log Prüfe Installation
systemctl --no-pager --full status aes67-daemon  true
printf 'nALSA-Geräten'
aplay -l  true

ip_addr=$(ip -4 -o addr show dev $IFACE  awk 'NR==1 {split($4,a,); print a[1]}')
cat EOF

Installation abgeschlossen.

WebUI       http${ip_addr-SERVER-IP}$HTTP_PORT
ALSA-Gerät  default bzw. plughwRAVENNA
Test        speaker-test -D default -r 48000 -c 2 -t sine -l 1
PTP-Status  curl -s http127.0.0.1$HTTP_PORTapiptpstatus  jq
Logs        journalctl -u aes67-daemon -f

WICHTIG Audio funktioniert erst, wenn die WebUI den PTP-Status locked meldet.
Nach einem Kernel-Update muss der RAVENNA-Treiber ggf. durch erneutes Ausführen
dieses Skripts für den neuen Kernel gebaut werden.
EOF

if pgrep -x pulseaudio devnull 2&1  pgrep -x pipewire devnull 2&1; then
  warn PulseAudioPipeWire läuft. Der Dienst kann das ALSA-Gerät belegen. Auf einem dedizierten Server sollte der Soundserver deaktiviert werden.
fi
