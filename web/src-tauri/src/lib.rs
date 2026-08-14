use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, RunEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

// Linux desktop integration (§21 of the spec): system tray, quick-capture global hotkey,
// desktop notifications, and (below) auto-starting Orbit's own local API server so the
// desktop app is self-contained instead of requiring `npm run dev:server` to be running
// separately. Idle detection / active-window detection / D-Bus require platform crates
// (x11rb + zbus, or a small XDG portal client) this scaffold doesn't wire up yet.
type SharedChild = Arc<Mutex<Option<Child>>>;

const SERVER_PORT: &str = "4310";

fn port_is_taken() -> bool {
    let addr: std::net::SocketAddr = format!("127.0.0.1:{SERVER_PORT}").parse().expect("valid addr");
    std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

fn kill_tracked_server(server: &SharedChild) {
    if let Some(mut child) = server.lock().unwrap().take() {
        let _ = child.kill();
    }
}

// Spawns the server bundled as a Tauri resource (see prepare-server-resource.sh) and tracks
// the child in `server` so it can be killed on exit. No-ops if something is already
// listening on the port — most likely a dev server the user started manually, which should
// win rather than be fought over by a second instance.
fn spawn_bundled_server(app: &tauri::AppHandle, server: &SharedChild) {
    if port_is_taken() {
        eprintln!("[orbit] server already reachable on :{SERVER_PORT} — not spawning a bundled copy");
        return;
    }

    let resource_dir = match app.path().resource_dir() {
        Ok(dir) => dir.join("resources").join("server-runtime"),
        Err(e) => {
            eprintln!("[orbit] couldn't resolve resource dir: {e}");
            return;
        }
    };
    let entry = resource_dir.join("dist").join("index.js");
    if !entry.exists() {
        eprintln!("[orbit] bundled server not found at {entry:?} — this build wasn't produced via prepare-server-resource.sh");
        return;
    }

    // Same data directory the server resolves to on its own (see server/src/dataDir.ts) —
    // passed explicitly so a dev-checkout run and the packaged app always agree on where
    // the database lives, regardless of Tauri's own per-identifier app-data convention.
    let data_dir = app.path().home_dir().ok().map(|h| h.join(".local/share/orbit"));

    let log_path = std::env::temp_dir().join("orbit-server.log");
    let log_file = std::fs::File::create(&log_path).ok();

    let mut cmd = Command::new("node");
    cmd.arg(&entry).current_dir(&resource_dir);
    if let Some(f) = log_file.as_ref().and_then(|f| f.try_clone().ok()) {
        cmd.stdout(f);
    }
    if let Some(f) = log_file.and_then(|f| f.try_clone().ok()) {
        cmd.stderr(f);
    }
    if let Some(dir) = &data_dir {
        cmd.env("ORBIT_DATA_DIR", dir);
    }

    match cmd.spawn() {
        Ok(child) => {
            eprintln!("[orbit] spawned bundled server (pid {}), logs at {log_path:?}", child.id());
            *server.lock().unwrap() = Some(child);
        }
        Err(e) => {
            eprintln!("[orbit] failed to spawn bundled server: {e} — is Node.js installed and on PATH?");
        }
    }
}

// Tauri's own exit path (tray "Quit" -> app.exit(0) -> RunEvent::Exit) cleans up the child
// process fine on its own, but a plain `kill`/SIGTERM on the app (window manager logout,
// `pkill`, systemd stopping it, etc.) bypasses that event loop entirely and would otherwise
// orphan the spawned server. Handling the signals directly on a background thread — not
// inside the raw signal handler itself, which isn't safe to lock a mutex in — covers both
// paths so the server never outlives the app it belongs to.
#[cfg(unix)]
fn install_signal_cleanup(server: SharedChild) {
    use signal_hook::consts::{SIGINT, SIGTERM};
    use signal_hook::iterator::Signals;

    let mut signals = match Signals::new([SIGTERM, SIGINT]) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[orbit] couldn't install signal handler: {e}");
            return;
        }
    };
    std::thread::spawn(move || {
        if signals.forever().next().is_some() {
            eprintln!("[orbit] received termination signal, stopping bundled server");
            kill_tracked_server(&server);
            std::process::exit(0);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let server: SharedChild = Arc::new(Mutex::new(None));

    #[cfg(unix)]
    install_signal_cleanup(server.clone());

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup({
            let server = server.clone();
            move |app| {
                if cfg!(debug_assertions) {
                    app.handle().plugin(
                        tauri_plugin_log::Builder::default()
                            .level(log::LevelFilter::Info)
                            .build(),
                    )?;
                }

                spawn_bundled_server(&app.handle().clone(), &server);

                let show = MenuItem::with_id(app, "show", "Open Orbit", true, None::<&str>)?;
                let quick_capture = MenuItem::with_id(app, "quick_capture", "Quick Capture", true, None::<&str>)?;
                let check_updates = MenuItem::with_id(app, "check_updates", "Check for Updates", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show, &quick_capture, &check_updates, &quit])?;

                let mut tray_builder = TrayIconBuilder::new().menu(&menu).show_menu_on_left_click(true);
                if let Some(icon) = app.default_window_icon() {
                    tray_builder = tray_builder.icon(icon.clone());
                }
                let _tray = tray_builder
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quick_capture" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("quick-capture-requested", ());
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "check_updates" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("check-for-updates-requested", ());
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .build(app)?;

                // Global hotkey (Ctrl+Shift+Space) opens quick capture from anywhere on the desktop.
                let quick_capture_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
                let handle = app.handle().clone();
                app.global_shortcut().on_shortcut(quick_capture_shortcut, move |_app, shortcut, event| {
                    if shortcut == &quick_capture_shortcut && event.state() == ShortcutState::Pressed {
                        if let Some(window) = handle.get_webview_window("main") {
                            let _ = window.emit("quick-capture-requested", ());
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })?;

                Ok(())
            }
        })
        .on_window_event(|window, event| {
            // Close-to-tray instead of quitting, matching the "background service" pattern (§1/§21).
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    builder.run(move |_app_handle, event| {
        // Only the process we spawned ourselves gets killed here — if the port was already
        // taken at startup (e.g. a dev server), spawn_bundled_server left `server` empty and
        // we correctly leave that other process alone.
        if let RunEvent::Exit = event {
            kill_tracked_server(&server);
        }
    });
}
