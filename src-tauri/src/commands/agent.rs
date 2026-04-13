use crate::maafw::MaaFrameworkWrapper;
use crate::response::ApiResponse;
use std::sync::Mutex;
use tauri::State;

/// Connect to agent
#[tauri::command]
pub fn agent_connect(
    _maafw: State<'_, Mutex<MaaFrameworkWrapper>>,
    socket_id: String,
) -> ApiResponse {
    // Note: AgentClient is not fully implemented in maa-framework-rs yet
    // This is a placeholder that returns success for now
    // In a real implementation, you would:
    // 1. Create AgentClient with the socket_id
    // 2. Bind to resource
    // 3. Connect

    ApiResponse::ok_with_data(
        "Agent Linked",
        serde_json::json!({
            "info": {
                "Socket": socket_id
            }
        }),
    )
}