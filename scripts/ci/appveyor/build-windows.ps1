# TODO make the script work like "set -ev"-like sh script, ie exit immediately if any command fails

$headers = @{
    "Authorization" = "Bearer $EMAIL_SECURELY_APP_APPVEYOR_API_KEY"
    "Content-type" = "application/json"
}
$project = Invoke-RestMethod -Uri "https://ci.appveyor.com/api/projects/$env:APPVEYOR_ACCOUNT_NAME/$env:APPVEYOR_PROJECT_SLUG" -Headers $headers -Method GET
$linuxJob = $project.build.jobs | where { $_.name -eq $env:LINUX_JOB_NAME_PATTERN }
$linuxJobId = $linuxJob.jobId;
$linuxJobCompleted = $linuxJob.status -eq "success"
if (!$linuxJobCompleted){
    throw "Job `"$env:LINUX_JOB_NAME_PATTERN`" has been finished with `"$linuxJob.status`" status"
}
if (!$linuxJobId) {
    throw "Failed to resolve i`"$env:LINUX_JOB_NAME_PATTERN`" job id"
}
Start-FileDownload https://ci.appveyor.com/api/buildjobs/$linuxJobId/artifacts/$env:LINUX_JOB_ARTIFACT_TAR
