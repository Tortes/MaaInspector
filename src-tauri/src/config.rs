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
pub struct CurrentState {
    pub device_index: Option<i32>,
    pub resource_profile_index: Option<i32>,
    pub resource_file: Option<String>,
    pub resource_source: Option<String>,
    pub agent_socket_id: Option<String>,
    pub edge_type: Option<String>,
    pub spacing: Option<String>,
    pub pipeline_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    #[serde(default)]
    pub devices: Vec<DeviceInfo>,
    #[serde(default)]
    pub resource_profiles: Vec<ResourceProfile>,
    #[serde(default)]
    pub current_state: CurrentState,
    #[serde(default)]
    pub default_resource_path: Option<String>,
    #[serde(default)]
    pub default_socket_id: Option<String>,
    #[serde(default)]
    pub agent_socket_id: Option<String>,
    #[serde(default)]
    pub last_connected_device: Option<DeviceInfo>,
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
                    "devices" => {
                        if let Ok(v) = serde_json::from_value::<Vec<DeviceInfo>>(value.clone()) {
                            self.devices = v;
                        }
                    }
                    "resource_profiles" => {
                        if let Ok(v) = serde_json::from_value::<Vec<ResourceProfile>>(value.clone())
                        {
                            self.resource_profiles = v;
                        }
                    }
                    "current_state" => {
                        if let Ok(v) = serde_json::from_value::<CurrentState>(value.clone()) {
                            self.current_state = v;
                        }
                    }
                    "default_resource_path" => {
                        self.default_resource_path = value.as_str().map(|s| s.to_string());
                    }
                    "default_socket_id" => {
                        self.default_socket_id = value.as_str().map(|s| s.to_string());
                    }
                    "agent_socket_id" => {
                        self.agent_socket_id = value.as_str().map(|s| s.to_string());
                    }
                    "last_connected_device" => {
                        if let Ok(v) = serde_json::from_value::<DeviceInfo>(value.clone()) {
                            self.last_connected_device = Some(v);
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}
