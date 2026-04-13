// MaaInspector - Rust backend using maa-framework-rs

mod commands;
mod config;
mod events;
mod maafw;
mod resources;
mod response;

use commands::{
    agent_connect, debug_get_reco_details, debug_ocr_text, debug_run_node, debug_status,
    debug_stop, device_connect_adb, device_connect_win32, device_screenshot,
    resource_check_unused_images, resource_create_file, resource_get_file_nodes,
    resource_get_templates, resource_load, resource_process_images, resource_save_file_nodes,
    resource_search_nodes, system_init, system_save_config, system_search_devices,
};
use maafw::MaaFrameworkWrapper;
use resources::ResourcesManager;
use std::sync::Mutex;

/// Tauri library entry point
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
