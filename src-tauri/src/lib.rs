// MaaInspector - Rust backend using maa-framework-rs

mod commands;
mod config;
mod events;
mod maafw;
mod resources;
mod response;

use commands::{
    agent_connect, debug_get_reco_details, debug_ocr_text, debug_run_node, debug_status,
    debug_stop, device_connect_adb, device_connect_win32, device_screenshot, system_pick_folder,
    resource_check_unused_images, resource_create_file, resource_get_file_nodes,
    resource_get_templates, resource_load, resource_process_images, resource_save_file_nodes,
    resource_search_nodes, system_init, system_save_config, system_search_devices,
};
use maafw::MaaFrameworkWrapper;
use resources::ResourcesManager;
use std::sync::Mutex;

/// Load MaaFramework DLL from the correct location
/// In development: MAA_SDK_PATH or project root
/// In production: exe_dir/MAA-win-x86_64-v5.10.0/bin/MaaFramework.dll
fn load_maa_library() -> Result<(), String> {
    let exe_path = std::env::current_exe().map_err(|e| format!("Failed to get exe path: {}", e))?;
    let exe_dir = exe_path.parent().ok_or("Failed to get exe directory")?;

    // Candidate paths to search for the DLL
    let candidates: Vec<std::path::PathBuf> = vec![
        // Packaged location: exe_dir/MAA-win-x86_64-v5.10.0/bin/MaaFramework.dll
        exe_dir
            .join("MAA-win-x86_64-v5.10.0")
            .join("bin")
            .join("MaaFramework.dll"),
        // MAA_SDK_PATH environment variable
        std::env::var("MAA_SDK_PATH")
            .map(|p| {
                std::path::PathBuf::from(p)
                    .join("bin")
                    .join("MaaFramework.dll")
            })
            .unwrap_or_else(|_| exe_dir.join("MaaFramework.dll")),
        // Fallback: exe_dir directly (for dev builds)
        exe_dir.join("MaaFramework.dll"),
    ];

    // Find the first existing DLL
    let dll_path = candidates.iter().find(|p| p.exists()).cloned();

    match dll_path {
        Some(path) => {
            maa_framework::load_library(&path).map_err(|e| {
                format!(
                    "Failed to load MaaFramework.dll from {}: {}",
                    path.display(),
                    e
                )
            })?;
            println!("Loaded MaaFramework.dll from: {}", path.display());
            Ok(())
        }
        None => {
            let tried_paths = candidates
                .iter()
                .map(|p| format!("  - {}", p.display()))
                .collect::<Vec<_>>()
                .join("\n");
            Err(format!(
                "MaaFramework.dll not found. Tried:\n{}",
                tried_paths
            ))
        }
    }
}

/// Tauri library entry point
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load MaaFramework DLL before using any API
    if let Err(e) = load_maa_library() {
        eprintln!("ERROR: {}", e);
        panic!("Failed to load MaaFramework library: {}", e);
    }

    let maafw = Mutex::new(MaaFrameworkWrapper::new());
    let resources_manager: Mutex<Option<ResourcesManager>> = Mutex::new(None);
    let config_dir = "./".to_string();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(maafw)
        .manage(resources_manager)
        .manage(config_dir)
        .invoke_handler(tauri::generate_handler![
            // System commands
            system_init,
            system_pick_folder,
            system_save_config,
            system_search_devices,
            // Device commands
            device_connect_adb,
            device_connect_win32,
            device_screenshot,
            // Resource commands
            resource_load,
            resource_get_file_nodes,
            resource_save_file_nodes,
            resource_create_file,
            resource_search_nodes,
            resource_get_templates,
            resource_check_unused_images,
            resource_process_images,
            // Agent commands
            agent_connect,
            // Debug commands
            debug_run_node,
            debug_stop,
            debug_status,
            debug_ocr_text,
            debug_get_reco_details,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
