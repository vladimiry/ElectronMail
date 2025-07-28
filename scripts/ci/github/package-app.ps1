. "$PSScriptRoot\package-app.include.ps1"

$vsInstallRoot = "C:\Program Files (x86)\Microsoft Visual Studio\2019"

echo "::group::resolve vs2019"
$vcVarsPath = Resolve-VcVarsPath -vsInstallRoot $vsInstallRoot
echo "::endgroup::"

echo "::group::compile native modules"
$cmd = "`"$vcVarsPath`" x64 -vcvars_ver=14.2 && pnpm run prepare-native-deps"
Run -cmd $cmd
echo "::endgroup::"

echo "::group::scan *.node files"
$stringsExe = Resolve-StringsExe
$dumpbinExe = Resolve-DumpbinExe -vsInstallRoot $vsInstallRoot
$targetModules = @("keytar", "msgpackr-extract", "sodium-native")
$basePath = Join-Path (Get-Location) "node_modules"
foreach ($module in $targetModules) {
    $searchPath = Join-Path $basePath $module
    Get-ChildItem -Path $searchPath -Recurse -Filter *.node -ErrorAction SilentlyContinue | ForEach-Object {
        $nodeFile = "`"$($_.FullName)`""
        Write-Host "${nodeFile} [NAPI + linker] info:"
        $scanners = @(
            @{ exe = "`"$stringsExe`""; args = ""; pattern = "napi_register_module" },
            @{ exe = "`"$dumpbinExe`""; args = "/headers"; pattern = "linker" }
        )
        foreach ($scanner in $scanners) {
            $cmd = "$($scanner.exe) $($scanner.args) $nodeFile"
            $rawOutput = RunWithCollectedOutput -cmd $cmd -SilentCmd -AllowFailure
            $rawOutput | Select-String $($scanner.pattern)
        }
        Write-Host "-----------------------------"
    }
}
echo "::endgroup::"

echo "::group::test e2e"
Run -cmd "pnpm run test:e2e"
echo "::endgroup::"

echo "::group::package"
Run -cmd "pnpm run build:electron-builder-hooks"
Run -cmd "pnpm run electron-builder:dist"
echo "::endgroup::"

echo "::group::hash & upload"
Run -cmd "pnpm run scripts/dist-packages/print-hashes"
Run -cmd "pnpm run scripts/dist-packages/upload"
echo "::endgroup::"
