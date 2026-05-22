//! MaaFramework wrapper - equivalent to Python MaaFW class
//!
//! This module wraps the maa-framework-rs API to provide the same interface
//! as the original Python implementation.

use crate::config::DeviceInfo;
use crate::events::DebugEventBroker;
use crate::response::{BoxScore, RecognitionDetail};
use maa_framework::controller::Controller;
use maa_framework::resource::Resource;
use maa_framework::tasker::Tasker;
use maa_framework::toolkit::Toolkit;
use maa_framework::{set_debug_mode, sys};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Async wait for controller operation with timeout using spawn_blocking
pub async fn wait_with_timeout_async(controller: &Controller, id: sys::MaaId, timeout_ms: u64) -> bool {
    let ctrl_clone = controller.clone();
    tokio::task::spawn_blocking(move || {
        wait_with_timeout(&ctrl_clone, id, timeout_ms)
    }).await.unwrap_or(false)
}

/// Async wait for connection with longer timeout
#[allow(dead_code)]
pub async fn wait_for_connection_async(controller: &Controller, id: sys::MaaId) -> bool {
    wait_with_timeout_async(controller, id, CONNECTION_TIMEOUT_MS).await
}

/// Async wait with default timeout
pub async fn wait_with_default_timeout_async(controller: &Controller, id: sys::MaaId) -> bool {
    wait_with_timeout_async(controller, id, CONTROLLER_TIMEOUT_MS).await
}

/// Timeout for controller operations (screencap, connection, etc.)
const CONTROLLER_TIMEOUT_MS: u64 = 30000;
/// Timeout for connection operations (longer for emulators)
const CONNECTION_TIMEOUT_MS: u64 = 60000;
/// Poll interval for checking operation status
const STATUS_POLL_INTERVAL_MS: u64 = 50;

/// Wait for controller operation with timeout
/// Returns true if operation succeeded, false if failed or timed out
fn wait_with_timeout(controller: &Controller, id: sys::MaaId, timeout_ms: u64) -> bool {
    let start = Instant::now();
    let timeout = Duration::from_millis(timeout_ms);
    let poll_interval = Duration::from_millis(STATUS_POLL_INTERVAL_MS);

    loop {
        let status = controller.status(id);

        if status.succeeded() {
            return true;
        }
        if status.failed() {
            eprintln!("Controller operation failed");
            return false;
        }

        if start.elapsed() > timeout {
            eprintln!(
                "Controller operation timeout after {}ms",
                timeout_ms
            );
            return false;
        }

        std::thread::sleep(poll_interval);
    }
}

/// Wait for controller operation with default timeout
#[allow(dead_code)]
fn wait_with_default_timeout(controller: &Controller, id: sys::MaaId) -> bool {
    wait_with_timeout(controller, id, CONTROLLER_TIMEOUT_MS)
}

/// Wait for connection operation with longer timeout
fn wait_for_connection(controller: &Controller, id: sys::MaaId) -> bool {
    wait_with_timeout(controller, id, CONNECTION_TIMEOUT_MS)
}

/// MaaFramework wrapper - equivalent to Python MaaFW class
pub struct MaaFrameworkWrapper {
    resource: Option<Resource>,
    controller: Option<Controller>,
    tasker: Option<Tasker>,
    event_broker: Option<Arc<DebugEventBroker>>,
}

impl MaaFrameworkWrapper {
    pub fn new() -> Self {
        let target_dir = std::env::current_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."))
            .join("target");
        let _ = Toolkit::init_option(&target_dir.to_string_lossy(), "{}");

        let _ = set_debug_mode(true);

        Self {
            resource: None,
            controller: None,
            tasker: None,
            event_broker: None,
        }
    }

    /// Find ADB devices using Toolkit
    pub fn find_adb_devices() -> Vec<DeviceInfo> {
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
                eprintln!("Failed to find ADB devices: {}", e);
                Vec::new()
            }
        }
    }

    /// Find desktop windows (Win32) using Toolkit
    pub fn find_desktop_windows() -> Vec<DeviceInfo> {
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
                eprintln!("Failed to find desktop windows: {}", e);
                Vec::new()
            }
        }
    }

    /// Connect to ADB device (async version)
    pub async fn connect_adb_async(
        &mut self,
        adb_path: &str,
        address: &str,
        config: serde_json::Value,
    ) -> (bool, Option<String>) {
        let config_str = serde_json::to_string(&config).unwrap_or_else(|_| "{}".to_string());
        let adb_path_str = adb_path.to_string();
        let address_str = address.to_string();

        let result = tokio::task::spawn_blocking(move || {
            match Controller::new_adb(&adb_path_str, &address_str, &config_str, "") {
                Ok(ctrl) => match ctrl.post_connection() {
                    Ok(id) => {
                        let success = wait_for_connection(&ctrl, id);
                        if success {
                            Some(ctrl)
                        } else {
                            None
                        }
                    }
                    Err(_) => None,
                },
                Err(_) => None,
            }
        }).await.unwrap_or(None);

        match result {
            Some(ctrl) => {
                self.controller = Some(ctrl);
                (true, None)
            }
            None => (false, Some(format!("Connection timeout or failed for {}", address)))
        }
    }

    /// Connect to Win32 window (async version)
    pub async fn connect_win32_async(
        &mut self,
        hwnd: i64,
        screencap_method: Option<i32>,
        mouse_method: Option<i32>,
        keyboard_method: Option<i32>,
    ) -> (bool, Option<String>) {
        let screencap = screencap_method.unwrap_or(sys::MaaWin32ScreencapMethod_GDI as i32) as sys::MaaWin32ScreencapMethod;
        let mouse = mouse_method.unwrap_or(sys::MaaWin32InputMethod_SendMessage as i32) as sys::MaaWin32InputMethod;
        let keyboard = keyboard_method.unwrap_or(sys::MaaWin32InputMethod_SendMessage as i32) as sys::MaaWin32InputMethod;

        let result = tokio::task::spawn_blocking(move || {
            match Controller::new_win32(hwnd as *mut std::ffi::c_void, screencap, mouse, keyboard) {
                Ok(ctrl) => {
                    match ctrl.post_connection() {
                        Ok(id) => {
                            let success = wait_for_connection(&ctrl, id);
                            if success {
                                Some(ctrl)
                            } else {
                                None
                            }
                        }
                        Err(_) => None,
                    }
                }
                Err(_) => None,
            }
        }).await.unwrap_or(None);

        match result {
            Some(ctrl) => {
                self.controller = Some(ctrl);
                (true, None)
            }
            None => (false, Some(format!("Connection timeout or failed for hwnd {}", hwnd)))
        }
    }

    /// Run task with pipeline override
    pub fn run_task(
        &mut self,
        entry: &str,
        pipeline_override: serde_json::Value,
    ) -> Option<String> {
        if self.tasker.is_none() {
            match Tasker::new() {
                Ok(t) => self.tasker = Some(t),
                Err(e) => return Some(format!("Failed to create tasker: {}", e)),
            }
        }

        let tasker = self.tasker.as_ref().unwrap();

        if self.resource.is_none() {
            return Some("Resource not initialized".to_string());
        }
        if self.controller.is_none() {
            return Some("Controller not initialized".to_string());
        }

        let resource = self.resource.as_ref().unwrap();
        let controller = self.controller.as_ref().unwrap();

        if let Err(e) = tasker.bind(resource, controller) {
            return Some(format!("Failed to bind resource and controller: {}", e));
        }

        if !tasker.inited() {
            return Some("Failed to init MaaFramework tasker".to_string());
        }

        if let Some(ref broker) = self.event_broker {
            let broker_clone = Arc::clone(broker);

            let _ = tasker.add_context_sink(move |msg, details| {
                let noti_type = if msg.ends_with(".Starting") {
                    "starting"
                } else if msg.ends_with(".Succeeded") {
                    "succeeded"
                } else if msg.ends_with(".Failed") {
                    "failed"
                } else {
                    "unknown"
                };

                let detail: serde_json::Value =
                    serde_json::from_str(details).unwrap_or(serde_json::Value::Null);

                if msg.starts_with("Node.NextList") {
                    let task_id =
                        detail.get("task_id").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    let name = detail
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    let next_list: Vec<(String, bool, bool)> = detail
                        .get("list")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|item| {
                                    let name =
                                        item.get("name").and_then(|v| v.as_str())?.to_string();
                                    let jump_back = item
                                        .get("jump_back")
                                        .and_then(|v| v.as_bool())
                                        .unwrap_or(false);
                                    let anchor = item
                                        .get("anchor")
                                        .and_then(|v| v.as_bool())
                                        .unwrap_or(false);
                                    Some((name, jump_back, anchor))
                                })
                                .collect()
                        })
                        .unwrap_or_default();

                    let focus = detail.get("focus").cloned();
                    broker_clone.emit_node_next_list(task_id, name, next_list, focus);
                } else if msg.starts_with("Node.Recognition") {
                    let task_id =
                        detail.get("task_id").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    let reco_id =
                        detail.get("reco_id").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    let name = detail
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let focus = detail.get("focus").cloned();

                    broker_clone.emit_node_recognition(
                        task_id,
                        reco_id,
                        name,
                        noti_type.to_string(),
                        focus,
                    );
                }
            });
        }

        match tasker.post_task_json(entry, &pipeline_override) {
            Ok(_job) => None,
            Err(e) => Some(format!("Task execution error: {}", e)),
        }
    }

    /// Stop task
    pub fn stop_task(&mut self) {
        if let Some(tasker) = &self.tasker {
            let _ = tasker.post_stop();
        }
    }

    /// Check if tasker is running
    pub fn is_running(&self) -> bool {
        self.tasker.as_ref().map(|t| t.running()).unwrap_or(false)
    }

    /// Take screenshot and return as base64 with image size (async version)
    pub async fn screencap_async(&mut self) -> Option<(String, Vec<i32>)> {
        let controller = self.controller.as_ref()?;
        let ctrl_clone = controller.clone();

        let id = ctrl_clone.post_screencap().ok()?;
        
        let success = wait_with_default_timeout_async(&ctrl_clone, id).await;
        if !success {
            eprintln!("Screencap timeout or failed");
            return None;
        }

        match ctrl_clone.cached_image() {
            Ok(img_buffer) => {
                match img_buffer.to_vec() {
                    Some(raw_data) => {
                        self.encode_image_as_base64(&raw_data).map(|image| {
                            let size = self.detect_image_size(&raw_data).unwrap_or(vec![1280, 720]);
                            (image, size)
                        })
                    }
                    None => None,
                }
            }
            Err(e) => {
                eprintln!("Failed to get cached image: {}", e);
                None
            }
        }
    }

    /// Encode raw image data as base64 PNG
    fn encode_image_as_base64(&self, raw_data: &[u8]) -> Option<String> {
        if raw_data.is_empty() {
            return None;
        }

        let is_png = raw_data.len() > 4 && raw_data[0..4] == [0x89, 0x50, 0x4E, 0x47];
        let is_jpeg = raw_data.len() > 3 && raw_data[0..3] == [0xFF, 0xD8, 0xFF];

        let mime = if is_png {
            "image/png"
        } else if is_jpeg {
            "image/jpeg"
        } else {
            "image/png"
        };

        let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, raw_data);
        Some(format!("data:{};base64,{}", mime, encoded))
    }

    fn detect_image_size(&self, raw_data: &[u8]) -> Option<Vec<i32>> {
        let image = image::load_from_memory(raw_data).ok()?;
        Some(vec![image.width() as i32, image.height() as i32])
    }

    /// Get recognition detail by reco_id
    pub fn get_reco_detail(&self, reco_id: i32) -> Option<RecognitionDetail> {
        let tasker = self.tasker.as_ref()?;

        match tasker.get_recognition_detail(reco_id as sys::MaaId) {
            Ok(Some(detail)) => {
                Some(RecognitionDetail {
                    reco_id: Some(reco_id),
                    name: Some(detail.node_name.clone()),
                    algorithm: Some(format!("{:?}", detail.algorithm)),
                    hit: detail.hit,
                    bbox: Some(vec![
                        detail.box_rect.x,
                        detail.box_rect.y,
                        detail.box_rect.width,
                        detail.box_rect.height,
                    ]),
                    all_results: Some(
                        detail
                            .sub_details
                            .iter()
                            .map(|sub| BoxScore {
                                bbox: Some(vec![
                                    sub.box_rect.x,
                                    sub.box_rect.y,
                                    sub.box_rect.width,
                                    sub.box_rect.height,
                                ]),
                                score: None,
                            })
                            .collect(),
                    ),
                    filtered_results: None,
                    best_result: if detail.hit {
                        Some(BoxScore {
                            bbox: Some(vec![
                                detail.box_rect.x,
                                detail.box_rect.y,
                                detail.box_rect.width,
                                detail.box_rect.height,
                            ]),
                            score: None,
                        })
                    } else {
                        None
                    },
                    raw_detail: Some(detail.detail.clone()),
                    raw_image: detail
                        .raw_image
                        .as_ref()
                        .and_then(|v| self.encode_raw_image(v)),
                    draw_images: Some(
                        detail
                            .draw_images
                            .iter()
                            .filter_map(|img| self.encode_raw_image(img))
                            .collect(),
                    ),
                })
            }
            _ => None,
        }
    }

    /// Encode raw image bytes as base64
    fn encode_raw_image(&self, raw_data: &[u8]) -> Option<String> {
        if raw_data.is_empty() {
            return None;
        }

        match image::load_from_memory(raw_data) {
            Ok(img) => {
                let rgb_img = img.to_rgb8();

                let mut png_data = Vec::new();
                match rgb_img.write_to(
                    &mut std::io::Cursor::new(&mut png_data),
                    image::ImageFormat::Png,
                ) {
                    Ok(_) => {
                        let encoded = base64::Engine::encode(
                            &base64::engine::general_purpose::STANDARD,
                            &png_data,
                        );
                        Some(format!("data:image/png;base64,{}", encoded))
                    }
                    Err(_) => None,
                }
            }
            Err(_) => {
                let encoded =
                    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, raw_data);
                Some(format!("data:image/png;base64,{}", encoded))
            }
        }
    }

    /// Set event broker for debug events
    #[allow(dead_code)]
    pub fn set_event_broker(&mut self, broker: Arc<DebugEventBroker>) {
        self.event_broker = Some(broker);
    }

    /// Load resource from paths (async version)
    pub async fn load_resource_async(&mut self, paths: &[String]) -> (bool, Option<String>) {
        if paths.is_empty() {
            return (false, Some("No resource paths provided".to_string()));
        }

        let resource = match self.resource.take() {
            Some(existing) => existing,
            None => match Resource::new() {
                Ok(res) => res,
                Err(e) => return (false, Some(format!("Failed to create resource: {}", e))),
            },
        };

        let paths_clone = paths.to_vec();
        let result = tokio::task::spawn_blocking(move || {
            let mut load_success = true;
            let mut errors = Vec::new();

            for path in &paths_clone {
                if path.is_empty() {
                    continue;
                }
                match resource.post_bundle(path) {
                    Ok(job) => {
                        job.wait();
                    }
                    Err(e) => {
                        errors.push(format!("Failed to load '{}': {}", path, e));
                        load_success = false;
                    }
                }
            }

            (resource, load_success, errors)
        }).await;

        let (resource, load_success, errors) = match result {
            Ok(r) => r,
            Err(e) => return (false, Some(format!("Resource loading task failed: {}", e))),
        };

        if resource.loaded() {
            self.resource = Some(resource);
            if load_success {
                (true, Some(format!("Loaded {} resource path(s)", paths.len())))
            } else {
                (true, Some(format!("Partially loaded: {}", errors.join("; "))))
            }
        } else {
            self.resource = None;
            let msg = if errors.is_empty() {
                "Failed to load any resources".to_string()
            } else {
                errors.join("; ")
            };
            (false, Some(msg))
        }
    }
}

impl Default for MaaFrameworkWrapper {
    fn default() -> Self {
        Self::new()
    }
}
