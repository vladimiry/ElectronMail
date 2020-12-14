#!/bin/bash

set -ev

echo "::group::build assets"
yarn assets
echo "::endgroup::"

echo "::group::build native modules"
sudo apt-get update
# purpose: native modules compiling
sudo apt-get install --yes --no-install-recommends libtool automake g++-7
# purpose: compiling "desktop-idle" native module
sudo apt-get install --yes --no-install-recommends libxss-dev
# purpose: tweaking snap package ("unsquashfs" binary)
sudo apt-get install --yes --no-install-recommends snapcraft squashfs-tools
# purpose: compiling "node-keytar" native module and keychain initialization
sudo apt-get install --yes --no-install-recommends libgnome-keyring-dev libsecret-1-dev
# purpose: pacman fails also due missing "bsdtar", see https://github.com/jordansissel/fpm/issues/1453#issuecomment-356138549
sudo apt-get install --yes --no-install-recommends libarchive-tools
# purpose: native modules compiling
export CC=gcc-7
export CXX=g++-7
npm run clean:prebuilds
npx --no-install electron-builder install-app-deps --arch=x64
echo "::endgroup::"

echo "::group::test:e2e:setup"
# purpose: activating "gnome-keyring"
sudo apt-get install --yes --no-install-recommends libsecret-1-0 gnome-keyring dbus dbus-x11 xvfb libsecret-tools
# init involved folders
mkdir -p ~/.cache
mkdir -p ~/.local/share/keyrings
# init xvfb stuff
export DISPLAY=":99.0"
Xvfb :99 -screen 0 1280x1024x24 >/dev/null 2>&1 &
sleep 3
# activate dbus and gnome-keyring daemon
export $(dbus-launch)
echo "" | gnome-keyring-daemon --unlock
gnome-keyring-daemon --start --daemonize --components=secrets
export $(echo "" | gnome-keyring-daemon -r -d --unlock)
# verify that "gnome-keyring" has actually activated the "secret service" d-bus interface/implementation
echo -n "secret-tool-password-1" | secret-tool store --label=secret-tool-label-1 secret-tool-key-1 secret-tool-value-1
# secret-tool search secret-tool-key-1 secret-tool-value-1 # disabled since it often core dumps
# disable user namespaces so the suid/fallback sandbox takes place
# sudo sysctl kernel.unprivileged_userns_clone=1
# enable user namespaces so the suid/fallback sandbox doesn't take place
sudo sysctl kernel.unprivileged_userns_clone=1
# init suid/fallback sandbox
# sudo ./scripts/prepare-chrome-sandbox.sh ./node_modules/electron/dist/chrome-sandbox
echo "::endgroup::"

echo "::group::test:e2e"
# errors without workflow.ts tweaks:
# webdriver: unknown error: unknown error: Chrome failed to start: exited abnormally.
# unknown error: DevToolsActivePort file doesn't exist

# errors with workflow.ts tweaks:
# DEBUG webdriver: request failed due to response error: unknown error
# WARN webdriver: Request failed with status 500 due to unknown error: Chrome failed to start: exited abnormally.

# TODO enable/fix e2e/spectron tests execution on linux system
# yarn test:e2e
echo "::endgroup::"

echo "::group::package"
yarn build:electron-builder-hooks
for PACKAGE_TYPE in "pacman" "snap" "appimage" "deb" "rpm" "freebsd"; do
    yarn "electron-builder:dist:linux:${PACKAGE_TYPE}" --publish onTagOrDraft
    rm -rf ./dist/linux-unpacked
    rm -rf ./dist/*.yaml
done
echo "::endgroup::"

echo "::group::hash & upload"
yarn scripts/dist-packages/print-hashes
yarn scripts/dist-packages/upload
echo "::endgroup::"
