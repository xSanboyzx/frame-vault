# Frame Vault

A local Windows desktop application for understanding PC gaming performance. Built with Tauri 2, React, TypeScript, and a bundled Python analytics engine.

The desktop foundation connects to a real Python worker and verifies NumPy, Pandas, and SQLite. Benchmark import and analysis are the next milestone.

## Requirements

- Windows 11 x64, Node.js 22.13.1 with npm 10.9.2, and Python 3.13.
- Visual Studio 2022 **Desktop development with C++**, including the Windows SDK.
- Microsoft Edge WebView2 Runtime.
- Rust MSVC 1.91.1, with rustfmt and Clippy. The repository's `rust-toolchain.toml` pins the toolchain.
- uv 0.9.9, installed with `python -m pip install --user uv==0.9.9`.

Install Rust using the official [rustup installer](https://rustup.rs/), then open a fresh terminal. See [Tauri's Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows) for the C++ tools and WebView2.

## Get started

```powershell
npm run setup
npm run dev
```

Run commands from the repository root. Setup checks prerequisites, installs the locked npm dependencies, and creates `backend/.venv` from `backend/uv.lock`. The first Rust build takes a few minutes. Development runs the worker from that virtual environment; no Python web server is involved.

| Command                 | Purpose                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `npm run doctor`        | Check Windows development prerequisites                                       |
| `npm run dev`           | Launch the Tauri desktop application                                          |
| `npm run dev:web`       | Interface development in a browser; engine connection is unavailable          |
| `npm run check`         | Formatting, lint, type checks, frontend/Python/Rust tests, and frontend build |
| `npm run format`        | Format JavaScript, TypeScript, CSS, JSON, Markdown, and YAML                  |
| `npm run engine:bundle` | Build the self-contained Python worker                                        |
| `npm run smoke:engine`  | Exercise the bundled worker without developer runtimes on PATH                |
| `npm run build`         | Build the release app and unsigned per-user Windows installer                 |

The installer is created under `src-tauri/target/release/bundle/nsis/`. Python and its numerical libraries are included; end users do not need Node or Python. WebView2 is required, and the installer can download it if missing. Close running development/build processes before reinstalling npm dependencies on Windows.

## Project layout

```text
frontend/    React desktop interface, shared styles, ECharts boundary, UI tests
backend/     Python worker, protocol, analytics dependencies, PyInstaller spec
src-tauri/   Rust bridge, worker lifecycle, desktop and installer configuration
scripts/     Setup, prerequisite checks, checks, packaging and smoke tests
samples/     Documented sample benchmark fixtures (added with CSV import)
docs/        Architecture, development notes, roadmap and validation
```

Application data belongs in `%LOCALAPPDATA%\io.github.xsanboyzx.framevault`; application logs are written by Tauri to the app's log directory under the same Windows local application-data area. Logs contain worker lifecycle and error diagnostics, with a 2 MB rotation limit. No recordings or database are created by this milestone.

See [architecture](docs/architecture.md), [development and troubleshooting](docs/development.md), [roadmap](docs/roadmap.md), and [validation](docs/validation.md). Licensed under [MIT](LICENSE).
