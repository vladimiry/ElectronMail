<p align="center">
  <img src="src/assets/og-image/github-og-image-readme.png">
</p>

ElectronMail is an [Electron](https://electronjs.org)-based unofficial desktop client for [ProtonMail](https://protonmail.com/). The app aims to provide enhanced desktop user experience enabling features that are not supported by the official in-browser web clients.
It is written in [TypeScript](http://www.typescriptlang.org) and uses [Angular](https://angular.io).

[![GitHub Actions CI](https://img.shields.io/github/workflow/status/vladimiry/ElectronMail/GitHub%20Actions%20CI?branch=master&logo=github&label=GitHub%20Actions%20CI)](https://github.com/vladimiry/ElectronMail/actions)
[![License](https://img.shields.io/github/license/vladimiry/ElectronMail.svg?label=License)](https://github.com/vladimiry/ElectronMail/blob/master/LICENSE)
[![GitHub top language](https://img.shields.io/github/languages/top/vladimiry/ElectronMail.svg?label=TypeScript)](https://github.com/vladimiry/ElectronMail/search?l=typescript)

![view-toggling](images/search2.gif)

## Download

The download page with Linux/OSX/Windows installation packages is [here](https://github.com/vladimiry/ElectronMail/releases).

The way of verifying that the installation packages attached to the [releases](https://github.com/vladimiry/ElectronMail/releases) have been assembled from the source code [is being provided](https://github.com/vladimiry/ElectronMail/issues/183).

Some package types are available for installing from the repositories (`AUR/Pacman` and `Snap` repositories are being maintained by [@joshirio](https://github.com/joshirio) and `MPR/Debian` repo by [@hiddeninthesand](https://github.com/hiddeninthesand)):

[![AUR version](https://img.shields.io/aur/version/electronmail-bin?label=AUR)](https://aur.archlinux.org/packages/electronmail-bin)
[![Snapcraft version](https://badgen.net/snapcraft/v/electron-mail?label=Snap)](https://snapcraft.io/electron-mail)
[![Flathub version](https://img.shields.io/flathub/v/com.github.vladimiry.ElectronMail?label=Flathub)](https://flathub.org/apps/details/com.github.vladimiry.ElectronMail)
[![MPR version](https://repology.org/badge/latest-versions/electronmail.svg?header=MPR)](https://mpr.makedeb.org/packages/electronmail-bin)
[![Chocolatey version](https://img.shields.io/chocolatey/v/electron-mail?label=Chocolatey)](https://community.chocolatey.org/packages/electron-mail)
[![Winget version](https://img.shields.io/badge/dynamic/xml?label=Winget&prefix=v&query=%2F%2Ftr%5B%40id%3D%27winget%27%5D%2Ftd%5B3%5D%2Fspan%2Fa&url=https%3A%2F%2Frepology.org%2Fproject%2Felectronmail%2Fversions)](https://github.com/microsoft/winget-pkgs/tree/master/manifests/v/VladimirYakovlev/ElectronMail)

## Features

- :octocat: **Open Source**.
- :gear: **Reproducible builds**. See details in [#183](https://github.com/vladimiry/ElectronMail/issues/183).
- :gear: **Cross platform**. The app works on Linux/OSX/Windows platforms. Binary installation packages located [here](https://github.com/vladimiry/ElectronMail/releases).
- :mag_right: **Full-text search**. Including email **body content** scanning capability. Enabled with [v2.2.0](https://github.com/vladimiry/ElectronMail/releases/tag/v2.2.0) release. See the respective [issue](https://github.com/vladimiry/ElectronMail/issues/92) for details.
- :mag_right: **JavaScript-based/unlimited messages filtering**. Enabled since [v4.11.0](https://github.com/vladimiry/ElectronMail/releases/tag/v4.11.0) release. See the respective [#257](https://github.com/vladimiry/ElectronMail/issues/257) for details. Requires [local store](https://github.com/vladimiry/ElectronMail/wiki/FAQ) feature to be enabled.
- :package: **Offline access to the email messages** (attachments content not stored locally, but emails body content). The [local store](https://github.com/vladimiry/ElectronMail/wiki/FAQ) feature enables storing your messages in the encrypted `database.bin` file (see [FAQ](https://github.com/vladimiry/ElectronMail/wiki/FAQ) for file purpose details). So the app allows you to view your messages offline, running full-text search against them, exporting them to EML/JSON files. etc. Enabled since [v2.0.0](https://github.com/vladimiry/ElectronMail/releases/tag/v2.0.0) release.
- :mailbox: **Multi accounts** support including supporting individual [API entry points](https://github.com/vladimiry/ElectronMail/issues/29). For example, you can force the specific email account added in the app connect to the email provider via the [Tor](https://www.torproject.org/) only by selecting the `Tor version 3 address` API entry point in the dropdown list and configuring a proxy as described in [this](https://github.com/vladimiry/ElectronMail/issues/113#issuecomment-529130116) message.
- :unlock: **Automatic login into the app** with a remembered the system keychain remembered master ([keep me signed in](images/keep-me-signed-in.png) feature). Integration with as a system keychain is done with the [keytar](https://github.com/atom/node-keytar) module. By the way, on Linux [KeePassXC](https://github.com/keepassxreboot/keepassxc) implements the [Secret Service](https://specifications.freedesktop.org/secret-service/latest/) interface and so it can be acting as a system keychain (for details, see the "automatic login into the app"-related point in the [FAQ](https://github.com/vladimiry/ElectronMail/wiki/FAQ)).
- :unlock: **Automatic login into the email accounts**, including filling [2FA tokens](https://github.com/vladimiry/ElectronMail/issues/10). Two auto-login delay scenarios supported in order to make it harder to correlate the identities, see the respective [issue](https://github.com/vladimiry/ElectronMail/issues/121).
- :unlock: **Persistent email account sessions**. The feature introduced since [v4.2.0](https://github.com/vladimiry/ElectronMail/releases/tag/v4.2.0) version with the `experimental` label, [#227](https://github.com/vladimiry/ElectronMail/issues/227). The feature enables the scenario when you to enter the account credentials on the login form only once, manually or automatically by the app, and then you never see the login form anymore for this email account even if you restart the app (unless you explicitly dropped the session in the admin area or it got dropped by the service due to the inactivity/expiration). If this feature is enabled for the account, manual credentials filling is the preferred option as a more secure option since you don't save the account credentials anywhere (`credentials` are encrypted though even if saved, see `settings.bin` file description in the [FAQ](https://github.com/vladimiry/ElectronMail/wiki/FAQ)).
- :closed_lock_with_key: **Encrypted local storage** with switchable predefined key derivation and encryption presets. Argon2 is used as the default key derivation function.
- :gear: **Switchable accounts handle buttons positioning** (`top` , `left`, `left-thin`). See details in [#36](https://github.com/vladimiry/ElectronMail/issues/36) and [#175](https://github.com/vladimiry/ElectronMail/issues/175). Demo screenshots placed in the [images](images) folder (specifically [this](images/controls-view-modes-(top-left-left_thing).gif) image).
- :package: **Batch emails export** to EML files (attachments can optionally be exported in `online / live` mode, not available in `offline` mode since not stored locally). Feature released with [v2.0.0-beta.4](https://github.com/vladimiry/ElectronMail/releases/tag/v2.0.0-beta.4) version, requires [local store](https://github.com/vladimiry/ElectronMail/wiki/FAQ) feature to be enabled.
- :closed_lock_with_key: **Built-in/prepackaged web clients**. The prepackaged with the app proton web clients assembled from source code, see the respective [official repositories](https://github.com/ProtonMail/). See [79](https://github.com/vladimiry/ElectronMail/issues/79) and [80](https://github.com/vladimiry/ElectronMail/issues/80) issues for details.
- :gear: **Configuring proxy per account** support. Enabled since [v3.0.0](https://github.com/vladimiry/ElectronMail/releases/tag/v3.0.0) release. See [113](https://github.com/vladimiry/ElectronMail/issues/113) and [120](https://github.com/vladimiry/ElectronMail/issues/120) issues for details.
- :moon: **Dark mode** support. See details in [#242](https://github.com/vladimiry/ElectronMail/issues/242).
- :bell: **System tray icon** with a total number of unread messages shown on top of it. Enabling [local store](https://github.com/vladimiry/ElectronMail/wiki/FAQ) improves this feature, see [#30](https://github.com/vladimiry/ElectronMail/issues/30).
- :gear: **Starting minimized to tray** and **closing to tray** opt-out features.
- :bell: **Native notifications** for individual accounts clicking on which focuses the app window and selects respective account in the accounts list.
- :calendar: **Calendar notifications / alarms** regardless of the open page (mail/calendar/settings/account/drive). The opt-in feature has been enabled since [v4.9.0](https://github.com/vladimiry/ElectronMail/releases/tag/v4.9.0). See [#229](https://github.com/vladimiry/ElectronMail/issues/229) for details.
- :sunglasses: **Making all email "read"** in a single mouse click. Enabled since [v3.8.0](https://github.com/vladimiry/ElectronMail/releases/tag/v3.8.0). Requires [local store](https://github.com/vladimiry/ElectronMail/wiki/FAQ) feature to be enabled.
- :sunglasses: **Routing images through proxy**. The opt-in feature has been enabled since [v4.9.0](https://github.com/vladimiry/ElectronMail/releases/tag/v4.9.0). See [#312](https://github.com/vladimiry/ElectronMail/issues/312) for details.
- :sunglasses: **Batch mails removing** bypassing the trash. Enabled since [v4.9.0](https://github.com/vladimiry/ElectronMail/releases/tag/v4.9.0). Requires [local store](https://github.com/vladimiry/ElectronMail/wiki/FAQ) feature to be enabled.
- :sunglasses: **Batch mails moving between folders**. Enabled since [v4.5.0](https://github.com/vladimiry/ElectronMail/releases/tag/v4.5.0). Requires [local store](https://github.com/vladimiry/ElectronMail/wiki/FAQ) feature to be enabled.
- :sunglasses: **Per-account custom CSS injection (per-account styling)**. Enabled since [v4.10.0](https://github.com/vladimiry/ElectronMail/releases/tag/v4.10.0). See [#355](https://github.com/vladimiry/ElectronMail/issues/355) for details.

- :pencil: **Spell Checking**.

## FAQ

You got it [here](https://github.com/vladimiry/ElectronMail/wiki/FAQ).

## How to build your own installation package from source code

### Building on Continuous Integration server

The [reproducible builds](https://en.wikipedia.org/wiki/Reproducible_builds) idea is respected by the project. So the simplest way to prepare your own installation package from the source code is to clone the project. The respective [GitHub Actions CI config file](.github/workflows/main.yml) comes with the project.

### Building locally

- Regardless of the platform you are working on, you will need to have Node.js v16/lts installed. You might want to use [Node Version Manager](https://github.com/creationix/nvm) to be able to switch between the Node.js versions:
    - Install [NVM](https://github.com/creationix/nvm).
    - Run `nvm install 16`.
    - Run `nvm use 16`.
- Make sure you are using `npm` v7+, not the v6 (run `npm -v` to see the version).
- Some native modules require compiling process to be involved and for that Python and C++ compiler need to be installed on the system:
    - On `Windows`: the simplest way to install all the needed stuff on Windows is to run `npm install --global --production windows-build-tools` CLI command.
    - On `Linux`: `python`, `make` and a C/C++ compiler toolchain, like `GCC` are most likely already installed. Besides [keytar](https://github.com/atom/node-keytar) needs `libsecret` library to be installed.
    - On `macOS`: `python` and [Xcode](https://developer.apple.com/xcode/download/) need to be installed. You also need to install the `Command Line Tools` via Xcode, can be found under the `Xcode -> Preferences -> Downloads` menu.
- ProtonMail's [WebClient](https://github.com/ProtonMail/WebClient) requires `yarn` to be available on your system. Additional setup is required if you run Windows, [see](https://github.com/ProtonMail/proton-shared/wiki/setup-windows).
- Make sure you have [Rust](https://www.rust-lang.org/) installed on the system.
- [Clone](https://help.github.com/articles/cloning-a-repository/) this project to your local device. If you are going to contribute, consider cloning the [forked](https://help.github.com/articles/fork-a-repo/) into your own GitHub account project.
- Install [pnpm](https://pnpm.io/installation).
- Install dependencies running `pnpm install --frozen-lockfile` (setting `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` environment variable might speed up the process).
- Build app running `pnpm run app:dist`.
- Build a package to install running `pnpm run electron-builder:dist` command to build Windows/Mac OS X package and one of the following commands to build Linux package:
    - `pnpm run electron-builder:dist:linux:appimage`
    - `pnpm run electron-builder:dist:linux:deb`
    - `pnpm run electron-builder:dist:linux:freebsd`
    - `pnpm run electron-builder:dist:linux:pacman`
    - `pnpm run electron-builder:dist:linux:rpm`
    - `pnpm run electron-builder:dist:linux:snap`
- The assembled installation package comes into the `./dist` folder.

To recap, considering that all the described build requirements are met, the short command to build let's say Arch Linux package will be `pnpm install --frozen-lockfile && pnpm run app:dist && pnpm run electron-builder:dist:linux:pacman`.

## Data/config files created and used by the app

If you want to backup the app data these are only files you need to take care of (files localed in the [settings folder](images/open-settings-folder.jpg)):
- `config.json` file keeps config parameters. There is no sensitive data in this file, so unencrypted.
- `settings.bin` file keeps added to the app accounts including credentials if a user decided to save them. The file is encrypted with 32 bytes length key derived from the master password.
- `database.bin` file is a local database that keeps fetched emails/folders/contacts entities if the `local store` feature was enabled for at least one account. The file is encrypted with 32 bytes length key randomly generated and stored in `settings.bin`. The app by design flushes and loads to memory the `database.bin` file as a whole thing but not like encrypting only the specific columns of the database. It's of course not an optimal approach in terms of performance and resource consumption but it allows keeping the metadata hidden. You can see some details [here](https://github.com/vladimiry/ElectronMail/issues/32).
- `database-session.bin` file is being used in the same way and for the same purpose as `database.bin` but it holds the current session data only. The data from this file will be merged to the `database.bin` on the next app unlocking with the master password.
- `session.bin` file holds the session data of the email accounts. The file is used if the `Persistent Session` feature is enabled for at least one account (the feature introduced since [v4.2.0](https://github.com/vladimiry/ElectronMail/releases/tag/v4.2.0) version with `experimental` label, [#227](https://github.com/vladimiry/ElectronMail/issues/227)). The file is encrypted with 32 bytes length key randomly generated and stored in `settings.bin`.
- `log.log` file keeps log lines. The log level by default is set to `error` (see `config.json` file).

## Removing the app

It's recommended to perform the following actions before uninstalling the app:
- If you had the `Keep me signed in` feature enabled (see [screenshot](images/keep-me-signed-in.png)), click `Log-out` action in the app menu (see [screenshot](images/logout.png)). That will remove locally stored master password (done with [node-keytar](https://github.com/atom/node-keytar)). You can also remove it having the app already uninstalled, but that would be a more complicated way as you will have to manually edit the system's keychain.
- Remove settings folder manually. You can locate settings folder path clicking `Open setting folder` app/tray menu item (see [screenshot](images/open-settings-folder.jpg)) or reading `app.getPath(name ="userData")` related `app.getPath(name)` section [here](https://electronjs.org/docs/api/app#appgetpathname). 
