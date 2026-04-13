use crate::response::{DebugStreamPayload, NextListNode};
use tauri::{AppHandle, Emitter};

/// Event names for debug streaming
pub const EVENT_NODE_NEXT_LIST: &str = "debug:node_next_list";
pub const EVENT_NODE_RECOGNITION: &str = "debug:node_recognition";

/// Debug event broker - manages event emission to frontend
pub struct DebugEventBroker {
    app_handle: Option<AppHandle>,
}

impl DebugEventBroker {
    pub fn new() -> Self {
        Self { app_handle: None }
    }

    pub fn emit_node_next_list(
        &self,
        task_id: i32,
        name: String,
        next_list: Vec<(String, bool, bool)>,
        focus: Option<serde_json::Value>,
    ) {
        if let Some(ref handle) = self.app_handle {
            let next_list_nodes: Vec<NextListNode> = next_list
                .iter()
                .map(|(n, jb, a)| NextListNode {
                    name: n.clone(),
                    jump_back: *jb,
                    anchor: *a,
                })
                .collect();

            let payload = DebugStreamPayload {
                event_type: "node_next_list".to_string(),
                task_id: Some(task_id),
                name: Some(name),
                next_list: Some(next_list_nodes),
                focus,
                timestamp: Some(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis() as i64)
                        .unwrap_or(0),
                ),
                ..Default::default()
            };

            if let Err(e) = handle.emit(EVENT_NODE_NEXT_LIST, payload) {
                eprintln!("Failed to emit node_next_list event: {}", e);
            }
        }
    }

    pub fn emit_node_recognition(
        &self,
        task_id: i32,
        reco_id: i32,
        name: String,
        status: String,
        focus: Option<serde_json::Value>,
    ) {
        if let Some(ref handle) = self.app_handle {
            let payload = DebugStreamPayload {
                event_type: "node_recognition".to_string(),
                task_id: Some(task_id),
                reco_id: Some(reco_id),
                name: Some(name),
                status: Some(status),
                focus,
                timestamp: Some(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis() as i64)
                        .unwrap_or(0),
                ),
                ..Default::default()
            };

            if let Err(e) = handle.emit(EVENT_NODE_RECOGNITION, payload) {
                eprintln!("Failed to emit node_recognition event: {}", e);
            }
        }
    }
}

impl Default for DebugEventBroker {
    fn default() -> Self {
        Self::new()
    }
}
