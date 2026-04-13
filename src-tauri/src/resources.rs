use regex::Regex;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::response::ResourceFileInfo;

/// ResourcesManager - manages pipeline JSON files and images
pub struct ResourcesManager {
    resource_paths: Vec<PathBuf>,
    files_cache: HashMap<PathBuf, HashMap<String, HashMap<String, JsonValue>>>,
    node_index: Vec<NodeIndexEntry>,
}

#[derive(Debug, Clone)]
struct NodeIndexEntry {
    resource_path: PathBuf,
    filename: String,
    node_id: String,
    data: JsonValue,
}

impl ResourcesManager {
    pub fn new(paths: Vec<String>) -> Self {
        let normalized_paths: Vec<PathBuf> = paths
            .iter()
            .filter(|p| !p.is_empty())
            .map(|p| {
                PathBuf::from(p)
                    .canonicalize()
                    .unwrap_or_else(|_| PathBuf::from(p))
            })
            .collect();

        let mut manager = Self {
            resource_paths: normalized_paths,
            files_cache: HashMap::new(),
            node_index: Vec::new(),
        };
        manager.load_all();
        manager
    }

    fn get_pipeline_dir(&self, resource_path: &Path) -> PathBuf {
        resource_path.join("pipeline")
    }

    fn get_image_dir(&self, resource_path: &Path) -> PathBuf {
        resource_path.join("image")
    }

    fn load_all(&mut self) {
        self.files_cache.clear();
        self.node_index.clear();

        for resource_path in &self.resource_paths {
            let pipeline_path = self.get_pipeline_dir(resource_path);
            if !pipeline_path.is_dir() {
                continue;
            }

            self.files_cache
                .insert(resource_path.clone(), HashMap::new());

            for entry in WalkDir::new(&pipeline_path)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
            {
                let relative_path = entry
                    .path()
                    .strip_prefix(&pipeline_path)
                    .unwrap_or(entry.path())
                    .to_string_lossy()
                    .to_string();
                if !relative_path.to_lowercase().ends_with(".json") {
                    continue;
                }

                let full_path = entry.path();
                if let Ok(content) = fs::read_to_string(full_path)
                    && let Ok(json) = serde_json::from_str::<JsonValue>(&content)
                {
                    let normalized = self.normalize_data(json);
                    self.files_cache
                        .get_mut(resource_path)
                        .unwrap()
                        .insert(relative_path.clone(), normalized.clone());

                    // Build index
                    for (node_id, node_data) in normalized.iter() {
                        self.node_index.push(NodeIndexEntry {
                            resource_path: resource_path.clone(),
                            filename: relative_path.clone(),
                            node_id: node_id.clone(),
                            data: node_data.clone(),
                        });
                    }
                }
            }
        }
    }

    fn normalize_data(&self, data: JsonValue) -> HashMap<String, JsonValue> {
        let mut result = HashMap::new();

        if let Some(obj) = data.as_object() {
            for (k, v) in obj {
                result.insert(k.clone(), v.clone());
            }
        } else if let Some(arr) = data.as_array() {
            for item in arr {
                if let Some(item_obj) = item.as_object()
                    && let Some(nid) = item_obj.get("id").and_then(|v| v.as_str())
                {
                    let ndata = item_obj.get("data").cloned().unwrap_or(JsonValue::Null);
                    result.insert(nid.to_string(), ndata);
                }
            }
        }

        result
    }

    fn normalize_template_paths(&self, data: &mut HashMap<String, JsonValue>) {
        for (_, node_data) in data.iter_mut() {
            if let Some(obj) = node_data.as_object_mut()
                && let Some(template) = obj.get("template")
            {
                if let Some(tpl_str) = template.as_str() {
                    let normalized = tpl_str.replace("\\", "/");
                    obj.insert("template".to_string(), JsonValue::String(normalized));
                } else if let Some(tpl_arr) = template.as_array() {
                    let normalized: Vec<JsonValue> = tpl_arr
                        .iter()
                        .map(|t| {
                            if let Some(s) = t.as_str() {
                                JsonValue::String(s.replace("\\", "/"))
                            } else {
                                t.clone()
                            }
                        })
                        .collect();
                    obj.insert("template".to_string(), JsonValue::Array(normalized));
                }
            }
        }
    }

    pub fn list_all_files(&self) -> Vec<ResourceFileInfo> {
        let mut results = Vec::new();

        for resource_path in &self.resource_paths {
            let pipeline_path = self.get_pipeline_dir(resource_path);
            let source_label = resource_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| resource_path.to_string_lossy().to_string());

            if !pipeline_path.is_dir() {
                results.push(ResourceFileInfo {
                    label: format!("[No pipeline] ({})", source_label),
                    value: None,
                    source: resource_path.to_string_lossy().to_string(),
                    filename: None,
                });
                continue;
            }

            let files: Vec<String> = WalkDir::new(&pipeline_path)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
                .map(|e| {
                    e.path()
                        .strip_prefix(&pipeline_path)
                        .unwrap_or(e.path())
                        .to_string_lossy()
                        .to_string()
                })
                .filter(|f| f.to_lowercase().ends_with(".json"))
                .collect();

            if files.is_empty() {
                results.push(ResourceFileInfo {
                    label: format!("[Empty] ({})", source_label),
                    value: None,
                    source: resource_path.to_string_lossy().to_string(),
                    filename: None,
                });
            } else {
                for f in files {
                    results.push(ResourceFileInfo {
                        label: format!("{} ({})", f, source_label),
                        value: Some(f.clone()),
                        source: resource_path.to_string_lossy().to_string(),
                        filename: Some(f),
                    });
                }
            }
        }

        results
    }

    pub fn get_nodes_by_file(
        &self,
        resource_path: &str,
        filename: &str,
    ) -> Option<HashMap<String, JsonValue>> {
        let path = PathBuf::from(resource_path)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(resource_path));

        // Try cache first
        if let Some(files) = self.files_cache.get(&path)
            && let Some(nodes) = files.get(filename)
        {
            return Some(nodes.clone());
        }

        // Read from file
        let pipeline_path = self.get_pipeline_dir(&path);
        let full_path = pipeline_path.join(filename);

        if !full_path.exists() {
            return None;
        }

        if let Ok(content) = fs::read_to_string(&full_path)
            && let Ok(json) = serde_json::from_str::<JsonValue>(&content)
        {
            return Some(self.normalize_data(json));
        }

        None
    }

    pub fn save_nodes(&mut self, resource_path: &str, filename: &str, content: JsonValue) -> usize {
        let path = PathBuf::from(resource_path)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(resource_path));
        let mut normalized = self.normalize_data(content);
        self.normalize_template_paths(&mut normalized);

        let pipeline_path = self.get_pipeline_dir(&path);
        let full_path = pipeline_path.join(filename);

        // Ensure directory exists (including subdirectories)
        if let Some(parent) = full_path.parent()
            && let Err(e) = fs::create_dir_all(parent)
        {
            eprintln!("Failed to create pipeline directory: {}", e);
            return 0;
        }

        // Convert HashMap to JsonValue for saving
        let json_value: JsonValue = normalized
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect::<serde_json::Map<String, JsonValue>>()
            .into();

        if let Ok(json_str) = serde_json::to_string_pretty(&json_value)
            && let Err(e) = fs::write(&full_path, json_str)
        {
            eprintln!("Failed to write file: {}", e);
            return 0;
        }

        // Update cache
        self.files_cache
            .get_mut(&path)
            .unwrap()
            .insert(filename.to_string(), normalized.clone());

        normalized.len()
    }

    pub fn create_file(&mut self, resource_path: &str, filename: &str) -> bool {
        let path = PathBuf::from(resource_path)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(resource_path));
        let fname = if filename.to_lowercase().ends_with(".json") {
            filename.to_string()
        } else {
            format!("{}.json", filename)
        };

        let pipeline_path = self.get_pipeline_dir(&path);
        let full_path = pipeline_path.join(&fname);

        if full_path.exists() {
            return false;
        }

        if let Err(e) = fs::create_dir_all(&pipeline_path) {
            eprintln!("Failed to create pipeline directory: {}", e);
            return false;
        }

        // Write empty JSON object
        if let Err(e) = fs::write(&full_path, "{}") {
            eprintln!("Failed to write file: {}", e);
            return false;
        }

        // Update cache
        self.files_cache
            .get_mut(&path)
            .unwrap()
            .insert(fname, HashMap::new());

        true
    }

    pub fn search_nodes(
        &self,
        query: &str,
        use_regex: bool,
        exclude_file: &str,
        exclude_source: &str,
        max_results: usize,
    ) -> Vec<serde_json::Value> {
        if query.is_empty() {
            return Vec::new();
        }

        let mut results = Vec::new();
        let pattern = if use_regex {
            Regex::new(query).ok()
        } else {
            None
        };
        let query_lower = query.to_lowercase();
        let exclude_source_norm = PathBuf::from(exclude_source)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(exclude_source));

        for entry in &self.node_index {
            // Exclude current file
            if !exclude_file.is_empty()
                && entry.filename == exclude_file
                && (exclude_source_norm.to_string_lossy().is_empty()
                    || entry.resource_path == exclude_source_norm)
            {
                continue;
            }

            let node_data = &entry.data;
            let display_id = if let Some(obj) = node_data.as_object() {
                obj.get("id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| entry.node_id.clone())
            } else {
                entry.node_id.clone()
            };

            let targets = [entry.node_id.as_str(), display_id.as_str()];
            let matched = if let Some(ref p) = pattern {
                targets.iter().any(|t| p.is_match(t))
            } else {
                targets
                    .iter()
                    .any(|t| t.to_lowercase().contains(&query_lower))
            };

            if matched {
                let reco_type = if let Some(obj) = node_data.as_object() {
                    obj.get("recognition")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown")
                } else {
                    "Unknown"
                };

                results.push(serde_json::json!({
                    "filename": entry.filename,
                    "source": entry.resource_path.to_string_lossy().to_string(),
                    "node_id": entry.node_id,
                    "display_id": display_id,
                    "type": reco_type
                }));
            }
        }

        // Sort by display_id
        results.sort_by(|a, b| {
            let a_id = a.get("display_id").and_then(|v| v.as_str()).unwrap_or("");
            let b_id = b.get("display_id").and_then(|v| v.as_str()).unwrap_or("");
            a_id.to_lowercase().cmp(&b_id.to_lowercase())
        });

        results.truncate(max_results);
        results
    }

    pub fn get_image_full_path(&self, resource_path: &str, relative_path: &str) -> PathBuf {
        let path = PathBuf::from(resource_path);
        let image_base = self.get_image_dir(&path);
        image_base.join(relative_path)
    }

    pub fn get_image_base_path(&self, resource_path: &str) -> PathBuf {
        let path = PathBuf::from(resource_path);
        self.get_image_dir(&path)
    }

    pub fn encode_image_to_base64(&self, fullpath: &Path) -> Option<String> {
        if !fullpath.exists() {
            return None;
        }

        let mime = mime_guess::from_path(fullpath)
            .first()
            .map(|m| m.to_string())
            .unwrap_or_else(|| "application/octet-stream".to_string());

        if let Ok(data) = fs::read(fullpath) {
            let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
            return Some(format!("data:{};base64,{}", mime, encoded));
        }

        None
    }

    pub fn save_image(&self, resource_path: &str, relative_path: &str, base64_data: &str) -> bool {
        let _path = PathBuf::from(resource_path);
        let full_path = self.get_image_full_path(resource_path, relative_path);

        // Ensure parent directory exists
        let parent = full_path.parent();
        if let Some(p) = parent
            && let Err(e) = fs::create_dir_all(p)
        {
            eprintln!("Failed to create image directory: {}", e);
            return false;
        }

        // Decode base64
        let data = if base64_data.contains(";base64,") {
            let parts: Vec<&str> = base64_data.split(";base64,").collect();
            if parts.len() > 1 {
                parts[1]
            } else {
                base64_data
            }
        } else {
            base64_data
        };

        if let Ok(decoded) =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, data)
        {
            if let Err(e) = fs::write(&full_path, decoded) {
                eprintln!("Failed to write image: {}", e);
                return false;
            }
            return true;
        }

        false
    }

    pub fn delete_image(&self, resource_path: &str, relative_path: &str) -> bool {
        let path = PathBuf::from(resource_path);
        let full_path = self.get_image_full_path(resource_path, relative_path);

        if !full_path.exists() {
            return false;
        }

        if let Err(e) = fs::remove_file(&full_path) {
            eprintln!("Failed to delete image: {}", e);
            return false;
        }

        // Try to remove empty parent directories
        let parent = full_path.parent();
        let image_base = self.get_image_dir(&path);
        if let Some(p) = parent
            && p != image_base
            && p.is_dir()
        {
            let contents: Vec<_> = WalkDir::new(p)
                .min_depth(1)
                .max_depth(1)
                .into_iter()
                .collect();
            if contents.is_empty() {
                let _ = fs::remove_dir(p);
            }
        }

        true
    }

    pub fn check_image_references(
        &self,
        resource_path: &str,
        image_paths: &[String],
        exclude_file: &str,
    ) -> HashMap<String, Vec<String>> {
        let path = PathBuf::from(resource_path)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(resource_path));
        let mut used_map: HashMap<String, Vec<String>> = HashMap::new();

        let empty_map = HashMap::new();
        let files = self.files_cache.get(&path).unwrap_or(&empty_map);

        for (filename, nodes) in files {
            if filename == exclude_file {
                continue;
            }

            for (node_id, node_data) in nodes {
                if let Some(obj) = node_data.as_object() {
                    let template = obj.get("template");
                    if template.is_none() {
                        continue;
                    }

                    let templates: Vec<String> = if let Some(tpl) = template {
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

                    for img_path in image_paths {
                        if templates.contains(img_path) {
                            used_map
                                .entry(img_path.clone())
                                .or_default()
                                .push(format!("{}:{}", filename, node_id));
                        }
                    }
                }
            }
        }

        used_map
    }
}
