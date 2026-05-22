/// Encode raw image data as base64 PNG
pub fn encode_image_as_base64(raw_data: &[u8]) -> Option<String> {
    if raw_data.is_empty() {
        return None;
    }

    let is_png = raw_data.len() > 4 && raw_data[0..4] == [0x89, 0x50, 0x4E, 0x47];
    let is_jpeg = raw_data.len() > 3 && raw_data[0..3] == [0xFF, 0xD8, 0xFF];

    let mime = if is_png {
        "image/png"
    } else if is_jpeg {
        "image/jpeg"
    } else {
        "image/png"
    };

    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, raw_data);
    Some(format!("data:{};base64,{}", mime, encoded))
}

pub fn detect_image_size(raw_data: &[u8]) -> Option<Vec<i32>> {
    let image = image::load_from_memory(raw_data).ok()?;
    Some(vec![image.width() as i32, image.height() as i32])
}

/// Encode raw image bytes as base64
pub fn encode_raw_image(raw_data: &[u8]) -> Option<String> {
    if raw_data.is_empty() {
        return None;
    }

    match image::load_from_memory(raw_data) {
        Ok(img) => {
            let rgb_img = img.to_rgb8();

            let mut png_data = Vec::new();
            match rgb_img.write_to(
                &mut std::io::Cursor::new(&mut png_data),
                image::ImageFormat::Png,
            ) {
                Ok(_) => {
                    let encoded = base64::Engine::encode(
                        &base64::engine::general_purpose::STANDARD,
                        &png_data,
                    );
                    Some(format!("data:image/png;base64,{}", encoded))
                }
                Err(_) => None,
            }
        }
        Err(_) => {
            let encoded =
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, raw_data);
            Some(format!("data:image/png;base64,{}", encoded))
        }
    }
}
