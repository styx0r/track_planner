# Production START — serves the ALREADY-BUILT apps. Fast: no rebuild on start.
# After changing code, run build-all.ps1 first; afterwards just run this to (re)start.
# These are backend RUNTIME variables (MinIO etc.); the frontend URL is already baked in at build time.
$env:BACKEND_URL = "http://192.168.96.170:3333"
$env:NEXT_PUBLIC_BACKEND_URL = "http://192.168.96.170:3333"
$env:MINIO_ENDPOINT = "192.168.96.170"
$env:MINIO_PORT = "9000"
$env:MINIO_USE_SSL = "false"
$env:MINIO_REGION = "eu-central-1"

# Safety net: if nothing has been built yet (fresh checkout), build once. Does NOT rebuild if a build exists.
$missing = -not (Test-Path "backend/dist/main.js") `
  -or -not (Test-Path "rehearsal/out") `
  -or -not (Test-Path "conductor/out") `
  -or -not (Test-Path "moderator/out") `
  -or -not (Test-Path "mixing-desk/out") `
  -or -not (Test-Path "backoffice/.next")
if ($missing) {
  Write-Host "No build found - building once before serving..." -ForegroundColor Yellow
  npm run build:all
}

npm run serve:all
exit $LASTEXITCODE
