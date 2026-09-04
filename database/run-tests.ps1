$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$container = 'kabadi-connect-db-test'
$region = if ($env:DEFAULT_DEMO_REGION) { $env:DEFAULT_DEMO_REGION } else { 'test-region' }

docker rm -f $container 2>$null | Out-Null
docker run --name $container -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=kabadi -d postgres:16-alpine | Out-Null
try {
  do {
    docker exec $container pg_isready -U postgres -d kabadi 2>$null | Out-Null
    $ready = $LASTEXITCODE -eq 0
  } while (-not $ready)

  Get-ChildItem "$root\database\migrations\*.sql" | Sort-Object Name | ForEach-Object {
    docker cp $_.FullName "${container}:/tmp/$($_.Name)"
    docker exec $container psql -U postgres -d kabadi -v ON_ERROR_STOP=1 -f "/tmp/$($_.Name)"
    if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($_.Name)" }
  }
  docker cp "$root\database\seed.sql" "${container}:/tmp/seed.sql"
  docker exec $container psql -U postgres -d kabadi -v ON_ERROR_STOP=1 --set=demo_region=$region -f /tmp/seed.sql
  if ($LASTEXITCODE -ne 0) { throw 'Seed failed' }
  docker cp "$root\database\tests\database_checks.sql" "${container}:/tmp/database_checks.sql"
  docker exec $container psql -U postgres -d kabadi -v ON_ERROR_STOP=1 -f /tmp/database_checks.sql
  if ($LASTEXITCODE -ne 0) { throw 'Database checks failed' }
  Write-Host 'Database recreation and checks passed.'
} finally {
  docker rm -f $container 2>$null | Out-Null
}
