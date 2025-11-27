#!/usr/bin/env bash

set -ev

ARCH=$(uname -m)
echo "Building on $(uname -m) architecture"

: "${ELECTRON_MAIL_NODE_VERSION:?Missing ELECTRON_MAIL_NODE_VERSION}"
: "${GITHUB_REPOSITORY:?Missing GITHUB_REPOSITORY}"
: "${GITHUB_SHA:?Missing GITHUB_SHA}"

export DEBIAN_FRONTEND=noninteractive

echo "::group::setup system packages"
apt-get update
# libsecret-1-dev: for "keytar" compiling
apt-get install --yes --no-install-recommends \
  wget lsb-release build-essential python3 git libtool automake \
  libsecret-1-dev
echo "::endgroup::"

echo "::group::setup gcc12"
apt-get install --yes --no-install-recommends software-properties-common gnupg2
add-apt-repository ppa:ubuntu-toolchain-r/test -y
apt-get update -o Acquire::Languages=none
if apt-get install --yes --no-install-recommends gcc-12 g++-12 >/dev/null 2>&1; then
  update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-12 120 --slave /usr/bin/g++ g++ /usr/bin/g++-12
  echo "GCC 12 installed and set as default"
else
  apt-get install --yes --no-install-recommends gcc-11 g++-11
  update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-11 110 --slave /usr/bin/g++ g++ /usr/bin/g++-11
  echo "GCC 12 unavailable; using GCC 11 (still C++20-capable for <source_location>)"
fi
echo "::endgroup::"

echo "::group::setup clang/ldd"
wget https://apt.llvm.org/llvm.sh
chmod +x llvm.sh
./llvm.sh 20
rm llvm.sh
echo "::endgroup::"

echo "::group::setup nodejs & pnpm"
apt-get install --yes --no-install-recommends ca-certificates curl gnupg
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${ELECTRON_MAIL_NODE_VERSION}.x nodistro main" \
  | tee /etc/apt/sources.list.d/nodesource.list
apt update
apt-get install --yes --no-install-recommends nodejs
node -v
npm -v
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v
echo "::endgroup::"

echo "::group::clone project & install node modules"
git clone "https://github.com/${GITHUB_REPOSITORY}" /build
cd /build
git checkout "${GITHUB_SHA}"
pnpm install --frozen-lockfile
echo "::endgroup::"

echo "::group::compile native modules"
export _MY_GH_CI_CLANG___CC="clang-20"
export _MY_GH_CI_CLANG___CXX="clang++-20"
pnpm run prepare-native-deps
echo "::endgroup::"

echo "::group::print GLIBC info && copy compiled .node files back to host"
find node_modules -name '*.node' -exec sh -c '
  echo "$1 [$ARCH GLIBC] info:"
  strings "$1" | grep GLIBC_ | sort | uniq
  echo "$1 Copying..."
  cp --parents "$1" /host/
  echo "-----------------------------"
' _ {} \;
echo "::endgroup::"
