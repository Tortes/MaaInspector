use crate::events::DebugEventBroker;
use maa_framework::controller::Controller;
use maa_framework::resource::Resource;
use maa_framework::tasker::Tasker;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Debug, Clone, PartialEq)]
struct ContextNextList {
    task_id: i32,
    name: String,
    next_list: Vec<(String, bool, bool)>,
    status: String,
    focus: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq)]
struct ContextRecognition {
    task_id: i32,
    reco_id: i32,
    name: String,
    status: String,
    focus: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq)]
struct ContextAction {
    task_id: i32,
    action_id: i32,
    node_id: i32,
    name: String,
    status: String,
    focus: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq)]
enum ContextSignal {
    NextList(ContextNextList),
    Recognition(ContextRecognition),
    Action(ContextAction),
    Unmatched,
}

fn notification_status(msg: &str) -> &'static str {
    if msg.ends_with(".Starting") {
        "starting"
    } else if msg.ends_with(".Succeeded") {
        "succeeded"
    } else if msg.ends_with(".Failed") {
        "failed"
    } else {
        "unknown"
    }
}

fn parse_context_details(details: &str) -> serde_json::Value {
    match serde_json::from_str::<serde_json::Value>(details) {
        Ok(value) => {
            let pretty = serde_json::to_string_pretty::<serde_json::Value>(&value)
                .unwrap_or_else(|_| value.to_string());
            crate::backend_log_debug!(
                "stderr",
                "[ContextSink] Details parsed as JSON:\n{}",
                pretty
            );
            value
        }
        Err(e) => {
            crate::backend_log_debug!(
                "stderr",
                "[ContextSink] Failed to parse details as JSON: {}. Using null detail",
                e
            );
            serde_json::Value::Null
        }
    }
}

fn extract_next_list(detail: &serde_json::Value) -> Vec<(String, bool, bool)> {
    detail
        .get("list")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let name = item.get("name").and_then(|v| v.as_str())?.to_string();
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
        .unwrap_or_default()
}

fn parse_context_signal(msg: &str, details: &str) -> ContextSignal {
    let status = notification_status(msg).to_string();
    crate::backend_log_debug!(
        "stderr",
        "[ContextSink] Notification type resolved from msg suffix: {}",
        status
    );

    let detail = parse_context_details(details);

    if msg.starts_with("Node.NextList") {
        return ContextSignal::NextList(ContextNextList {
            task_id: detail.get("task_id").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            name: detail
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            next_list: extract_next_list(&detail),
            status,
            focus: detail.get("focus").cloned(),
        });
    }

    if msg.starts_with("Node.Recognition") {
        return ContextSignal::Recognition(ContextRecognition {
            task_id: detail.get("task_id").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            reco_id: detail.get("reco_id").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            name: detail
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            status,
            focus: detail.get("focus").cloned(),
        });
    }

    if msg.starts_with("Node.Action") {
        return ContextSignal::Action(ContextAction {
            task_id: detail.get("task_id").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            action_id: detail
                .get("action_id")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32,
            node_id: detail.get("node_id").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            name: detail
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            status,
            focus: detail.get("focus").cloned(),
        });
    }

    ContextSignal::Unmatched
}

fn create_attempt_id(task_id: i32, seq: &AtomicU64) -> String {
    let next = seq.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}", task_id, next)
}

/// Run task with pipeline override
pub fn run_task(
    tasker: &mut Option<Tasker>,
    resource: &Option<Resource>,
    controller: &Option<Controller>,
    event_broker: &Option<Arc<DebugEventBroker>>,
    entry: &str,
    pipeline_override: serde_json::Value,
) -> Option<String> {
    if tasker.is_none() {
        match Tasker::new() {
            Ok(t) => *tasker = Some(t),
            Err(e) => return Some(format!("Failed to create tasker: {}", e)),
        }
    }

    let tasker_ref = tasker.as_ref().unwrap();

    if resource.is_none() {
        return Some("Resource not initialized".to_string());
    }
    if controller.is_none() {
        return Some("Controller not initialized".to_string());
    }

    let resource_ref = resource.as_ref().unwrap();
    let controller_ref = controller.as_ref().unwrap();

    if let Err(e) = tasker_ref.bind(resource_ref, controller_ref) {
        return Some(format!("Failed to bind resource and controller: {}", e));
    }

    if !tasker_ref.inited() {
        return Some("Failed to init MaaFramework tasker".to_string());
    }

    if let Some(broker) = event_broker {
        let broker_clone = Arc::clone(broker);
        let active_attempts: Arc<Mutex<HashMap<i32, String>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let active_attempts_clone = Arc::clone(&active_attempts);
        let attempt_seq = Arc::new(AtomicU64::new(1));
        let attempt_seq_clone = Arc::clone(&attempt_seq);

        crate::backend_log_debug!(
            "stderr",
            "[ContextSink] Clearing existing context sinks before registering debug sink"
        );
        tasker_ref.clear_context_sinks();

        crate::backend_log_debug!(
            "stderr",
            "[ContextSink] Registering MaaFramework context sink for debug events"
        );
        if let Err(e) = tasker_ref.add_context_sink(move |msg, details| {
            crate::backend_log_debug!("stderr", "[ContextSink] ===== MaaFramework context signal received =====");
            crate::backend_log_debug!("stderr", "[ContextSink] Raw msg: {}", msg);
            crate::backend_log_debug!("stderr", "[ContextSink] Raw details: {}", details);

            match parse_context_signal(msg, details) {
                ContextSignal::NextList(signal) => {
                crate::backend_log_debug!("stderr", "[ContextSink] Trigger type matched: Node.NextList");
                let attempt_id = if signal.status == "starting" {
                    let id = create_attempt_id(signal.task_id, &attempt_seq_clone);
                    if let Ok(mut attempts) = active_attempts_clone.lock() {
                        attempts.insert(signal.task_id, id.clone());
                    }
                    id
                } else {
                    let existing = active_attempts_clone
                        .lock()
                        .ok()
                        .and_then(|attempts| attempts.get(&signal.task_id).cloned());
                    existing.unwrap_or_else(|| create_attempt_id(signal.task_id, &attempt_seq_clone))
                };

                crate::backend_log_debug!(
                    "stderr",
                    "[ContextSink] Node.NextList extracted fields: attempt_id={}, task_id={}, name=\"{}\", status={}, next_list_len={}, has_focus={}",
                    attempt_id,
                    signal.task_id,
                    signal.name,
                    signal.status,
                    signal.next_list.len(),
                    signal.focus.is_some()
                );
                for (idx, (next_name, jump_back, anchor)) in signal.next_list.iter().enumerate() {
                    crate::backend_log_debug!(
                        "stderr",
                        "[ContextSink] Node.NextList item[{}]: name=\"{}\", jump_back={}, anchor={}",
                        idx,
                        next_name,
                        jump_back,
                        anchor
                    );
                }
                if let Some(focus_value) = &signal.focus {
                    let focus_pretty =
                        serde_json::to_string_pretty::<serde_json::Value>(focus_value)
                        .unwrap_or_else(|_| focus_value.to_string());
                    crate::backend_log_debug!("stderr", "[ContextSink] Node.NextList focus:\n{}", focus_pretty);
                }
                crate::backend_log_debug!(
                    "stderr",
                    "[ContextSink] Dispatching Node.NextList to DebugEventBroker for frontend emit"
                );
                broker_clone.emit_node_next_list(
                    attempt_id.clone(),
                    signal.task_id,
                    signal.name,
                    signal.next_list,
                    signal.status.clone(),
                    signal.focus,
                );

                    // MaaFramework may emit Node.Action.* after Node.NextList.Succeeded.
                    // Keep the attempt active until the next Node.NextList.Starting replaces it.
            }
            ContextSignal::Recognition(signal) => {
                crate::backend_log_debug!("stderr", "[ContextSink] Trigger type matched: Node.Recognition");
                let attempt_id = active_attempts_clone
                    .lock()
                    .ok()
                    .and_then(|attempts| attempts.get(&signal.task_id).cloned());

                crate::backend_log_debug!(
                    "stderr",
                    "[ContextSink] Node.Recognition extracted fields: attempt_id={:?}, task_id={}, reco_id={}, name=\"{}\", status={}, has_focus={}",
                    attempt_id,
                    signal.task_id,
                    signal.reco_id,
                    signal.name,
                    signal.status,
                    signal.focus.is_some()
                );
                if let Some(focus_value) = &signal.focus {
                    let focus_pretty =
                        serde_json::to_string_pretty::<serde_json::Value>(focus_value)
                        .unwrap_or_else(|_| focus_value.to_string());
                    crate::backend_log_debug!("stderr", "[ContextSink] Node.Recognition focus:\n{}", focus_pretty);
                }
                crate::backend_log_debug!(
                    "stderr",
                    "[ContextSink] Dispatching Node.Recognition to DebugEventBroker for frontend emit"
                );
                broker_clone.emit_node_recognition(
                    attempt_id,
                    signal.task_id,
                    signal.reco_id,
                    signal.name,
                    signal.status,
                    signal.focus,
                );
            }
            ContextSignal::Action(signal) => {
                crate::backend_log_debug!("stderr", "[ContextSink] Trigger type matched: Node.Action");
                let attempt_id = active_attempts_clone
                    .lock()
                    .ok()
                    .and_then(|attempts| attempts.get(&signal.task_id).cloned());

                crate::backend_log_debug!(
                    "stderr",
                    "[ContextSink] Node.Action extracted fields: attempt_id={:?}, task_id={}, action_id={}, node_id={}, name=\"{}\", status={}, has_focus={}",
                    attempt_id,
                    signal.task_id,
                    signal.action_id,
                    signal.node_id,
                    signal.name,
                    signal.status,
                    signal.focus.is_some()
                );
                if let Some(focus_value) = &signal.focus {
                    let focus_pretty =
                        serde_json::to_string_pretty::<serde_json::Value>(focus_value)
                        .unwrap_or_else(|_| focus_value.to_string());
                    crate::backend_log_debug!("stderr", "[ContextSink] Node.Action focus:\n{}", focus_pretty);
                }
                crate::backend_log_debug!(
                    "stderr",
                    "[ContextSink] Dispatching Node.Action to DebugEventBroker for frontend emit"
                );
                broker_clone.emit_node_action(
                    attempt_id,
                    signal.task_id,
                    signal.action_id,
                    signal.node_id,
                    signal.name,
                    signal.status,
                    signal.focus,
                );
            }
            ContextSignal::Unmatched => {
                crate::backend_log_debug!(
                    "stderr",
                    "[ContextSink] Trigger type unmatched. No frontend event emitted for msg: {}",
                    msg
                );
            }
            }
            crate::backend_log_debug!("stderr", "[ContextSink] ===== MaaFramework context signal handling finished =====");
        }) {
            crate::backend_log_debug!("stderr", "[ContextSink] Failed to register MaaFramework context sink: {}", e);
        } else {
            crate::backend_log_debug!("stderr", "[ContextSink] MaaFramework context sink registered successfully");
        }
    } else {
        crate::backend_log_debug!(
            "stderr",
            "[ContextSink] DebugEventBroker is not initialized; context sink not registered"
        );
    }

    match tasker_ref.post_task_json(entry, &pipeline_override) {
        Ok(_job) => None,
        Err(e) => Some(format!("Task execution error: {}", e)),
    }
}

/// Stop task
pub fn stop_task(tasker: &Option<Tasker>) {
    if let Some(tasker) = tasker {
        let _ = tasker.post_stop();
    }
}

/// Check if tasker is running
pub fn is_running(tasker: &Option<Tasker>) -> bool {
    tasker.as_ref().map(|t| t.running()).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_next_list_starting() {
        let details = json!({
            "task_id": 200000001,
            "name": "Root",
            "list": [
                { "name": "A", "jump_back": false, "anchor": false },
                { "name": "B", "jump_back": true, "anchor": true }
            ],
            "focus": { "stage": "next" }
        })
        .to_string();

        let signal = parse_context_signal("Node.NextList.Starting", &details);

        assert_eq!(
            signal,
            ContextSignal::NextList(ContextNextList {
                task_id: 200000001,
                name: "Root".to_string(),
                next_list: vec![
                    ("A".to_string(), false, false),
                    ("B".to_string(), true, true),
                ],
                status: "starting".to_string(),
                focus: Some(json!({ "stage": "next" })),
            })
        );
    }

    #[test]
    fn parses_next_list_terminal_statuses() {
        let details = json!({
            "task_id": 200000001,
            "name": "Root",
            "list": []
        })
        .to_string();

        let succeeded = parse_context_signal("Node.NextList.Succeeded", &details);
        let failed = parse_context_signal("Node.NextList.Failed", &details);

        assert!(matches!(
            succeeded,
            ContextSignal::NextList(ContextNextList { status, .. }) if status == "succeeded"
        ));
        assert!(matches!(
            failed,
            ContextSignal::NextList(ContextNextList { status, .. }) if status == "failed"
        ));
    }

    #[test]
    fn parses_recognition_succeeded() {
        let details = json!({
            "task_id": 200000001,
            "reco_id": 400000001,
            "name": "A",
            "focus": { "hit": true }
        })
        .to_string();

        let signal = parse_context_signal("Node.Recognition.Succeeded", &details);

        assert_eq!(
            signal,
            ContextSignal::Recognition(ContextRecognition {
                task_id: 200000001,
                reco_id: 400000001,
                name: "A".to_string(),
                status: "succeeded".to_string(),
                focus: Some(json!({ "hit": true })),
            })
        );
    }

    #[test]
    fn parses_action_succeeded() {
        let details = json!({
            "task_id": 200000001,
            "action_id": 500000001,
            "node_id": 600000001,
            "name": "A",
            "focus": { "action": "Click" }
        })
        .to_string();

        let signal = parse_context_signal("Node.Action.Succeeded", &details);

        assert_eq!(
            signal,
            ContextSignal::Action(ContextAction {
                task_id: 200000001,
                action_id: 500000001,
                node_id: 600000001,
                name: "A".to_string(),
                status: "succeeded".to_string(),
                focus: Some(json!({ "action": "Click" })),
            })
        );
    }
}
