#!/usr/bin/env bash

set -ev

: "${ELECTRON_MAIL_NODE_VERSION:?Missing ELECTRON_MAIL_NODE_VERSION}"
: "${GITHUB_REPOSITORY:?Missing GITHUB_REPOSITORY}"
: "${GITHUB_SHA:?Missing GITHUB_SHA}"

export DEBIAN_FRONTEND=noninteractive

apt-get update

echo "::group::isntall nodejs & pnpm"
apt-get install --yes --no-install-recommends ca-certificates curl gnupg
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${ELECTRON_MAIL_NODE_VERSION}.x nodistro main" \
  | tee /etc/apt/sources.list.d/nodesource.list
apt update
apt-get install --yes nodejs
node -v
npm -v
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v
echo "::endgroup::"

echo "::group::install system packages"
apt-get install --yes --no-install-recommends wget lsb-release software-properties-common build-essential python3 git
echo "::endgroup::"

echo "::group::install clang/ldd setup"
wget https://apt.llvm.org/llvm.sh
chmod +x llvm.sh
./llvm.sh 20
rm llvm.sh
echo "::endgroup::"

# picket form "./scripts/ci/github/package-app-linux.sh" of v5.3.0 release (when it still used "ubuntu-20.04" GH CI image)
echo "::group::install and configure compiling tools"
apt-get install --yes --no-install-recommends \
  libtool automake gcc-10 g++-10 libsecret-1-dev
update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-10 100 \
  --slave /usr/bin/g++ g++ /usr/bin/g++-10 \
  --slave /usr/bin/gcov gcov /usr/bin/gcov-10
echo "::endgroup::"

echo "::group::clone project & install node modules"
git clone "https://github.com/${GITHUB_REPOSITORY}" /build
cd /build
git checkout "${GITHUB_SHA}"
pnpm install --frozen-lockfile
echo "::endgroup::"

echo "::group::compile native modules"
export _MY_GH_CI_NODE_GYP___CC="gcc-10"
export _MY_GH_CI_NODE_GYP___CXX="g++-10"
export _MY_GH_CI_CLANG___CC="clang-20"
export _MY_GH_CI_CLANG___CXX="clang++-20"
pnpm run prepare-native-deps
echo "::endgroup::"

echo "::group::print GLIBC info && copy compiled .node files back to host"
find node_modules -name '*.node' -exec sh -c '
  echo "$1 [GLIBC] info:"
  strings "$1" | grep GLIBC_ | sort | uniq
  echo "$1 Copying..."
  cp --parents "$1" /host/
  echo "-----------------------------"
' _ {} \;
echo "::endgroup::"
