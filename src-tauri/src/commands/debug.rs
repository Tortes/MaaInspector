use crate::maafw::MaaFrameworkWrapper;
use crate::response::{ApiResponse, RecoDetailResponse};
use std::sync::Mutex;
use tauri::State;

/// Run debug node
#[tauri::command]
pub fn debug_run_node(
    maafw: State<'_, Mutex<MaaFrameworkWrapper>>,
    node: serde_json::Value,
    debug_mode: Option<String>,
) -> ApiResponse {
    let mut fw = maafw.lock().unwrap();

    // Extract node id
    let node_id = node
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if node_id.is_empty() {
        return ApiResponse::error_with_status("Missing node id", 400);
    }

    // Convert node to pipeline override format
    let mut pipeline_override = serde_json::Map::new();
    let mut node_data = node.clone();

    if let Some(obj) = node_data.as_object_mut() {
        // Remove id field
        obj.remove("id");

        // If recognition_only mode, modify the node
        if debug_mode.as_deref() == Some("recognition_only") {
            obj.insert("next".to_string(), serde_json::Value::Array(vec![]));
            obj.insert("on_error".to_string(), serde_json::Value::Array(vec![]));
            obj.insert("action".to_string(), serde_json::Value::String("DoNothing".to_string()));
        }
    }

    pipeline_override.insert(node_id.to_string(), node_data);

    // Run task
    let override_json = serde_json::Value::Object(pipeline_override);
    let error = fw.run_task(node_id, override_json);

    if let Some(e) = error {
        ApiResponse::error_with_status(e, 500)
    } else {
        ApiResponse::ok("debug_return")
    }
}

/// Stop debug task
#[tauri::command]
pub fn debug_stop(maafw: State<'_, Mutex<MaaFrameworkWrapper>>) -> ApiResponse {
    let mut fw = maafw.lock().unwrap();
    fw.stop_task();
    ApiResponse::ok("debug_return")
}

/// Get debug status
#[tauri::command]
pub fn debug_status(maafw: State<'_, Mutex<MaaFrameworkWrapper>>) -> ApiResponse {
    let fw = maafw.lock().unwrap();
    let running = fw.is_running();
    ApiResponse::ok_with_data(
        "debug_return_running",
        serde_json::json!({ "running": running }),
    )
}

/// OCR text recognition
#[tauri::command]
pub fn debug_ocr_text(
    maafw: State<'_, Mutex<MaaFrameworkWrapper>>,
    roi: Vec<i32>,
) -> ApiResponse {
    if roi.len() != 4 {
        return ApiResponse::error_with_status("Missing or invalid roi", 400);
    }

    // Note: OCR is typically done through MaaFramework's OCR capability
    // This is a placeholder implementation
    // In production, you would use MaaFramework's OCR API

    let mut fw = maafw.lock().unwrap();

    // Take screenshot first
    let _ = fw.screencap();

    // OCR processing would go here
    // For now, return empty text

    ApiResponse::ok_with_data(
        "OK",
        serde_json::json!({ "text": "" }),
    )
}

/// Get recognition details
#[tauri::command]
pub fn debug_get_reco_details(
    maafw: State<'_, Mutex<MaaFrameworkWrapper>>,
    reco_id: i32,
) -> RecoDetailResponse {
    let fw = maafw.lock().unwrap();

    match fw.get_reco_detail(reco_id) {
        Some(detail) => RecoDetailResponse {
            success: true,
            message: "detail".to_string(),
            detail: Some(detail),
        },
        None => RecoDetailResponse {
            success: false,
            message: "No detail".to_string(),
            detail: None,
        },
    }
}