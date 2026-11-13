# Foundation validation

Run the full local checks with `npm run check`. This includes:

- Welcome screen starting/ready states and failure/retry behavior.
- Python health dependencies, malformed messages, unsupported commands, version mismatch, recovery after bad input, shutdown and EOF.
- Rust response validation, real worker round trips, timeouts, unexpected process exits, and Windows Job Object cleanup.

Run `npm run build` and `npm run smoke:engine` to test packaging. Then run:

```powershell
./scripts/smoke-installer.ps1
```

The installer smoke test installs into the ignored `.smoke/Frame Vault Test` directory, starts the app with developer runtimes removed from PATH, waits for a successful health exchange, verifies normal and forced shutdown cleanup, and uninstalls it. It refuses to overwrite a pre-existing test directory. It exercises the actual release binary in a path with spaces. `-KeepInstalled` retains the test installation for visual inspection; uninstall it afterward.

For manual UI validation, launch the installed executable, confirm the Ready badge and returned library versions, resize the window, and check keyboard focus. To verify startup recovery, temporarily move the test installation's worker executable aside, launch the app, confirm Unavailable, restore the executable, then press Retry connection. Close the app and verify the worker exits.

Unsigned builds are development artifacts. CI produces the installer but does not publish a release. Real PresentMon import, sensor compatibility and performance accuracy require their own acceptance tests when those features are implemented.

## Local verification — November 12, 2026

Verified on Windows 11 x64, using Node 22.13.1, Python 3.13.1 and Rust MSVC 1.91.1:

- Locked setup and all formatting, lint, type checks and frontend build passed.
- 16 automated tests passed: 2 interface, 10 Python protocol, and 4 Rust protocol/process tests.
- The bundled worker returned dependency versions with Python and Node removed from PATH.
- The per-user NSIS installer installed to a path containing spaces, ran the release app successfully, and uninstalled.
- Normal shutdown and forced application termination both left no worker process.
- The actual desktop window displayed Ready and the engine's dependency versions.
- The packaged app displayed Unavailable with its worker temporarily missing, then reached Ready after the worker was restored and Retry connection was pressed.

The CI workflow is included; its remote execution is separate from these local results.
