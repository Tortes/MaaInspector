use crate::maafw::MaaFrameworkWrapper;
use crate::response::{ApiResponse, ScreenshotResponse};
use std::sync::Mutex;
use tauri::State;

/// Connect to ADB device
#[tauri::command]
pub fn device_connect_adb(
    maafw: State<'_, Mutex<MaaFrameworkWrapper>>,
    adb_path: String,
    address: String,
    config: serde_json::Value,
    _name: Option<String>,
) -> ApiResponse {
    let mut fw = maafw.lock().unwrap();
    let (success, msg) = fw.connect_adb(&adb_path, &address, config);

    if success {
        ApiResponse::ok_with_data(
            "ADB Device Connected",
            serde_json::json!({
                "info": {
                    "detail": msg.unwrap_or_default()
                }
            }),
        )
    } else {
        ApiResponse::error_with_status(msg.unwrap_or_else(|| "Connect failed".to_string()), 400)
    }
}

/// Connect to Win32 window
#[tauri::command]
pub fn device_connect_win32(
    maafw: State<'_, Mutex<MaaFrameworkWrapper>>,
    hwnd: i64,
    _name: Option<String>,
    _window_name: Option<String>,
    _class_name: Option<String>,
    screencap_method: Option<i32>,
    mouse_method: Option<i32>,
    keyboard_method: Option<i32>,
) -> ApiResponse {
    let mut fw = maafw.lock().unwrap();
    let (success, msg) = fw.connect_win32(hwnd, screencap_method, mouse_method, keyboard_method);

    if success {
        ApiResponse::ok_with_data(
            "Win32 Device Connected",
            serde_json::json!({
                "info": {
                    "detail": msg.unwrap_or_default()
                }
            }),
        )
    } else {
        ApiResponse::error_with_status(msg.unwrap_or_else(|| "Connect failed".to_string()), 400)
    }
}

/// Get screenshot
#[tauri::command]
pub fn device_screenshot(
    maafw: State<'_, Mutex<MaaFrameworkWrapper>>,
) -> ScreenshotResponse {
    let mut fw = maafw.lock().unwrap();

    if let Some(image_base64) = fw.screencap() {
        ScreenshotResponse {
            success: true,
            message: Some("OK".to_string()),
            image: Some(image_base64),
            size: Some(vec![1280, 720]), // Default size, should be detected
        }
    } else {
        ScreenshotResponse {
            success: false,
            message: Some("No image".to_string()),
            image: None,
            size: None,
        }
    }
}