# Same as the previous start-all.ps1: LAN IP + full production builds per app (start:all).
$env:BACKEND_URL = "http://10.99.70.100:3333"
$env:NEXT_PUBLIC_BACKEND_URL = "http://10.99.70.100:3333"
$env:MINIO_ENDPOINT = "10.99.70.100"
$env:MINIO_PORT = "9000"
$env:MINIO_USE_SSL = "false"
$env:MINIO_REGION = "eu-central-1"
# Conductor unlock PIN (baked into the conductor build)
$env:NEXT_PUBLIC_CONDUCTOR_PIN = "1234"
# Cache ON (reuse cached builds). Set to "true" only if you want to force fresh rebuilds.
$env:NX_SKIP_NX_CACHE = "false"

npm run start:all
exit $LASTEXITCODE
