$ErrorActionPreference = 'Stop'

function Run($cmd) {
    Write-Host "Running: $cmd"
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Error "❌ Command failed: $cmd"
        exit $LASTEXITCODE
    }
}

echo "::group::compile native modules"
Run 'pnpm run prepare-native-deps'
echo "::endgroup::"

echo "::group::test e2e"
# TODO enable e2e test running on Windows
# currently "playwright._electron.launch" call ends up with error on Windows: "electron.launch: Process failed to launch!"
# Run 'pnpm run test:e2e'
echo "::endgroup::"

echo "::group::package"
Run 'pnpm run build:electron-builder-hooks'
Run 'pnpm run electron-builder:dist'
echo "::endgroup::"

echo "::group::hash & upload"
Run 'pnpm run scripts/dist-packages/print-hashes'
Run 'pnpm run scripts/dist-packages/upload'
echo "::endgroup::"
