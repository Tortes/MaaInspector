use crate::resources::ResourcesManager;
use crate::response::{ApiResponse, ResourceLoadResponse, FileNodesResponse};
use std::sync::Mutex;
use tauri::State;

/// Load resource paths
#[tauri::command]
pub fn resource_load(
    resources_manager: State<'_, Mutex<Option<ResourcesManager>>>,
    paths: Vec<String>,
) -> ResourceLoadResponse {
    // Create new manager with paths
    let manager = ResourcesManager::new(paths.clone());
    let results = manager.list_all_files();

    // Update state
    *resources_manager.lock().unwrap() = Some(manager);

    ResourceLoadResponse {
        r: true,
        success: true,
        message: "Loaded".to_string(),
        list: Some(results),
    }
}

/// Get nodes from a file
#[tauri::command]
pub fn resource_get_file_nodes(
    resources_manager: State<'_, Mutex<Option<ResourcesManager>>>,
    source: String,
    filename: String,
) -> FileNodesResponse {
    let guard = resources_manager.lock().unwrap();

    if let Some(manager) = guard.as_ref()
        && let Some(nodes) = manager.get_nodes_by_file(&source, &filename) {
            return FileNodesResponse {
                nodes: Some(serde_json::to_value(nodes).unwrap_or(serde_json::Value::Null)),
                list: None,
            };
        }

    FileNodesResponse {
        nodes: None,
        list: None,
    }
}

/// Save nodes to a file
#[tauri::command]
pub fn resource_save_file_nodes(
    resources_manager: State<'_, Mutex<Option<ResourcesManager>>>,
    source: String,
    filename: String,
    nodes: serde_json::Value,
) -> ApiResponse {
    let mut guard = resources_manager.lock().unwrap();

    if let Some(manager) = guard.as_mut() {
        let count = manager.save_nodes(&source, &filename, nodes);
        return ApiResponse::ok_with_data(
            format!("Saved {} nodes", count),
            serde_json::json!({ "saved_count": count }),
        );
    }

    ApiResponse::error_with_status("ResourcesManager not initialized", 500)
}

/// Create a new file
#[tauri::command]
pub fn resource_create_file(
    resources_manager: State<'_, Mutex<Option<ResourcesManager>>>,
    path: String,
    filename: String,
) -> ApiResponse {
    let mut guard = resources_manager.lock().unwrap();

    if let Some(manager) = guard.as_mut() {
        if manager.create_file(&path, &filename) {
            let final_filename = if filename.to_lowercase().ends_with(".json") {
                filename
            } else {
                format!("{}.json", filename)
            };
            return ApiResponse::ok_with_data(
                "Created",
                serde_json::json!({
                    "filename": final_filename,
                    "source": path
                }),
            );
        }
        return ApiResponse::error_with_status("File already exists", 409);
    }

    ApiResponse::error_with_status("ResourcesManager not initialized", 500)
}

/// Search nodes globally
#[tauri::command]
pub fn resource_search_nodes(
    resources_manager: State<'_, Mutex<Option<ResourcesManager>>>,
    query: String,
    use_regex: Option<bool>,
    current_filename: Option<String>,
    current_source: Option<String>,
) -> serde_json::Value {
    let guard = resources_manager.lock().unwrap();

    if let Some(manager) = guard.as_ref() {
        let results = manager.search_nodes(
            &query,
            use_regex.unwrap_or(false),
            &current_filename.unwrap_or_default(),
            &current_source.unwrap_or_default(),
            50,
        );
        return serde_json::json!({ "results": results });
    }

    serde_json::json!({ "results": [] })
}

/// Get template images for nodes
#[tauri::command]
pub fn resource_get_templates(
    resources_manager: State<'_, Mutex<Option<ResourcesManager>>>,
    source: String,
    filename: String,
) -> ApiResponse {
    let guard = resources_manager.lock().unwrap();

    if let Some(manager) = guard.as_ref() {
        let nodes = manager.get_nodes_by_file(&source, &filename);
        let image_base = manager.get_image_base_path(&source);

        let mut results: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();

        if let Some(nodes_map) = nodes {
            for (node_id, node_data) in nodes_map {
                if let Some(obj) = node_data.as_object() {
                    let templates = obj.get("template");
                    if templates.is_none() {
                        continue;
                    }

                    let templates_arr: Vec<String> = if let Some(tpl) = templates {
                        if let Some(s) = tpl.as_str() {
                            vec![s.to_string()]
                        } else if let Some(arr) = tpl.as_array() {
                            arr.iter()
                                .filter_map(|t| t.as_str().map(|s| s.to_string()))
                                .collect()
                        } else {
                            Vec::new()
                        }
                    } else {
                        Vec::new()
                    };

                    let mut node_images: Vec<serde_json::Value> = Vec::new();

                    for tpl in templates_arr {
                        let full_img = manager.get_image_full_path(&source, &tpl);
                        let b64 = manager.encode_image_to_base64(&full_img);
                        node_images.push(serde_json::json!({
                            "path": tpl,
                            "found": b64.is_some(),
                            "base64": b64
                        }));
                    }

                    if !node_images.is_empty() {
                        results.insert(
                            node_id,
                            serde_json::Value::Array(node_images),
                        );
                    }
                }
            }
        }

        return ApiResponse::ok_with_data(
            "Loaded",
            serde_json::json!({
                "base_image_path": image_base.to_string_lossy().to_string(),
                "results": results
            }),
        );
    }

    ApiResponse::error_with_status("ResourcesManager not initialized", 500)
}

/// Check unused images
#[tauri::command]
pub fn resource_check_unused_images(
    resources_manager: State<'_, Mutex<Option<ResourcesManager>>>,
    source: String,
    current_filename: Option<String>,
    del_images: Vec<serde_json::Value>,
) -> ApiResponse {
    let guard = resources_manager.lock().unwrap();

    if let Some(manager) = guard.as_ref() {
        let paths_to_check: Vec<String> = del_images
            .iter()
            .filter_map(|img| img.get("path").and_then(|p| p.as_str()).map(|s| s.to_string()))
            .collect();

        if paths_to_check.is_empty() {
            return ApiResponse::ok_with_data(
                "No images to check",
                serde_json::json!({
                    "unused_images": [],
                    "used_images": []
                }),
            );
        }

        let used_map = manager.check_image_references(
            &source,
            &paths_to_check,
            &current_filename.unwrap_or_default(),
        );

        let unused_images: Vec<String> = paths_to_check
            .iter()
            .filter(|p| !used_map.contains_key(*p))
            .cloned()
            .collect();

        let used_images: Vec<serde_json::Value> = used_map
            .iter()
            .map(|(p, nodes)| {
                serde_json::json!({
                    "path": p,
                    "used_by": nodes
                })
            })
            .collect();

        return ApiResponse::ok_with_data(
            "Checked",
            serde_json::json!({
                "unused_images": unused_images,
                "used_images": used_images
            }),
        );
    }

    ApiResponse::error_with_status("ResourcesManager not initialized", 500)
}

/// Process images (delete and save)
#[tauri::command]
pub fn resource_process_images(
    resources_manager: State<'_, Mutex<Option<ResourcesManager>>>,
    source: String,
    delete_paths: Vec<String>,
    save_images: Vec<serde_json::Value>,
) -> ApiResponse {
    let guard = resources_manager.lock().unwrap();

    if let Some(manager) = guard.as_ref() {
        let mut results = serde_json::json!({
            "deleted": [],
            "delete_failed": [],
            "saved": [],
            "save_failed": []
        });

        // Delete images
        for path in delete_paths {
            if path.is_empty() {
                continue;
            }
            if manager.delete_image(&source, &path) {
                if let Some(arr) = results.get_mut("deleted").and_then(|v| v.as_array_mut()) {
                    arr.push(serde_json::Value::String(path));
                }
            } else if let Some(arr) = results.get_mut("delete_failed").and_then(|v| v.as_array_mut()) {
                arr.push(serde_json::json!({
                    "path": path,
                    "reason": "File not found"
                }));
            }
        }

        // Save images
        for img in save_images {
            let path = img.get("path").and_then(|p| p.as_str());
            let base64_data = img.get("base64").and_then(|b| b.as_str());

            if let (Some(p), Some(b64)) = (path, base64_data) {
                if manager.save_image(&source, p, b64) {
                    if let Some(arr) = results.get_mut("saved").and_then(|v| v.as_array_mut()) {
                        arr.push(serde_json::Value::String(p.to_string()));
                    }
                } else if let Some(arr) = results.get_mut("save_failed").and_then(|v| v.as_array_mut()) {
                    arr.push(serde_json::json!({
                        "path": p,
                        "reason": "Save failed"
                    }));
                }
            }
        }

        return ApiResponse::ok_with_data("Processed", results);
    }

    ApiResponse::error_with_status("ResourcesManager not initialized", 500)
}