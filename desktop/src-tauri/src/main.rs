#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

const KEYCHAIN_SERVICE: &str = "com.nexusmap.sync";

mod sync;
use sync::{
  sync_init,
  sync_initial_import,
  sync_pull_once,
  sync_pull_start,
  sync_pull_stop,
  sync_read_events,
  vault_write_text_file,
  sync_watch_start,
  sync_watch_stop,
};
use tauri::{Manager, WindowEvent};
use tauri::menu::MenuBuilder;
use tauri::tray::TrayIconBuilder;

#[tauri::command]
fn secure_storage_set(key: String, value: String) -> Result<(), String> {
  let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &key).map_err(|e| e.to_string())?;
  entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn secure_storage_get(key: String) -> Result<Option<String>, String> {
  let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &key).map_err(|e| e.to_string())?;
  match entry.get_password() {
    Ok(v) => Ok(Some(v)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
fn secure_storage_remove(key: String) -> Result<(), String> {
  let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &key).map_err(|e| e.to_string())?;
  match entry.delete_credential() {
    Ok(()) => Ok(()),
    Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      None,
    ))
    .setup(|app| {
      let handle = app.handle();
      let menu = MenuBuilder::new(handle)
        .text("show", "Show")
        .separator()
        .text("quit", "Quit")
        .build()?;

      let icon = handle.default_window_icon().cloned().unwrap();
      TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "show" => {
            if let Some(w) = app.get_webview_window("main") {
              let _ = w.show();
              let _ = w.set_focus();
            }
          }
          "quit" => {
            std::process::exit(0);
          }
          _ => {}
        })
        .build(handle)?;

      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        // Close-to-tray: keep process alive for background sync.
        let _ = window.hide();
        api.prevent_close();
      }
    })
    .invoke_handler(tauri::generate_handler![
      secure_storage_set,
      secure_storage_get,
      secure_storage_remove,
      sync_init,
      sync_initial_import,
      sync_watch_start,
      sync_watch_stop,
      sync_pull_once,
      sync_pull_start,
      sync_pull_stop,
      sync_read_events,
      vault_write_text_file
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn main() {
  run();
}

