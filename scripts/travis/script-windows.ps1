# TODO remove this file as unused

# TODO explore powershell workflow concepts
# https://docs.microsoft.com/en-us/system-center/sma/overview-powershell-workflows?view=sc-sma-2019

# allow try/catch to do its job
$ErrorActionPreference = 'Stop'

# using Try/Catch efficiently over a large list of commands
# https://foxdeploy.com/2014/07/16/using-trycatch-efficiently-over-a-large-list-of-commands/

$commans = @"
    yarn scripts/transfer travis-download,
    yarn app:dist,
    yarn test:e2e,
    yarn electron-builder:dist,
    yarn scripts/dist-packages/print-hashes,
    yarn scripts/dist-packages/upload
"@

$commans.Split(',') | ForEach-Object {
    Invoke-Expression $_ -ErrorAction Stop
}
