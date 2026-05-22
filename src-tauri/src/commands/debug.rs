use crate::maafw::MaaFrameworkWrapper;
use crate::response::{ApiResponse, RecoDetailResponse};
use tokio::sync::Mutex;
use tauri::State;

/// Run debug node
#[tauri::command]
pub async fn debug_run_node(
    maafw: State<'_, Mutex<MaaFrameworkWrapper>>,
    node: serde_json::Value,
    debug_mode: Option<String>,
) -> Result<ApiResponse, String> {
    let mut fw = maafw.lock().await;

    // Extract node id
    let node_id = node.get("id").and_then(|v| v.as_str()).unwrap_or("");

    if node_id.is_empty() {
        return Ok(ApiResponse::error_with_status("Missing node id", 400));
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
            obj.insert(
                "action".to_string(),
                serde_json::Value::String("DoNothing".to_string()),
            );
        }
    }

    pipeline_override.insert(node_id.to_string(), node_data);

    // Run task
    let override_json = serde_json::Value::Object(pipeline_override);
    let error = fw.run_task(node_id, override_json);

    if let Some(e) = error {
        Ok(ApiResponse::error_with_status(e, 500))
    } else {
        Ok(ApiResponse::ok("debug_return"))
    }
}

/// Stop debug task
#[tauri::command]
pub async fn debug_stop(maafw: State<'_, Mutex<MaaFrameworkWrapper>>) -> Result<ApiResponse, String> {
    let mut fw = maafw.lock().await;
    fw.stop_task();
    Ok(ApiResponse::ok("debug_return"))
}

/// Get debug status
#[tauri::command]
pub async fn debug_status(maafw: State<'_, Mutex<MaaFrameworkWrapper>>) -> Result<ApiResponse, String> {
    let fw = maafw.lock().await;
    let running = fw.is_running();
    Ok(ApiResponse::ok_with_data(
        "debug_return_running",
        serde_json::json!({ "running": running }),
    ))
}

/// OCR text recognition
#[tauri::command]
pub async fn debug_ocr_text(maafw: State<'_, Mutex<MaaFrameworkWrapper>>, roi: Vec<i32>) -> Result<ApiResponse, String> {
    if roi.len() != 4 {
        return Ok(ApiResponse::error_with_status("Missing or invalid roi", 400));
    }

    // Note: OCR is typically done through MaaFramework's OCR capability
    // This is a placeholder implementation
    // In production, you would use MaaFramework's OCR API

    let mut fw = maafw.lock().await;

    // Take screenshot first
    let _ = fw.screencap_async().await;

    // OCR processing would go here
    // For now, return empty text

    Ok(ApiResponse::ok_with_data("OK", serde_json::json!({ "text": "" })))
}

/// Get recognition details
#[tauri::command]
pub async fn debug_get_reco_details(
    maafw: State<'_, Mutex<MaaFrameworkWrapper>>,
    reco_id: i32,
) -> Result<RecoDetailResponse, String> {
    let fw = maafw.lock().await;

    match fw.get_reco_detail(reco_id) {
        Some(detail) => Ok(RecoDetailResponse {
            success: true,
            message: "detail".to_string(),
            detail: Some(detail),
        }),
        None => Ok(RecoDetailResponse {
            success: false,
            message: "No detail".to_string(),
            detail: None,
        }),
    }
}
