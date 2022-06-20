# priting detailed info about broken patches (sometimes happens on Windows system for some reasons)

$file = "C:\Users\runneradmin\setup-pnpm\node_modules\.pnpm\pnpm@$(pnpm -v)\node_modules\pnpm\dist\pnpm.cjs"
$replaceString = 'if (e instanceof Error && e.message === "hunk header integrity check failed") {'
$replaceWith = "console.log(file); console.log(e); $replaceString"

echo "patching $file file"

(Get-Content $file).replace($replaceString, $replaceWith) | Set-Content $file
