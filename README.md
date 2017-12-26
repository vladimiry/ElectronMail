# protonmail-desktop-app

is an unofficial [ProtonMail](https://protonmail.com/) desktop client. It's basically the ProtonMail's [web interface](https://mail.protonmail.com) that's being opened inside the [Electron](https://github.com/electron/electron) container with custom features built on top of it. You can see below the screenshots of the `default` and `compact` view modes.

![view-default](https://user-images.githubusercontent.com/1560781/34328616-a10c2a2a-e8f4-11e7-9cfe-2308ee3391b2.png)

![view-compact](https://user-images.githubusercontent.com/1560781/34328615-a0efd0be-e8f4-11e7-8c1e-09af27073127.png)

## Features
- Cross platform, Linux/OSX/Windows packages [provided](https://github.com/vladimiry/protonmail-desktop-app/releases).
- Multi accounts support.
- Automatic login into the app with remembered master password ("Keep me signed in" feature).
- Auto login into the accounts using either saved in the settings password or KeePass password manager.
- Encrypted settings storage with switchable predefined key derivation and encryption presets. Argon2 is used as the default key derivation function.
- Native notifications for individual accounts clicking on which focuses the app window and selects respective account in the accounts list.
- System tray icon with a total number of unread messages shown on top of it.
- Start minimized to tray.
- Close to tray.
- Compact view mode.

## TODO
- The following features are already toggleable/configurable via the `config.json` file (you can reach the `config.json` file clicking "Open Settings Folder" item in the app menu), but so far there is no UI to configure them:
  - Notifications.
  - Start minimized to tray.
  - Close to tray.
  - Key derivation and encryption presets selection.
