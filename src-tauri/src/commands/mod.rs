mod agent;
mod debug;
mod device;
mod log;
mod resource;
mod system;

use crate::maafw::MaaFrameworkWrapper;
use tokio::sync::{Mutex, MutexGuard};

pub use agent::*;
pub use debug::*;
pub use device::*;
pub use log::*;
pub use resource::*;
pub use system::*;

type MaaFrameworkState = Mutex<Option<MaaFrameworkWrapper>>;

fn maafw_mut<'a>(
    guard: &'a mut MutexGuard<'_, Option<MaaFrameworkWrapper>>,
) -> Result<&'a mut MaaFrameworkWrapper, String> {
    guard
        .as_mut()
        .ok_or_else(|| "MaaFramework is not initialized".to_string())
}

fn maafw_ref<'a>(
    guard: &'a MutexGuard<'_, Option<MaaFrameworkWrapper>>,
) -> Result<&'a MaaFrameworkWrapper, String> {
    guard
        .as_ref()
        .ok_or_else(|| "MaaFramework is not initialized".to_string())
}
