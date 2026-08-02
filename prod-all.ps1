

$composeDir = "C:\Users\wks-admin\Documents\track_planner\deployment"

Set-Location $composeDir

Write-Host -NoNewline "Warten auf die Docker-Container "
Start-Sleep -Seconds 30
do {
    $containers = docker compose ps --format json | ConvertFrom-Json

    $notReady = $containers | Where-Object {
        $_.State -ne "running" -or (
            $_.Health -and $_.Health -ne "healthy"
        )
    }

    if ($notReady.Count -gt 0 -or $containers.Count -eq 0) {
        Write-Host -NoNewline "."
        Start-Sleep -Seconds 1
    }

} until ($containers.Count -gt 0 -and $notReady.Count -eq 0)

Write-Host ""
Write-Host "Container bereit, Gospelplayer wird gestartet!" -ForegroundColor Black -BackgroundColor Green

# Production START — serves the ALREADY-BUILT apps. Fast: no rebuild on start.
# After changing code, run build-all.ps1 first; afterwards just run this to (re)start.
# These are backend RUNTIME variables (MinIO etc.); the frontend URL is already baked in at build time.
$env:BACKEND_URL = "http://10.99.70.100:3333"
$env:NEXT_PUBLIC_BACKEND_URL = "http://10.99.70.100:3333"
$env:MINIO_ENDPOINT = "10.99.70.100"
$env:MINIO_PORT = "9000"
$env:MINIO_USE_SSL = "false"
$env:MINIO_REGION = "eu-central-1"
# Full path to ffmpeg.exe (used for server-side waveform generation). Required on
# Windows where ffmpeg is usually not on PATH — without it the conductor shows a
# fallback/dummy waveform. Adjust the path to your actual ffmpeg.exe location.
$env:FFMPEG_PATH = "C:\0_FASTDATA\mpv\ffmpeg.exe"
# Conductor unlock PIN (only used by the safety-net build below; it is baked in at build time)
$env:NEXT_PUBLIC_CONDUCTOR_PIN = "1234"

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
