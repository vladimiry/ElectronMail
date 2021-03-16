# running this script is omitted for the packaging job since cached dependencies used, see "github actions" config for details

echo "::group::system setup"
./scripts/ci/github/system-setup.ps1 -IncludeWin81Sdk $true
npm config set msvs_version 2017
echo "::endgroup::"

echo "::group::install node modules"
yarn --pure-lockfile --network-timeout 60000
echo "::endgroup::"
