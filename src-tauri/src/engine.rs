use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{path::PathBuf, time::Duration};
use tauri::Manager;
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::Mutex,
    time::timeout,
};

#[cfg(windows)]
#[path = "job.rs"]
mod job;

const PROTOCOL_VERSION: u32 = 1;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_RESPONSE_BYTES: u64 = 64 * 1024;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EngineHealth {
    engine_version: String,
    protocol_version: u32,
    python_version: String,
    dependencies: Dependencies,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Dependencies {
    numpy: String,
    pandas: String,
    sqlite: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Response {
    protocol_version: u32,
    id: Option<String>,
    result: Option<Value>,
    error: Option<EngineError>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EngineError {
    code: String,
    message: String,
}

#[derive(Default)]
pub struct EngineManager {
    worker: Mutex<Option<Worker>>,
}

impl EngineManager {
    pub async fn health(&self, app: &tauri::AppHandle) -> Result<EngineHealth, String> {
        let mut guard = self.worker.lock().await;
        if guard.is_none() {
            *guard = Some(Worker::spawn(app)?);
        }
        let result = async {
            let value = guard.as_mut().unwrap().request("health").await?;
            let health: EngineHealth = serde_json::from_value(value)
                .map_err(|_| "The engine returned an invalid health response.".to_string())?;
            if health.protocol_version != PROTOCOL_VERSION {
                return Err("The engine uses an incompatible protocol version.".into());
            }
            log::info!(
                "Analytics engine ready (protocol {})",
                health.protocol_version
            );
            Ok(health)
        }
        .await;
        if let Err(error) = &result {
            log::error!("Engine health failed: {error}");
            if let Some(mut worker) = guard.take() {
                worker.terminate().await;
            }
        }
        result
    }

    pub async fn shutdown(&self) {
        if let Some(mut worker) = self.worker.lock().await.take() {
            let _ = timeout(Duration::from_secs(2), worker.request("shutdown")).await;
            worker.terminate().await;
        }
    }
}

struct Worker {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    sequence: u64,
    stderr_task: tokio::task::JoinHandle<()>,
    #[cfg(windows)]
    _job: job::Job,
}

fn worker_command(app: &tauri::AppHandle) -> Result<Command, String> {
    let mut command;
    if cfg!(debug_assertions) {
        let backend = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../backend");
        let python = backend.join(".venv/Scripts/python.exe");
        if !python.is_file() {
            return Err(
                "The analytics environment is missing. Run npm run setup, then retry.".into(),
            );
        }
        command = Command::new(python);
        command
            .args(["-u", "-m", "frame_vault_engine"])
            .current_dir(backend);
    } else {
        let directory = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .parent()
            .ok_or("Cannot locate the application directory.")?
            .to_path_buf();
        command = Command::new(directory.join("frame-vault-engine.exe"));
        command.current_dir(directory);
    }
    let data = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    command
        .env("FRAME_VAULT_DATA_DIR", data)
        .env("PYTHONUTF8", "1");
    command
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW preserves stdio pipes.
    Ok(command)
}

impl Worker {
    fn spawn(app: &tauri::AppHandle) -> Result<Self, String> {
        Self::from_command(worker_command(app)?)
    }

    fn from_command(mut command: Command) -> Result<Self, String> {
        let mut child = command
            .spawn()
            .map_err(|e| format!("Unable to start the analytics engine: {e}"))?;
        #[cfg(windows)]
        let job = job::Job::attach(&child)
            .map_err(|e| format!("Unable to manage the engine process: {e}"))?;
        let input = child
            .stdin
            .take()
            .ok_or("Engine input pipe is unavailable.")?;
        let output = BufReader::new(
            child
                .stdout
                .take()
                .ok_or("Engine output pipe is unavailable.")?,
        );
        let stderr = child
            .stderr
            .take()
            .ok_or("Engine diagnostics pipe is unavailable.")?;
        let stderr_task = tokio::spawn(async move {
            let mut reader = BufReader::new(stderr);
            loop {
                let mut line = String::new();
                match (&mut reader)
                    .take(MAX_RESPONSE_BYTES)
                    .read_line(&mut line)
                    .await
                {
                    Ok(0) | Err(_) => break,
                    Ok(_) => log::warn!("Python: {}", line.trim_end()),
                }
            }
        });
        log::info!("Started analytics engine (PID {:?})", child.id());
        Ok(Self {
            child,
            input,
            output,
            sequence: 0,
            stderr_task,
            #[cfg(windows)]
            _job: job,
        })
    }

    async fn request(&mut self, command: &str) -> Result<Value, String> {
        self.request_with_timeout(command, REQUEST_TIMEOUT).await
    }

    async fn request_with_timeout(
        &mut self,
        command: &str,
        duration: Duration,
    ) -> Result<Value, String> {
        self.sequence += 1;
        let id = self.sequence.to_string();
        let request =
            serde_json::json!({"protocolVersion": PROTOCOL_VERSION, "id": id, "command": command});
        timeout(duration, async {
            self.input
                .write_all(format!("{request}\n").as_bytes())
                .await
                .map_err(|_| "The engine input pipe closed unexpectedly.".to_string())?;
            self.input.flush().await.map_err(|e| e.to_string())?;
            let mut line = String::new();
            let count = (&mut self.output)
                .take(MAX_RESPONSE_BYTES)
                .read_line(&mut line)
                .await
                .map_err(|_| "Unable to read the engine response.".to_string())?;
            if count == 0 {
                return Err(
                    "The analytics engine exited unexpectedly. Retry the connection.".into(),
                );
            }
            if !line.ends_with('\n') {
                return Err("The engine returned an oversized or incomplete response.".into());
            }
            validate_response(&line, &id)
        })
        .await
        .map_err(|_| {
            "The analytics engine did not respond within 30 seconds. Retry the connection."
                .to_string()
        })?
    }

    async fn terminate(&mut self) {
        let _ = self.child.kill().await;
        let _ = self.child.wait().await;
        self.stderr_task.abort();
    }
}

fn validate_response(line: &str, id: &str) -> Result<Value, String> {
    let response: Response = serde_json::from_str(line)
        .map_err(|_| "The engine returned a malformed response.".to_string())?;
    if response.protocol_version != PROTOCOL_VERSION {
        return Err("The engine uses an incompatible protocol version.".into());
    }
    if response.id.as_deref() != Some(id) {
        return Err("The engine response did not match its request.".into());
    }
    match (response.result, response.error) {
        (Some(result), None) => Ok(result),
        (None, Some(error)) => Err(format!("{}: {}", error.code, error.message)),
        _ => Err("The engine returned an invalid result envelope.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(code: &str) -> Worker {
        let python =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../backend/.venv/Scripts/python.exe");
        let mut command = Command::new(python);
        command
            .args(["-u", "-c", code])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        Worker::from_command(command).unwrap()
    }

    #[tokio::test]
    async fn worker_timeout_and_unexpected_exit_are_recoverable() {
        let mut worker = fixture("import time; time.sleep(60)");
        let result = worker
            .request_with_timeout("health", Duration::from_millis(100))
            .await;
        assert!(result.unwrap_err().contains("did not respond"));
        worker.terminate().await;
        assert!(worker.child.try_wait().unwrap().is_some());

        let mut worker = fixture("import sys; sys.stdin.readline()");
        assert!(worker
            .request("health")
            .await
            .unwrap_err()
            .contains("exited unexpectedly"));
        worker.terminate().await;
    }

    #[tokio::test]
    async fn real_worker_supports_multiple_requests_and_shutdown() {
        let mut worker = fixture(
            "import sys; from frame_vault_engine.worker import serve; serve(sys.stdin, sys.stdout)",
        );
        for _ in 0..2 {
            let result = worker.request("health").await.unwrap();
            assert_eq!(result["protocolVersion"], 1);
        }
        assert_eq!(worker.request("shutdown").await.unwrap()["stopped"], true);
        assert!(timeout(Duration::from_secs(5), worker.child.wait())
            .await
            .unwrap()
            .unwrap()
            .success());
        worker.terminate().await;
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn closing_job_kills_the_worker() {
        let mut worker = fixture("import time; time.sleep(60)");
        drop(worker._job);
        assert!(timeout(Duration::from_secs(5), worker.child.wait())
            .await
            .is_ok());
        worker.stderr_task.abort();
    }

    #[test]
    fn validates_response_envelopes() {
        assert!(validate_response(r#"{"protocolVersion":1,"id":"1","result":{}}"#, "1").is_ok());
        for line in [
            "{",
            r#"{"protocolVersion":2,"id":"1","result":{}}"#,
            r#"{"protocolVersion":1,"id":"2","result":{}}"#,
            r#"{"protocolVersion":1,"id":"1"}"#,
            r#"{"protocolVersion":1,"id":"1","result":{},"error":{"code":"X","message":"failed"}}"#,
        ] {
            assert!(validate_response(line, "1").is_err());
        }
    }
}
