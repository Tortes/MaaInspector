use crate::events::DebugEventBroker;
use maa_framework::controller::Controller;
use maa_framework::resource::Resource;
use maa_framework::tasker::Tasker;
use std::sync::Arc;

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

        tasker_ref.clear_context_sinks();

        let _ = tasker_ref.add_context_sink(move |msg, details| {
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
