#!/bin/bash

set -ev

echo "::group::tweak the system"
sudo apt-get update
# - snapcraft: for snap tweaking
# - squashfs-tools: for snap tweaking
# - libarchive-tools: includes bsdtar for pacman builds
# - desktop-file-utils: needed for AppImage packaging
sudo apt-get install --yes --no-install-recommends \
  snapcraft \
  squashfs-tools \
  libarchive-tools \
  desktop-file-utils
echo "::endgroup::"

# echo "::group::compile native modules"
# pnpm run prepare-native-deps # moved to "./scripts/ci/github/prepare-native-deps-docker.sh"
# echo "::endgroup::"

echo "::group::test e2e setup"
echo "initializing xvfb stuff..."
export DISPLAY=":99.0"
Xvfb :99 -screen 0 1280x1024x24 >/dev/null 2>&1 &
sleep 3
echo "installing packages needed for activating gnome-keyring (secret service implementation)..."
sudo apt-get install --yes --no-install-recommends gnome-keyring dbus-x11 xvfb libsecret-tools
echo "activating dbus..."
export "$(dbus-launch)"
echo "activating gnome-keyring daemon..."
echo "" | gnome-keyring-daemon --unlock
gnome-keyring-daemon --start --daemonize --components=secrets
export "$(echo '' | gnome-keyring-daemon -r -d --unlock)"
echo "creating a test keychain record and then listing it..."
echo -n "secret-tool-password-1" | secret-tool store --label=secret-tool-label-1 secret-tool-key-1 secret-tool-value-1
# secret-tool search secret-tool-key-1 secret-tool-value-1 # this call sometimes just core dumps, especially on old systems like ubuntu-16.04
# init suid/fallback sandbox
# sudo ./scripts/prepare-chrome-sandbox.sh ./node_modules/electron/dist/chrome-sandbox
# disable user namespaces so the suid/fallback sandbox takes place
# sudo sysctl kernel.unprivileged_userns_clone=0
# enable user namespaces so the suid/fallback sandbox doesn't take place
sudo sysctl kernel.unprivileged_userns_clone=1
echo "::endgroup::"

echo "::group::scan *.node files"
for module in keytar msgpackr-extract sodium-native; do
  find "node_modules/$module" -type f -name '*.node' -exec sh -c '
    echo "$1 [NAPI] info:"
    strings "$1" | grep napi_register_module | sort | uniq
    echo "$1 [GLIBC] info:"
    strings "$1" | grep GLIBC_ | sort | uniq
    echo "-----------------------------"
  ' _ {} \;
done
echo "::endgroup::"

echo "::group::test e2e"
pnpm run test:e2e
echo "::endgroup::"

echo "::group::package"
pnpm run build:electron-builder-hooks
for PACKAGE_TYPE in "pacman" "snap" "appimage" "deb" "rpm" "freebsd"; do
    pnpm run "electron-builder:dist:linux:${PACKAGE_TYPE}"
    rm -rf ./dist/linux-unpacked
    rm -rf ./dist/*.yaml
done
echo "::endgroup::"

echo "::group::hash & upload"
pnpm run scripts/dist-packages/print-hashes
pnpm run scripts/dist-packages/upload
echo "::endgroup::"
