#!/bin/bash

set -ev

echo "::group::tweak the system"
sudo apt-get update
# purpose: native modules compiling
sudo apt-get install --yes --no-install-recommends libtool automake g++-7
# purpose: compiling "desktop-idle" native module
sudo apt-get install --yes --no-install-recommends libxss-dev
# purpose: tweaking snap package ("unsquashfs" binary)
sudo apt-get install --yes --no-install-recommends snapcraft squashfs-tools
# purpose: compiling "node-keytar" native module and keychain initialization
sudo apt-get install --yes --no-install-recommends libgnome-keyring-dev libsecret-1-dev
# purpose: pacman build fails also due missing "bsdtar", see https://github.com/jordansissel/fpm/issues/1453#issuecomment-356138549
sudo apt-get install --yes --no-install-recommends libarchive-tools
# purpose: native modules compiling
export CC=gcc-7
export CXX=g++-7
echo "::endgroup::"

echo "::group::build native modules"
yarn postinstall:remove:prebuild-install
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
# init suid/fallback sandbox
# sudo ./scripts/prepare-chrome-sandbox.sh ./node_modules/electron/dist/chrome-sandbox
# disable user namespaces so the suid/fallback sandbox takes place
# sudo sysctl kernel.unprivileged_userns_clone=0
# enable user namespaces so the suid/fallback sandbox doesn't take place
sudo sysctl kernel.unprivileged_userns_clone=1
echo "::endgroup::"

echo "::group::test:e2e"
yarn test:e2e
echo "::endgroup::"

echo "::group::package"
yarn build:electron-builder-hooks
for PACKAGE_TYPE in "pacman" "snap" "appimage" "deb" "rpm" "freebsd"; do
    yarn "electron-builder:dist:linux:${PACKAGE_TYPE}"
    rm -rf ./dist/linux-unpacked
    rm -rf ./dist/*.yaml
done
echo "::endgroup::"

echo "::group::hash & upload"
yarn scripts/dist-packages/print-hashes
yarn scripts/dist-packages/upload
echo "::endgroup::"
