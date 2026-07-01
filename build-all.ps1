# BUILD step — run this ONCE after changing code / after `git pull`, NOT on every start.
# The frontend build bakes NEXT_PUBLIC_BACKEND_URL into the static files, so it must be set here.
# Thanks to the Nx cache, unchanged apps are restored instantly instead of rebuilt.
$env:NEXT_PUBLIC_BACKEND_URL = "http://10.99.70.100:3333"
# Conductor unlock PIN (baked into the conductor build)
$env:NEXT_PUBLIC_CONDUCTOR_PIN = "1234"
$env:NX_SKIP_NX_CACHE = "false"

npm run build:all
exit $LASTEXITCODE
