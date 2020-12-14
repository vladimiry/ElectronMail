$ErrorActionPreference = 'Stop'

# TODO remove the following system tweaking if no significant performance boost noticed

@($( gl | foreach Path ), $( yarn cache dir ), $( npm config get cache )) | foreach {
    $_quoted = "`"$_`"";
    echo "ExclusionPath: $_quoted";
    Add-MpPreference -ExclusionPath $_quoted;
}

@('node.exe', 'npm.cmd', 'yarn.cmd', 'python.exe') | foreach { gcm $_ } | ForEach-Object Source | foreach {
    $_quoted = "`"$_`"";
    echo "ExclusionProcess: $_quoted";
    Add-MpPreference -ExclusionProcess $_quoted;
}

Start-Process -PassThru -Wait PowerShell -ArgumentList "'-Command Set-MpPreference -DisableArchiveScanning \$true'"
Start-Process -PassThru -Wait PowerShell -ArgumentList "'-Command Set-MpPreference -DisableBehaviorMonitoring \$true'"
Start-Process -PassThru -Wait PowerShell -ArgumentList "'-Command Set-MpPreference -DisableRealtimeMonitoring \$true'"
