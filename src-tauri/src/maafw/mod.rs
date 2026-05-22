mod controller;
mod image;
mod resource;
mod tasker;

use crate::config::DeviceInfo;
use crate::events::DebugEventBroker;
use crate::response::RecognitionDetail;
use controller::wait_with_timeout;
use maa_framework::controller::Controller;
use maa_framework::resource::Resource;
use maa_framework::sys;
use maa_framework::tasker::Tasker;
use maa_framework::{set_debug_mode, toolkit::Toolkit};
use std::sync::Arc;

/// Timeout for controller operations (screencap, etc.)
const CONTROLLER_TIMEOUT_MS: u64 = 30000;

/// Async wait for controller operation with timeout using spawn_blocking
async fn wait_with_timeout_async(controller: &Controller, id: sys::MaaId, timeout_ms: u64) -> bool {
    let ctrl_clone = controller.clone();
    tokio::task::spawn_blocking(move || {
        wait_with_timeout(&ctrl_clone, id, timeout_ms)
    }).await.unwrap_or(false)
}

/// Async wait with default timeout
async fn wait_with_default_timeout_async(controller: &Controller, id: sys::MaaId) -> bool {
    wait_with_timeout_async(controller, id, CONTROLLER_TIMEOUT_MS).await
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
        controller::find_adb_devices()
    }

    /// Find desktop windows (Win32) using Toolkit
    pub fn find_desktop_windows() -> Vec<DeviceInfo> {
        controller::find_desktop_windows()
    }

    /// Connect to ADB device (async version)
    pub async fn connect_adb_async(
        &mut self,
        adb_path: &str,
        address: &str,
        config: serde_json::Value,
    ) -> (bool, Option<String>) {
        let (success, error, ctrl) = controller::connect_adb_async(adb_path, address, config).await;
        if success {
            self.controller = ctrl;
        }
        (success, error)
    }

    /// Connect to Win32 window (async version)
    pub async fn connect_win32_async(
        &mut self,
        hwnd: i64,
        screencap_method: Option<i32>,
        mouse_method: Option<i32>,
        keyboard_method: Option<i32>,
    ) -> (bool, Option<String>) {
        let (success, error, ctrl) = controller::connect_win32_async(
            hwnd,
            screencap_method,
            mouse_method,
            keyboard_method,
        ).await;
        if success {
            self.controller = ctrl;
        }
        (success, error)
    }

    /// Run task with pipeline override
    pub fn run_task(
        &mut self,
        entry: &str,
        pipeline_override: serde_json::Value,
    ) -> Option<String> {
        tasker::run_task(
            &mut self.tasker,
            &self.resource,
            &self.controller,
            &self.event_broker,
            entry,
            pipeline_override,
        )
    }

    /// Stop task
    pub fn stop_task(&mut self) {
        tasker::stop_task(&self.tasker);
    }

    /// Check if tasker is running
    pub fn is_running(&self) -> bool {
        tasker::is_running(&self.tasker)
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
                        image::encode_image_as_base64(&raw_data).map(|image| {
                            let size = image::detect_image_size(&raw_data).unwrap_or(vec![1280, 720]);
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

    /// Get recognition detail by reco_id
    pub fn get_reco_detail(&self, reco_id: i32) -> Option<RecognitionDetail> {
        use crate::response::BoxScore;

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
                        .and_then(|v| image::encode_raw_image(v)),
                    draw_images: Some(
                        detail
                            .draw_images
                            .iter()
                            .filter_map(|img| image::encode_raw_image(img))
                            .collect(),
                    ),
                })
            }
            _ => None,
        }
    }

    /// Set event broker for debug events
    #[allow(dead_code)]
    pub fn set_event_broker(&mut self, broker: Arc<DebugEventBroker>) {
        self.event_broker = Some(broker);
    }

    /// Load resource from paths (async version)
    pub async fn load_resource_async(&mut self, paths: &[String]) -> (bool, Option<String>) {
        let (success, message, new_resource) = resource::load_resource_async(
            self.resource.take(),
            paths,
        ).await;

        self.resource = new_resource;
        (success, message)
    }

    /// OCR text recognition with roi (async)
    pub async fn ocr_text_async(&mut self, roi: [i32; 4]) -> Result<String, String> {
        let controller = self.controller.as_ref()
            .ok_or("Controller not initialized. Please connect a device first.")?;
        
        let ctrl_clone = controller.clone();
        let id = ctrl_clone.post_screencap()
            .map_err(|e| format!("Failed to post screencap: {}", e))?;
        
        let success = wait_with_default_timeout_async(&ctrl_clone, id).await;
        if !success {
            return Err("Screencap timeout or failed".to_string());
        }
        
        let img_buffer = ctrl_clone.cached_image()
            .map_err(|e| format!("Failed to get cached image: {}", e))?;
        
        let tasker = match self.tasker.as_ref() {
            Some(t) => t.clone(),
            None => {
                let new_tasker = Tasker::new()
                    .map_err(|e| format!("Failed to create tasker for OCR: {}", e))?;
                new_tasker.bind(self.resource.as_ref().ok_or("Resource not initialized")?, controller)
                    .map_err(|e| format!("Failed to bind tasker: {}", e))?;
                if !new_tasker.inited() {
                    return Err("Tasker initialization failed".to_string());
                }
                self.tasker = Some(new_tasker.clone());
                new_tasker
            }
        };
        
        let ocr_params = serde_json::json!({
            "roi": roi
        });
        
        let job = tasker.post_recognition(
            "OCR",
            &ocr_params.to_string(),
            &img_buffer
        ).map_err(|e| format!("OCR recognition failed: {}", e))?;
        
        job.wait();
        
        if let Ok(Some(detail)) = job.get(true) {
            if let Some(ocr_result) = detail.as_ocr_result() {
                return Ok(ocr_result.text.clone());
            }
        }
        
        Ok(String::new())
    }
}

impl Default for MaaFrameworkWrapper {
    fn default() -> Self {
        Self::new()
    }
}
