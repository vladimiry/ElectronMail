#!/bin/bash

set -ev

echo "::group::tweak the system"
sudo apt-get update
# <purpose: native modules compiling>
sudo apt-get install --yes --no-install-recommends libtool automake gcc-10 g++-10
sudo update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-10 100 --slave /usr/bin/g++ g++ /usr/bin/g++-10 --slave /usr/bin/gcov gcov /usr/bin/gcov-10
# purpose: compiling "desktop-idle" native module (issue: No package 'xscrnsaver' found)
sudo apt-get install --yes --no-install-recommends libxss-dev
# purpose: tweaking snap package ("unsquashfs" binary)
sudo apt-get install --yes --no-install-recommends snapcraft squashfs-tools
# purpose: compiling "node-keytar" native module and keychain initialization
sudo apt-get install --yes --no-install-recommends libsecret-1-dev
# purpose: pacman build fails also due missing "bsdtar", see https://github.com/jordansissel/fpm/issues/1453#issuecomment-356138549
sudo apt-get install --yes --no-install-recommends libarchive-tools
# purpose: AppImage re-packaging
sudo apt-get install --yes --no-install-recommends desktop-file-utils
# </purpose: native modules compiling>
export CC=gcc-10
export CXX=g++-10
echo "::endgroup::"

# assuming that "ubuntu-22.04" image comes with glibc v2.31, see https://github.com/vladimiry/ElectronMail/issues/389#issuecomment-812071591
GLIBC_INFO_EXPECTED_SUB="release version 2.35"
GLIBC_INFO=$(lsof -p $$ | grep libc | awk ' { print $NF" --version"; } ' | sh)
echo $GLIBC_INFO
if [[ "$GLIBC_INFO" != *"$GLIBC_INFO_EXPECTED_SUB"* ]]; then
    echo >&2 "unexpected glibc version detected"
    exit 1
fi

echo "::group::compile native modules"
pnpm run prepare-native-deps
echo "::endgroup::"

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
