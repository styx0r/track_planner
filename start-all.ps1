$env:BACKEND_URL = "http://192.168.96.170:3333"
$env:NEXT_PUBLIC_BACKEND_URL = "http://192.168.96.170:3333"
$env:MINIO_ENDPOINT = "192.168.96.170"
$env:MINIO_PORT = "9000"
$env:MINIO_USE_SSL = "false"
$env:NX_SKIP_NX_CACHE = "true"

npm run start:all
exit $LASTEXITCODE
