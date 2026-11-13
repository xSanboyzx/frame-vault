#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod engine;

use engine::{EngineHealth, EngineManager};
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

#[tauri::command]
async fn engine_health(
    app: tauri::AppHandle,
    state: tauri::State<'_, EngineManager>,
) -> Result<EngineHealth, String> {
    state.health(&app).await
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([Target::new(TargetKind::LogDir {
                    file_name: Some("frame-vault".into()),
                })])
                .max_file_size(2_000_000)
                .build(),
        )
        .manage(EngineManager::default())
        .invoke_handler(tauri::generate_handler![engine_health])
        .build(tauri::generate_context!())
        .expect("Unable to initialize Frame Vault");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            tauri::async_runtime::block_on(handle.state::<EngineManager>().shutdown());
        }
    });
}
