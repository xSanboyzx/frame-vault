# Development

## Tools and checks

Use the versions in the README and lockfiles. `npm run doctor` checks the C++ workload, Windows SDK, WebView2, Python, uv and Rust. It reports missing prerequisites without installing system components automatically.

Run `npm run check` before committing. Python and Rust formatters can be run explicitly:

```powershell
python -m uv run --project backend ruff format backend
cargo fmt --manifest-path src-tauri/Cargo.toml
```

The Windows CI workflow installs the locked dependencies, runs the same checks, builds the installer, smoke-tests the packaged worker and installer lifecycle, and retains the installer as an artifact. It does not publish a release.

## Troubleshooting

- **Missing analytics environment:** run `npm run setup`. The worker must use `backend/.venv`, not global Python packages.
- **Engine unavailable:** use Retry connection. Inspect the local Tauri log for worker startup or protocol errors. Only protocol JSON may be written to Python stdout.
- **Rust or linker missing:** reopen the terminal after rustup installation and check the Visual Studio C++ workload and Windows SDK.
- **Port 1420 occupied:** stop the other Vite process before starting desktop development; strict port mode prevents a silent mismatch.
- **Browser preview unavailable:** expected. Use `npm run dev` for the Tauri bridge and engine.
- **EPERM while running npm ci:** stop the desktop development process and installer build first. Windows locks the loaded Tauri CLI native module.
- **Installer warning:** local artifacts are unsigned. Signing and public distribution are future work.
- **Installer cannot find Python DLLs:** `_internal` must be preserved beside the sidecar executable. Rebuild with `npm run build`, not a bare release Cargo build.

Do not commit personal recordings, local databases, virtual environments, or generated binaries. Add small, documented and anonymized fixtures when implementing CSV import.
