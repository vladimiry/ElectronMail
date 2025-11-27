$ErrorActionPreference = 'Stop'

function Show-VSInfo {
    $vswherePath = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (!(Test-Path $vswherePath)) {
        Write-Error "❌ vswhere.exe not found at $vswherePath"
        return
    }

    Write-Host "🔎 Listing all Visual Studio instances (including prerelease):"
    $null = & $vswherePath -all -prerelease -products * -format json

    Write-Host "`n🔎 Latest Visual Studio installation path:"
    $null = & $vswherePath -latest -products * -property installationPath

    Write-Host "`n🔎 Installed VC toolsets under each instance:"
    $instances = & $vswherePath -all -prerelease -products * -property installationPath
    foreach ($inst in $instances) {
        $msvcRoot = Join-Path $inst "VC\Tools\MSVC"
        if (Test-Path $msvcRoot) {
            Get-ChildItem -Path $msvcRoot -Directory | ForEach-Object {
                Write-Host " - $($_.FullName)"
            }
        } else {
            Write-Host " - No MSVC toolsets found under $inst"
        }
    }

    Write-Host "`n🔎 Check if VC tools are installed:"
    if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
        $null = & $vswherePath -latest -requires Microsoft.VisualStudio.Component.VC.Tools.arm64 -property installationPath
    } else {
        $null = & $vswherePath -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    }

    Write-Host "`n🔎 Check if Windows SDKs are installed:"
    $null = & $vswherePath -latest -requires Microsoft.VisualStudio.Component.Windows10SDK.19041 -property installationPath
}

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
    $vcVarsFile = "vcvarsall.bat"

    # On ARM64: VS2022 Enterprise is already present
    # Non-ARM64: fall back to VS2019 Build Tools install logic

    Show-VSInfo

    if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
        # Enterprise edition under VS2022
        $vcVarsPath = Join-Path $vsInstallRoot "Enterprise\VC\Auxiliary\Build\$vcVarsFile"
        if (Test-Path $vcVarsPath) {
            Write-Host "✅ Found vcvarsall.bat at $vcVarsPath"
            return $vcVarsPath
        } else {
            Write-Error "❌ Expected vcvarsall.bat not found under $vsInstallRoot\Enterprise"
            exit 1
        }
    } else {
        $vsLabel = "VS 2019 Build Tools"
        $vcVarsPath = Join-Path $vsInstallRoot "BuildTools\VC\Auxiliary\Build\$vcVarsFile"
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
        Show-VSInfo
        return $vcVarsPath
    }
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
