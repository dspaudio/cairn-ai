# cairn-upgrade

Goal: update the current Cairn installation from the latest source.

Run:

```sh
bunx cairn-ai@latest upgrade
```

Upgrade must run from the package/global source because the cached plugin is replaced. Do not invoke upgrade from a cached plugin locator.

After upgrade, check status with the `cairn-doctor` workflow.
