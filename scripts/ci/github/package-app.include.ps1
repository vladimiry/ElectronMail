$ErrorActionPreference = 'Stop'

function Run {
    param (
        [Parameter(Mandatory = $true)]
        [string]$cmd,
        [switch]$SilentCmd,
        [switch]$AllowFailure
    )
    if (-not $SilentCmd) {
        Write-Host "Running: $cmd"
    }
    cmd.exe /c $cmd
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        Write-Error "Command failed with exit code $exitCode"
        exit $exitCode
    }
    return $exitCode
}

function RunWithCollectedOutput {
    param (
        [Parameter(Mandatory = $true)]
        [string]$cmd,
        [switch]$SilentCmd,
        [switch]$AllowFailure
    )
    if (-not $SilentCmd) {
        Write-Host "Running: $cmd"
    }
    $output = cmd.exe /c $cmd
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        Write-Error "Command failed with exit code $exitCode"
        exit $exitCode
    }
    return $output
}

function Resolve-VcVarsPath {
    param (
        [Parameter(Mandatory = $true)]
        [string]$vsInstallRoot
    )
    $ErrorActionPreference = "Stop"
    $vsLabel = "VS 2019 Build Tools"
    $vcVarsFile = "vcvarsall.bat"
    $vcVarsPath = "$vsInstallRoot\BuildTools\VC\Auxiliary\Build\$vcVarsFile"
    if (!(Test-Path $vcVarsPath)) {
        Write-Host "⚠️ ${vsLabel} not found. Attempting to install..."
        $installerPath = "$env:TEMP\\vs_buildtools.exe"
        $vsInstallerUrl = "https://aka.ms/vs/16/release/vs_buildtools.exe"
        try {
            Invoke-WebRequest -Uri $vsInstallerUrl -OutFile $installerPath -UseBasicParsing
            Write-Host "📦 Downloaded ${vsLabel} installer."
            $installArgs = @(
                "--quiet",
                "--wait",
                "--norestart",
                "--nocache",
                "--installPath `"$vsInstallRoot\BuildTools`"",
                "--add Microsoft.VisualStudio.Workload.VCTools",
                "--add Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
                "--add Microsoft.VisualStudio.Component.Windows10SDK.19041"
            ) -join " "
            $process = Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -PassThru
            Write-Host "✅ ${vsLabel} installer exited with code $($process.ExitCode)"
        } catch {
            Write-Error "❌ Failed to install ${vsLabel}: $_"
            exit 1
        }
        if (!(Test-Path $vcVarsPath)) {
            Write-Host "🔍 ${vcVarsFile} still not found at expected location. Scanning filesystem for alternatives..."
            $foundItems = Get-ChildItem -Path $vsInstallRoot -Recurse -Filter $vcVarsFile -ErrorAction SilentlyContinue
            if ($foundItems.Count -gt 0) {
                Write-Host "🔎 Found the following ${vcVarsFile} files:"
                $foundItems | ForEach-Object { Write-Host " - $($_.FullName)" }
            } else {
                Write-Host "❌ No ${vcVarsFile} files found in ${vsInstallRoot}"
            }
            Write-Error "❌ ${vcVarsFile} not found at expected location after installation. Failing build."
            exit 1
        }
    }
    return $vcVarsPath
}

function Resolve-DumpbinExe {
    param (
        [Parameter(Mandatory = $true)]
        [string]$vsInstallRoot
    )
    $dumpbinName = "dumpbin.exe"
    $searchRoots = @(
        $vsInstallRoot,
        "C:\Program Files (x86)\Microsoft Visual Studio",
        "C:\Program Files\Microsoft Visual Studio"
    )
    $foundPaths = @()
    foreach ($root in $searchRoots) {
        if (Test-Path $root) {
            $candidates = Get-ChildItem -Path $root -Recurse -Filter $dumpbinName -ErrorAction SilentlyContinue |
                          Where-Object { $_.FullName -match "\\VC\\Tools\\MSVC\\.*\\bin\\Host.*\\.*\\$dumpbinName$" }

            foreach ($match in $candidates) {
                $foundPaths += $match.FullName
            }
        }
    }
    if ($foundPaths.Count -gt 0) {
        # optional: sort by version if needed
        return $foundPaths[0] # just first match
    }
    throw "$dumpbinName not found under known Visual Studio paths."
}

function Resolve-StringsExe {
    $stringsUrl = "https://download.sysinternals.com/files/Strings.zip"
    $zipPath = "$env:TEMP\Strings.zip"
    $extractPath = "$env:TEMP\Strings"
    try {
        Invoke-WebRequest -Uri $stringsUrl -OutFile $zipPath -UseBasicParsing -ErrorAction Stop
        Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force -ErrorAction Stop
        $stringsExe = "$extractPath\Strings.exe"
        Write-Host "✅ Downloaded and extracted Strings.exe"
        return $stringsExe
    } catch {
        Write-Error "❌ Failed to download or extract Strings.exe: $_"
        exit 1  # GitHub Actions will see this as failure
    }
}
