Primary:
- Enable auto-update.
- Release --ia32 builds.
- Make sure that account is in "log-in" state after the restoring from the hibernate/sleep/offline modes.
- Enable "page zoom" feature. 
- Customize about page.
- Enable "in memory store" (paranoid mode feature). Applicable for the config, settings and log files.
- Extend e2e/unit/ui tests.
- Consider putting all the interval/timeout milliseconds value into the `config.json` file.

Backlog:
- ~~Enable "Prettier" based code formatting.~~ - not going to happen, it's too limited thing.
- ~~Move "src/electron/main/store" to a separate/standalone npm module.~~
- Consider using Webpack DLL plugin.
- Turn Webpack configs into the TypeScript.
- Use the only actually needed icons instead of connecting the full "font-awesome" thing (reducing package size).
- Include the only actually needed assets/icons into the platform specific packages (there are custom linux/mac/win platforms icons).
