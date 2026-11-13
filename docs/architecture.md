# Architecture

Frame Vault is a Windows desktop app. Its React interface is rendered in Tauri's WebView2 window. Rust owns the worker process, timeouts, and Windows lifecycle. Python owns numerical analysis and future SQLite persistence.

```text
React / TypeScript
  └─ invoke("engine_health")
      └─ Rust EngineManager (one worker per application instance)
          └─ stdin/stdout JSON lines
              └─ Python + NumPy + Pandas + SQLite
```

## Protocol version 1

UTF-8, one JSON message per line, flushed after every response. Requests contain `protocolVersion`, a nonempty string `id`, and `command`. Only `health` and `shutdown` are supported. Responses echo the request ID and contain exactly one of `result` or `error`. Invalid input without a usable ID returns `id: null` (omitted when serialized). A malformed request does not stop the worker. Shutdown responds before exiting; stdin EOF also exits.

```json
{"protocolVersion":1,"id":"1","command":"health"}
{"protocolVersion":1,"id":"1","result":{"engineVersion":"0.0.1","protocolVersion":1,"pythonVersion":"3.13.1","dependencies":{"numpy":"<installed version>","pandas":"<installed version>","sqlite":"<runtime version>"}}}
```

Errors use `{ "code": "UNKNOWN_COMMAND", "message": "..." }`. Other codes are `INVALID_REQUEST`, `PROTOCOL_MISMATCH`, and `INTERNAL_ERROR`. Python validates requests with strict Pydantic models. Rust validates the response envelope, ID, protocol version, and typed health result. TypeScript exposes `EngineHealth`; the interface never receives a process handle or a general command executor.

The health command exercises NumPy/Pandas and an in-memory SQLite query before reporting availability. It neither opens a persistent database nor analyzes a benchmark.

## Lifecycle and failures

The first health request starts the worker. Requests are serialized through an asynchronous mutex and each has a 30-second deadline. Stdout responses have a 64 KiB limit. Diagnostics use stderr and the application's rotating local log. Protocol errors, broken pipes, EOF, and timeouts remove and terminate the worker. A subsequent explicit retry starts a fresh worker.

Normal application shutdown requests worker shutdown with a two-second grace period and then reaps the process. Windows Job Objects use `KILL_ON_JOB_CLOSE` to terminate workers if the app crashes or is forcibly stopped. Worker windows are hidden while stdin/stdout remain available. The desktop runs as the current user.

## Development and distribution

Development uses `backend/.venv/Scripts/python.exe -u -m frame_vault_engine`. A clean development checkout requires no generated sidecar artifacts. Release configuration adds the bundled executable and supporting files; PyInstaller directory mode keeps `_internal` alongside `frame-vault-engine.exe`. The executable and its libraries are installed beside the desktop binary. Target-suffixed sidecar filenames exist only during the Tauri build.

The frontend has no shell, filesystem, or HTTP plugin permissions. Its production CSP permits local application assets and Tauri IPC. No network service, account, or cloud backend is needed. Data directories are resolved by Tauri and supplied to Python through `FRAME_VAULT_DATA_DIR` for future persistence.

## Dependency ownership

- npm: interface, ECharts Canvas adapter, frontend quality tools, Tauri CLI.
- Cargo: desktop runtime, typed bridge, process supervision and logging.
- uv: Python analysis, validation, tests, type checks and packaging.
- Python standard library: SQLite and protocol transport.

Commit all three lockfiles. ECharts is imported through a modular chart component; the welcome page does not load a chart or render sample metrics. PresentMon and LibreHardwareMonitor integration will be designed independently when capture and sensors are implemented.
