# Roadmap

The initial foundation is version 0.0.1. Desktop packaging starts here so later features run inside the actual Windows application.

1. **0.1 — Benchmark Analyzer:** import real PresentMon CSVs, define metric semantics, compute average FPS, 1% lows, frame-time percentiles and stutter events, and display interactive graphs.
2. **0.2 — Benchmark Vault:** local session persistence by game, date and graphics configuration; A/B comparisons with attention to frame-time stability and repeatability.
3. **0.3 — Live Hardware Telemetry:** synchronize CPU/GPU utilization, temperatures, clocks and memory readings with frame performance.
4. **0.4 — Explainable Diagnostics:** validate rules for sustained GPU saturation, thermal throttling and unusual frame-time spikes against controlled recordings.
5. **1.0 — Complete Desktop Workflow:** one-click capture, session management, comparison reports and a polished installer and release process.

[Intel PresentMon](https://github.com/GameTechDev/PresentMon) is the planned Windows frame-capture integration. [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) is the planned sensor integration; it is a .NET library, and some readings require administrator privileges. Design its helper process and privilege boundary during the telemetry milestone. Neither is bundled yet.

Machine learning follows validated statistical diagnostics and a suitable labeled dataset. No scikit-learn dependency, model training, database schema or benchmark metric definitions are introduced by the foundation.
