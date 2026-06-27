use crate::config::DeviceInfo;
use maa_framework::controller::Controller;
use maa_framework::sys;

/// Timeout for connection operations (longer for emulators)
const CONNECTION_TIMEOUT_MS: u64 = 60000;
/// Poll interval for checking operation status
const STATUS_POLL_INTERVAL_MS: u64 = 50;
/// Wait for controller operation with timeout
pub(crate) fn wait_with_timeout(controller: &Controller, id: sys::MaaId, timeout_ms: u64) -> bool {
    use std::time::{Duration, Instant};

    let start = Instant::now();
    let timeout = Duration::from_millis(timeout_ms);
    let poll_interval = Duration::from_millis(STATUS_POLL_INTERVAL_MS);

    loop {
        let status = controller.status(id);

        if status.succeeded() {
            return true;
        }
        if status.failed() {
            crate::backend_log_debug!("stderr", "Controller operation failed");
            return false;
        }

        if start.elapsed() > timeout {
            crate::backend_log_debug!(
                "stderr",
                "Controller operation timeout after {}ms",
                timeout_ms
            );
            return false;
        }

        std::thread::sleep(poll_interval);
    }
}

/// Wait for connection operation with longer timeout
fn wait_for_connection(controller: &Controller, id: sys::MaaId) -> bool {
    wait_with_timeout(controller, id, CONNECTION_TIMEOUT_MS)
}

/// Find ADB devices using Toolkit
pub fn find_adb_devices() -> Vec<DeviceInfo> {
    use maa_framework::toolkit::Toolkit;

    match Toolkit::find_adb_devices() {
        Ok(devices) => devices
            .iter()
            .map(|d| DeviceInfo {
                name: Some(d.name.clone()),
                device_type: Some("adb".to_string()),
                address: Some(d.address.clone()),
                adb_path: d.adb_path.to_str().map(|s| s.to_string()),
                config: Some(d.config.clone()),
                ..Default::default()
            })
            .collect(),
        Err(e) => {
            crate::backend_log_debug!("stderr", "Failed to find ADB devices: {}", e);
            Vec::new()
        }
    }
}

/// Find desktop windows (Win32) using Toolkit
pub fn find_desktop_windows() -> Vec<DeviceInfo> {
    use maa_framework::toolkit::Toolkit;

    match Toolkit::find_desktop_windows() {
        Ok(windows) => windows
            .iter()
            .map(|w| DeviceInfo {
                name: Some(w.window_name.clone()),
                device_type: Some("win32control".to_string()),
                hwnd: Some(w.hwnd as i64),
                class_name: Some(w.class_name.clone()),
                window_name: Some(w.window_name.clone()),
                ..Default::default()
            })
            .collect(),
        Err(e) => {
            crate::backend_log_debug!("stderr", "Failed to find desktop windows: {}", e);
            Vec::new()
        }
    }
}

/// Connect to ADB device (async version)
pub async fn connect_adb_async(
    adb_path: &str,
    address: &str,
    config: serde_json::Value,
) -> (bool, Option<String>, Option<Controller>) {
    let config_str = serde_json::to_string(&config).unwrap_or_else(|_| "{}".to_string());
    let adb_path_str = adb_path.to_string();
    let address_str = address.to_string();

    let result = tokio::task::spawn_blocking(move || {
        match Controller::new_adb(&adb_path_str, &address_str, &config_str, "") {
            Ok(ctrl) => match ctrl.post_connection() {
                Ok(id) => {
                    let success = wait_for_connection(&ctrl, id);
                    if success { Some(ctrl) } else { None }
                }
                Err(_) => None,
            },
            Err(_) => None,
        }
    })
    .await
    .unwrap_or(None);

    match result {
        Some(ctrl) => (true, None, Some(ctrl)),
        None => (
            false,
            Some(format!("Connection timeout or failed for {}", address)),
            None,
        ),
    }
}

/// Connect to Win32 window (async version)
pub async fn connect_win32_async(
    hwnd: i64,
    screencap_method: Option<i32>,
    mouse_method: Option<i32>,
    keyboard_method: Option<i32>,
) -> (bool, Option<String>, Option<Controller>) {
    let screencap = screencap_method.unwrap_or(sys::MaaWin32ScreencapMethod_GDI as i32)
        as sys::MaaWin32ScreencapMethod;
    let mouse = mouse_method.unwrap_or(sys::MaaWin32InputMethod_SendMessage as i32)
        as sys::MaaWin32InputMethod;
    let keyboard = keyboard_method.unwrap_or(sys::MaaWin32InputMethod_SendMessage as i32)
        as sys::MaaWin32InputMethod;

    let result = tokio::task::spawn_blocking(move || {
        match Controller::new_win32(hwnd as *mut std::ffi::c_void, screencap, mouse, keyboard) {
            Ok(ctrl) => match ctrl.post_connection() {
                Ok(id) => {
                    let success = wait_for_connection(&ctrl, id);
                    if success { Some(ctrl) } else { None }
                }
                Err(_) => None,
            },
            Err(_) => None,
        }
    })
    .await
    .unwrap_or(None);

    match result {
        Some(ctrl) => (true, None, Some(ctrl)),
        None => (
            false,
            Some(format!("Connection timeout or failed for hwnd {}", hwnd)),
            None,
        ),
    }
}
