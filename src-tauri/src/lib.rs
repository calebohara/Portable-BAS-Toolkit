use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tauri::{Emitter, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::sync::Mutex;

// ─── Ping Command ────────────────────────────────────────────
#[derive(Serialize, Deserialize)]
pub struct PingResult {
    pub host: String,
    pub reachable: bool,
    pub response_time_ms: Option<u64>,
    pub ttl: Option<u32>,
    pub error: Option<String>,
    pub method: String, // "icmp" or "http"
}

#[tauri::command]
#[allow(non_snake_case)]
async fn icmp_ping(host: String, count: Option<u32>, timeoutMs: Option<u32>) -> Result<Vec<PingResult>, String> {
    let count = count.unwrap_or(4);
    let timeout_ms = timeoutMs.unwrap_or(5000);
    let timeout_secs = (timeout_ms / 1000).max(1);

    let mut results = Vec::new();

    for _ in 0..count {
        let start = Instant::now();

        let output = if cfg!(target_os = "windows") {
            Command::new("ping")
                .args(["-n", "1", "-w", &(timeout_secs * 1000).to_string(), &host])
                .output()
                .await
        } else {
            Command::new("ping")
                .args(["-c", "1", "-W", &timeout_secs.to_string(), &host])
                .output()
                .await
        };

        let elapsed = start.elapsed().as_millis() as u64;

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let success = output.status.success() && !stdout.contains("100% packet loss")
                    && !stdout.contains("100.0% packet loss")
                    && !stdout.contains("Request timed out")
                    && !stdout.contains("Destination host unreachable");

                let ttl = parse_ttl(&stdout);
                let rtt = parse_rtt(&stdout);

                results.push(PingResult {
                    host: host.clone(),
                    reachable: success,
                    response_time_ms: if success { Some(rtt.unwrap_or(elapsed)) } else { Some(elapsed) },
                    ttl,
                    error: if success { None } else { Some(stdout.trim().to_string()) },
                    method: "icmp".to_string(),
                });
            }
            Err(e) => {
                results.push(PingResult {
                    host: host.clone(),
                    reachable: false,
                    response_time_ms: Some(elapsed),
                    ttl: None,
                    error: Some(format!("Failed to execute ping: {}", e)),
                    method: "icmp".to_string(),
                });
            }
        }
    }

    Ok(results)
}

fn parse_ttl(output: &str) -> Option<u32> {
    let lower = output.to_lowercase();
    if let Some(pos) = lower.find("ttl=") {
        let after = &lower[pos + 4..];
        let num_str: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
        num_str.parse().ok()
    } else {
        None
    }
}

fn parse_rtt(output: &str) -> Option<u64> {
    let lower = output.to_lowercase();
    if let Some(pos) = lower.find("time=") {
        let after = &lower[pos + 5..];
        let num_str: String = after.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
        num_str.parse::<f64>().ok().map(|v| v.round() as u64)
    } else if lower.contains("time<1ms") {
        Some(0)
    } else {
        None
    }
}

// ─── TCP Port Check ─────────────────────────────────────────
#[derive(Serialize, Deserialize)]
pub struct PortCheckResult {
    pub host: String,
    pub port: u16,
    pub open: bool,
    pub response_time_ms: u64,
    pub error: Option<String>,
}

#[tauri::command]
#[allow(non_snake_case)]
async fn check_port(host: String, port: u16, timeoutMs: Option<u64>) -> Result<PortCheckResult, String> {
    let timeout = std::time::Duration::from_millis(timeoutMs.unwrap_or(3000));
    let start = Instant::now();
    let addr = format!("{}:{}", host, port);

    // Use blocking std::net connect (same Winsock code path as native tools)
    // Tokio's async IOCP connect can fail on some BAS network configurations
    let sock_addr: std::net::SocketAddr = addr.parse()
        .map_err(|_| format!("Invalid address: {}", addr))?;

    let connect_result = tokio::task::spawn_blocking(move || {
        std::net::TcpStream::connect_timeout(&sock_addr, timeout)
    })
    .await
    .map_err(|e| format!("Port check task failed: {}", e))?;

    match connect_result {
        Ok(_stream) => {
            let elapsed = start.elapsed().as_millis() as u64;
            Ok(PortCheckResult {
                host,
                port,
                open: true,
                response_time_ms: elapsed,
                error: None,
            })
        }
        Err(e) => {
            let elapsed = start.elapsed().as_millis() as u64;
            let detail = e.to_string();
            let timed_out = detail.contains("timed out") || detail.contains("timeout");
            Ok(PortCheckResult {
                host,
                port,
                open: false,
                response_time_ms: elapsed,
                error: Some(if timed_out { "Connection timed out".to_string() } else { detail }),
            })
        }
    }
}

// ─── Telnet TCP Connection ──────────────────────────────────
// Telnet protocol constants
const IAC: u8 = 255;
const DONT: u8 = 254;
const DO: u8 = 253;
const WONT: u8 = 252;
const WILL: u8 = 251;
const SB: u8 = 250;
const SE: u8 = 240;
// Common telnet options
const OPT_ECHO: u8 = 1;
const OPT_SGA: u8 = 3; // Suppress Go-Ahead

struct TelnetConnection {
    writer: Arc<Mutex<tokio::net::tcp::OwnedWriteHalf>>,
    read_task: tokio::task::JoinHandle<()>,
}

struct TelnetState(Arc<Mutex<HashMap<String, TelnetConnection>>>);

/// Process incoming bytes: parse IAC sequences, build negotiation responses,
/// and return only the displayable data.
fn process_telnet_bytes(buf: &[u8], n: usize) -> (Vec<u8>, Vec<u8>) {
    let mut filtered = Vec::with_capacity(n);
    let mut responses = Vec::new();
    let mut i = 0;

    while i < n {
        if buf[i] == IAC && i + 1 < n {
            let cmd = buf[i + 1];
            match cmd {
                WILL => {
                    if i + 2 < n {
                        let opt = buf[i + 2];
                        // Accept ECHO and SGA; reject everything else
                        if opt == OPT_ECHO || opt == OPT_SGA {
                            responses.extend_from_slice(&[IAC, DO, opt]);
                        } else {
                            responses.extend_from_slice(&[IAC, DONT, opt]);
                        }
                        i += 3;
                    } else {
                        break; // incomplete sequence, wait for next read
                    }
                }
                WONT => {
                    if i + 2 < n {
                        responses.extend_from_slice(&[IAC, DONT, buf[i + 2]]);
                        i += 3;
                    } else {
                        break;
                    }
                }
                DO => {
                    if i + 2 < n {
                        // We don't support any DO requests from server
                        responses.extend_from_slice(&[IAC, WONT, buf[i + 2]]);
                        i += 3;
                    } else {
                        break;
                    }
                }
                DONT => {
                    // Acknowledge, no response needed
                    if i + 2 < n { i += 3; } else { break; }
                }
                SB => {
                    // Skip subnegotiation until IAC SE
                    i += 2;
                    while i < n {
                        if buf[i] == IAC && i + 1 < n && buf[i + 1] == SE {
                            i += 2;
                            break;
                        }
                        i += 1;
                    }
                }
                IAC => {
                    // Escaped 0xFF — literal byte
                    filtered.push(0xFF);
                    i += 2;
                }
                _ => {
                    i += 2; // Other two-byte IAC commands (GA, NOP, etc.)
                }
            }
        } else {
            filtered.push(buf[i]);
            i += 1;
        }
    }

    (filtered, responses)
}

#[tauri::command]
#[allow(non_snake_case)]
async fn telnet_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, TelnetState>,
    sessionId: String,
    host: String,
    port: u16,
) -> Result<(), String> {
    let addr = format!("{}:{}", host, port);
    let timeout = std::time::Duration::from_secs(15);

    // Parse as SocketAddr directly to avoid async DNS resolution issues
    let sock_addr: std::net::SocketAddr = addr.parse()
        .map_err(|_| format!("Invalid address: {}. Enter a valid IP address and port.", addr))?;

    // Use blocking std::net TCP connect (same Winsock code path as Tera Term)
    // then convert to async tokio stream. Tokio's async connect uses IOCP on
    // Windows which can behave differently with BAS network adapters/VLANs.
    let addr_str = addr.clone();
    let port_val = port;
    let host_str = host.clone();
    let std_stream = tokio::task::spawn_blocking(move || {
        std::net::TcpStream::connect_timeout(&sock_addr, timeout)
            .map_err(|e| {
                let detail = e.to_string();
                if detail.contains("timed out") || detail.contains("timeout") {
                    format!(
                        "Connection to {} timed out (15s). Troubleshooting:\n\
                         • Verify the device is powered on and reachable (try the Ping Tool)\n\
                         • Check Windows Firewall — BAU Suite may need an inbound/outbound exception\n\
                         • Confirm you're on the correct network/VLAN for BAS devices\n\
                         • Try port {} in the Port Scanner tool first",
                        addr_str, port_val
                    )
                } else if detail.contains("refused") {
                    format!("Connection refused by {}. The host is reachable but port {} is not accepting connections.", addr_str, port_val)
                } else if detail.contains("No route") || detail.contains("unreachable") {
                    format!("Host {} is unreachable. Check network/VPN connectivity.", host_str)
                } else {
                    format!("Connection to {} failed: {}", addr_str, detail)
                }
            })
    })
    .await
    .map_err(|e| format!("Connection task failed: {}", e))?
    ?;

    // Convert blocking socket to async tokio stream
    std_stream.set_nonblocking(true)
        .map_err(|e| format!("Failed to set non-blocking mode: {}", e))?;
    std_stream.set_nodelay(true).ok(); // Low-latency interactive terminal
    let stream = tokio::net::TcpStream::from_std(std_stream)
        .map_err(|e| format!("Failed to create async stream: {}", e))?;

    let (read_half, write_half) = stream.into_split();
    let writer = Arc::new(Mutex::new(write_half));

    // Send initial telnet negotiation: request server to echo and suppress go-ahead
    {
        let mut w = writer.lock().await;
        let init_negotiation = [IAC, DO, OPT_SGA, IAC, DO, OPT_ECHO];
        let _ = w.write_all(&init_negotiation).await;
    }

    let sid = sessionId.clone();
    let app_handle = app.clone();
    let writer_for_task = writer.clone();

    let read_task = tokio::spawn(async move {
        let mut reader = read_half;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf).await {
                Ok(0) => {
                    let _ = app_handle.emit(&format!("telnet-closed-{}", sid), ());
                    break;
                }
                Ok(n) => {
                    let (filtered, responses) = process_telnet_bytes(&buf, n);

                    // Send negotiation responses back to server
                    if !responses.is_empty() {
                        let mut w = writer_for_task.lock().await;
                        let _ = w.write_all(&responses).await;
                    }

                    // Emit displayable data to frontend
                    if !filtered.is_empty() {
                        let data = String::from_utf8_lossy(&filtered).to_string();
                        let _ = app_handle.emit(&format!("telnet-data-{}", sid), data);
                    }
                }
                Err(e) => {
                    let _ = app_handle.emit(
                        &format!("telnet-error-{}", sid),
                        e.to_string(),
                    );
                    break;
                }
            }
        }
    });

    let mut connections = state.0.lock().await;
    if let Some(old) = connections.remove(&sessionId) {
        old.read_task.abort();
    }
    connections.insert(
        sessionId,
        TelnetConnection {
            writer,
            read_task,
        },
    );

    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
async fn telnet_send(
    state: tauri::State<'_, TelnetState>,
    sessionId: String,
    data: String,
    lineEnding: Option<String>,
) -> Result<(), String> {
    let writer = {
        let connections = state.0.lock().await;
        match connections.get(&sessionId) {
            Some(conn) => conn.writer.clone(),
            None => return Err("Not connected".to_string()),
        }
    };
    let ending = match lineEnding.as_deref() {
        Some("cr") => "\r",
        Some("lf") => "\n",
        _ => "\r\n", // CRLF default (standard telnet)
    };
    let payload = format!("{}{}", data, ending);
    let mut w = writer.lock().await;
    w.write_all(payload.as_bytes())
        .await
        .map_err(|e| format!("Send failed: {}", e))?;
    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
async fn telnet_disconnect(
    state: tauri::State<'_, TelnetState>,
    sessionId: String,
) -> Result<(), String> {
    let mut connections = state.0.lock().await;
    if let Some(conn) = connections.remove(&sessionId) {
        conn.read_task.abort();
        // Attempt graceful shutdown
        if let Ok(mut w) = conn.writer.try_lock() {
            let _ = w.shutdown().await;
        }
    }
    Ok(())
}

// ─── SPA Fallback Navigation ────────────────────────────────
// Resolves the correct fallback path for dynamic routes in static export mode.
// When the webview navigates to /projects/{uuid}/, the file doesn't exist in
// the embedded assets. This command returns the fallback URL so the frontend
// can redirect client-side.
#[tauri::command]
fn resolve_spa_route(path: String) -> Option<String> {
    let path = path.trim_end_matches('/');

    // /projects/{id} → /projects/_/
    if path.starts_with("/projects/") && path.split('/').count() == 3 {
        return Some("/projects/_/".to_string());
    }

    // /reports/{id}/edit → /reports/_/edit/
    if path.starts_with("/reports/") && path.ends_with("/edit") && path.split('/').count() == 4 {
        return Some("/reports/_/edit/".to_string());
    }

    // /reports/{id} → /reports/_/
    if path.starts_with("/reports/") && path.split('/').count() == 3 {
        return Some("/reports/_/".to_string());
    }

    None
}

// ─── Tauri App ──────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TelnetState(Arc::new(Mutex::new(HashMap::new()))))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Inject SPA navigation handler into the main window
            // This handles hard refreshes on dynamic routes in the static export.
            // When the webview hard-refreshes on /projects/{uuid}, the static file
            // doesn't exist — we detect this and redirect to the catch-all fallback.
            let main_window = app.get_webview_window("main");
            if let Some(window) = main_window {
                let _ = window.eval(r#"
                    (function() {
                        function checkSpaFallback() {
                            const path = window.location.pathname;
                            const parts = path.replace(/\/$/, '').split('/');

                            // Check if this is a dynamic route (projects/{id} or reports/{id}[/edit])
                            const isDynamic = (
                                (parts[1] === 'projects' && parts.length === 3 && parts[2] !== '_') ||
                                (parts[1] === 'reports' && parts.length >= 3 && parts[2] !== '_' && parts[2] !== 'new')
                            );

                            if (!isDynamic) return;

                            // Detect if the page failed to load: check for empty body OR
                            // missing Next.js root element (more reliable than empty body check)
                            const hasNextRoot = document.getElementById('__next');
                            const bodyEmpty = document.body && document.body.innerHTML.trim() === '';
                            const isErrorPage = document.title === '' || document.title === '404';

                            if (bodyEmpty || !hasNextRoot || isErrorPage) {
                                const id = parts[2];
                                const isEdit = parts[3] === 'edit';
                                // Preserve existing query params (e.g. ?tab=notes) through the fallback redirect
                                const existingParams = new URLSearchParams(window.location.search);
                                existingParams.set('_id', id);
                                let fallbackUrl;
                                if (parts[1] === 'projects') {
                                    fallbackUrl = '/projects/_/?' + existingParams.toString();
                                } else if (isEdit) {
                                    fallbackUrl = '/reports/_/edit/?' + existingParams.toString();
                                } else {
                                    fallbackUrl = '/reports/_/?' + existingParams.toString();
                                }
                                window.location.replace(fallbackUrl);
                            }
                        }

                        // Wait for the page to fully load before checking
                        if (document.readyState === 'complete') {
                            checkSpaFallback();
                        } else {
                            window.addEventListener('load', checkSpaFallback);
                        }
                    })();
                "#);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            icmp_ping,
            check_port,
            resolve_spa_route,
            telnet_connect,
            telnet_send,
            telnet_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
