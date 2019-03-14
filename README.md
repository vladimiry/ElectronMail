# ElectronMail

is an [Electron](https://electronjs.org)-based unofficial desktop client for [ProtonMail](https://protonmail.com/) and [Tutanota](https://tutanota.com/) end-to-end encrypted email providers. The app aims to provide enhanced desktop user experience enabling features that are not supported by the official in-browser web clients. 
It is written in [TypeScript](http://www.typescriptlang.org) and uses [Angular](https://angular.io).

[![Build Status: Linux / MacOS](https://travis-ci.org/vladimiry/ElectronMail.svg?branch=master)](https://travis-ci.org/vladimiry/ElectronMail) [![Build status: Windows](https://ci.appveyor.com/api/projects/status/vex909uhwadrse27?svg=true)](https://ci.appveyor.com/project/vladimiry/ElectronMail)

![view-toggling](images/search.gif)

## <a name="download"></a>Download

The download page with Linux/OSX/Windows installation packages is [here](https://github.com/vladimiry/ElectronMail/releases).

`Pacman` and `Snap` packages are also available for installing from the following repositories (both repositories are being maintained by [@joshirio](https://github.com/joshirio)):

[![Get it from the AUR](images/aurlogo.png)](https://aur.archlinux.org/packages/electronmail-bin)

[![Get it from the Snap Store](https://snapcraft.io/static/images/badges/en/snap-store-black.svg)](https://snapcraft.io/electron-mail)

## <a name="features"></a>Features

- **Cross platform**, Linux/OSX/Windows.
- **Multi email providers** support.
- **Multi accounts** support per each email provider. Individual entry point domain selection is [enabled](https://github.com/vladimiry/ElectronMail/issues/29).
- **Automatic login into the app** with remembered master password using [keytar](https://github.com/atom/node-keytar) module ("Keep me signed in" feature).
- **Automatic login into the email accounts**, including filling [2FA tokens](https://github.com/vladimiry/ElectronMail/issues/10).
- **Encrypted settings storage** with switchable predefined key derivation and encryption presets. Argon2 is used as the default key derivation function.
- **Native notifications** for individual accounts clicking on which focuses the app window and selects respective account in the accounts list.
- **System tray icon** with a total number of unread messages shown on top of it. Enabling [local messages store](https://github.com/vladimiry/ElectronMail/issues/32) improves this feature ([how to enable](https://github.com/vladimiry/ElectronMail/releases/tag/v2.0.0-beta.1)), see respective [issue](https://github.com/vladimiry/ElectronMail/issues/30).
- **Switchable view layouts** (full, tabs and dropdown). See details [here](https://github.com/vladimiry/ElectronMail/issues/36) and screenshots in [images](images) folder.
- **Batch emails export** to EML files. Feature released with [v2.0.0-beta.4](https://github.com/vladimiry/ElectronMail/releases/tag/v2.0.0-beta.4) version, requires `local messages store` feature to be enabled ([how to enable](https://github.com/vladimiry/ElectronMail/releases/tag/v2.0.0-beta.1)).
- **Full-text search**. Enabled with [v2.2.0](https://github.com/vladimiry/ElectronMail/releases/tag/v2.2.0) release.
- Option to use a **built-in/prepackaged web client** instead of loading the online page. The built-in web clients are built from source code, see respective official [Protonmail](https://github.com/ProtonMail/WebClient) and [Tutanota](https://github.com/tutao/tutanota) repositories. See [original](https://github.com/vladimiry/ElectronMail/issues/79) issue for details.
- Start **minimized to tray**.
- **Close to tray**.

## <a name="build"></a>How to build package from source code

- Regardless of the platform you are working on, you will need to have Node.js v10 installed. v10 as it's recommended to go with the same Node.js version Electron comes with. If you already have Node.js installed, but not the version 10, then you might want to use [Node Version Manager](https://github.com/creationix/nvm) to be able to switch between multiple Node.js versions:
  - Install [NVM](https://github.com/creationix/nvm).
  - Run `nvm install 10`.
  - Run `nvm use 10`.
- Some native modules require node prebuilds files compiling and for that Python and C++ compiler need to be installed on your system:
  - On `Windows`: the simplest way to install all the needed stuff on Windows is to run `npm install --global --production windows-build-tools` CLI command. [Tutanota](https://github.com/tutao/tutanota) and [ProtonMail](https://github.com/ProtonMail/WebClient) web clients projects require bash for building, so a few more steps need to be fulfilled:
    - Install bash then check the path of bash ex: `C:\\Program Files\\git\\bin\\bash.exe`.
    - Execute `npm config set script-shell "C:\\Program Files\\git\\bin\\bash.exe"` command.
  - On `Linux`: `python v2.7`, `make` and a C/C++ compiler toolchain, like `GCC` are most likely already installed. Besides [keytar](https://github.com/atom/node-keytar) needs `libsecret` library to be installed.
  - On `Mac OS X`: `python v2.7` and [Xcode](https://developer.apple.com/xcode/download/) need to be installed. You also need to install the `Command Line Tools` via Xcode, can be found under the `Xcode -> Preferences -> Downloads` menu.
- [Clone](https://help.github.com/articles/cloning-a-repository/) this project to your local device. If you are going to contribute, consider cloning the [forked](https://help.github.com/articles/fork-a-repo/) into your own GitHub account project.
- Install [Yarn](https://yarnpkg.com/en/docs/install).
- Install dependencies running `yarn --pure-lockfile`.
- Build app running `yarn run app:dist`. It's better to not touch a mouse during the process, since it might interfere with the `e2e` tests running at the end of the process.
- Build a package to install running `yarn run electron-builder:dist` command to build Windows/Mac OS X package and one of the following commands to build Linux package:
  - `yarn run electron-builder:dist:linux:appimage`
  - `yarn run electron-builder:dist:linux:deb`
  - `yarn run electron-builder:dist:linux:freebsd`
  - `yarn run electron-builder:dist:linux:pacman`
  - `yarn run electron-builder:dist:linux:rpm`
  - `yarn run electron-builder:dist:linux:snap`
- If you don't need a package to install, but a folder to execute app from, simply run `yarn run electron-builder:dir` command.  
- Binary executable, whether it's a folder or package to install, comes into the `./dist` folder.

To recap, considering that all the described build requirements are met, the short command to build let's say Arch Linux package will be `yarn --pure-lockfile && yarn app:dist && yarn electron-builder:dist:linux:pacman`.

## <a name="remove"></a>Removing the app

It's recommended to perform the following actions before uninstalling the app:
- If you had the `Keep me signed in` feature enabled (see [screenshot](images/keep-me-signed-in.png)), click `Log-out` action in the app menu (see [screenshot](images/logout.png)). That will remove locally stored master password (done with [node-keytar](https://github.com/atom/node-keytar)). You can also remove it having the app already uninstalled, but that would be a more complicated way as you will have to manually edit the system's keychain.
- Remove settings folder manually. You can locate settings folder path clicking `Open setting folder` app/tray menu item (see [screenshot](images/open-settings-folder.jpg)) or reading `app.getPath(name ="userData")` related `app.getPath(name)` section [here](https://electronjs.org/docs/api/app#appgetpathname). 
