use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const CONFIG_FILE: &str = "config.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeviceInfo {
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub device_type: Option<String>,
    pub address: Option<String>,
    pub config: Option<serde_json::Value>,
    pub hwnd: Option<i64>,
    pub class_name: Option<String>,
    pub window_name: Option<String>,
    pub adb_path: Option<String>,
    pub screencap_method: Option<i32>,
    pub mouse_method: Option<i32>,
    pub keyboard_method: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ResourceProfile {
    pub name: Option<String>,
    pub paths: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CanvasSettings {
    pub edge_type: Option<String>,
    pub spacing: Option<String>,
    pub layout_algorithm: Option<String>,
    pub layout_direction: Option<String>,
    pub pipeline_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TabResourceInfo {
    pub id: Option<String>,
    pub title: Option<String>,
    pub resource_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LastTabsState {
    pub resource_index: i32,
    pub tabs: Vec<TabResourceInfo>,
    pub active_tab_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorkspaceState {
    pub resource_index: Option<i32>,
    pub resource_signature: Option<String>,
    pub tabs: Vec<TabResourceInfo>,
    pub active_tab_id: Option<String>,
    pub restore_workspace_on_start: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    #[serde(default)]
    pub resource_profiles: Vec<ResourceProfile>,
    #[serde(default)]
    pub current_resource_index: Option<i32>,
    #[serde(default)]
    pub agent_socket_id: Option<String>,
    #[serde(default)]
    pub canvas_settings: CanvasSettings,
    #[serde(default)]
    pub restore_workspace_on_start: Option<bool>,
    #[serde(default)]
    pub workspace_state: Option<WorkspaceState>,
    #[serde(default)]
    pub last_tabs: Option<LastTabsState>,
}

impl AppConfig {
    pub fn load(config_dir: &str) -> Self {
        let config_path = Path::new(config_dir).join(CONFIG_FILE);
        if !config_path.exists() {
            return Self::default();
        }

        match fs::read_to_string(&config_path) {
            Ok(content) => match serde_json::from_str(&content) {
                Ok(config) => config,
                Err(e) => {
                    eprintln!("Failed to parse config.json: {}", e);
                    Self::default()
                }
            },
            Err(e) => {
                eprintln!("Failed to read config.json: {}", e);
                Self::default()
            }
        }
    }

    pub fn save(&self, config_dir: &str) -> bool {
        let config_path = Path::new(config_dir).join(CONFIG_FILE);
        match serde_json::to_string_pretty(&self) {
            Ok(content) => match fs::write(&config_path, content) {
                Ok(_) => true,
                Err(e) => {
                    eprintln!("Failed to write config.json: {}", e);
                    false
                }
            },
            Err(e) => {
                eprintln!("Failed to serialize config: {}", e);
                false
            }
        }
    }

    pub fn merge(&mut self, other: &serde_json::Value) {
        if let Some(obj) = other.as_object() {
            for (key, value) in obj {
                match key.as_str() {
                    "resource_profiles" => {
                        if let Ok(v) = serde_json::from_value::<Vec<ResourceProfile>>(value.clone())
                        {
                            self.resource_profiles = v;
                        }
                    }
                    "current_resource_index" => {
                        self.current_resource_index = value.as_i64().map(|v| v as i32);
                    }
                    "agent_socket_id" => {
                        self.agent_socket_id = value.as_str().map(|s| s.to_string());
                    }
                    "canvas_settings" => {
                        if let Ok(v) = serde_json::from_value::<CanvasSettings>(value.clone()) {
                            self.canvas_settings = v;
                        }
                    }
                    "restore_workspace_on_start" => {
                        self.restore_workspace_on_start = value.as_bool();
                    }
                    "workspace_state" => {
                        if let Ok(v) = serde_json::from_value::<WorkspaceState>(value.clone()) {
                            self.workspace_state = Some(v);
                        }
                    }
                    "last_tabs" => {
                        if let Ok(v) = serde_json::from_value::<LastTabsState>(value.clone()) {
                            self.last_tabs = Some(v);
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}
