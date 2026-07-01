# BUILD step — run this ONCE after changing code / after `git pull`, NOT on every start.
# The frontend build bakes NEXT_PUBLIC_BACKEND_URL into the static files, so it must be set here.
# Thanks to the Nx cache, unchanged apps are restored instantly instead of rebuilt.
$env:NEXT_PUBLIC_BACKEND_URL = "http://192.168.96.170:3333"
$env:NX_SKIP_NX_CACHE = "false"

npm run build:all
exit $LASTEXITCODE
