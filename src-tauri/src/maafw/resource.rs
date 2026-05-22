use maa_framework::resource::Resource;

/// Load resource from paths (async version)
pub async fn load_resource_async(
    existing_resource: Option<Resource>,
    paths: &[String],
) -> (bool, Option<String>, Option<Resource>) {
    if paths.is_empty() {
        return (false, Some("No resource paths provided".to_string()), existing_resource);
    }

    let resource = match existing_resource {
        Some(existing) => existing,
        None => match Resource::new() {
            Ok(res) => res,
            Err(e) => return (false, Some(format!("Failed to create resource: {}", e)), None),
        },
    };

    let paths_clone = paths.to_vec();
    let result = tokio::task::spawn_blocking(move || {
        let mut load_success = true;
        let mut errors = Vec::new();

        for path in &paths_clone {
            if path.is_empty() {
                continue;
            }
            match resource.post_bundle(path) {
                Ok(job) => {
                    job.wait();
                }
                Err(e) => {
                    errors.push(format!("Failed to load '{}': {}", path, e));
                    load_success = false;
                }
            }
        }

        (resource, load_success, errors)
    }).await;

    let (resource, load_success, errors) = match result {
        Ok(r) => r,
        Err(e) => return (false, Some(format!("Resource loading task failed: {}", e)), None),
    };

    if resource.loaded() {
        if load_success {
            (true, Some(format!("Loaded {} resource path(s)", paths.len())), Some(resource))
        } else {
            (true, Some(format!("Partially loaded: {}", errors.join("; "))), Some(resource))
        }
    } else {
        let msg = if errors.is_empty() {
            "Failed to load any resources".to_string()
        } else {
            errors.join("; ")
        };
        (false, Some(msg), None)
    }
}
