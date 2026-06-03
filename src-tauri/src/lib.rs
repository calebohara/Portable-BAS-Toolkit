use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read as _, Write as _};
use std::net::IpAddr;
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
    // Validate host - must be a valid hostname or IP (no shell metacharacters)
    if host.is_empty() || host.chars().any(|c| !c.is_alphanumeric() && c != '.' && c != '-' && c != ':' && c != '_') {
        return Err(format!("Invalid host: contains disallowed characters"));
    }

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
    // Validate host - must be a valid hostname or IP (no shell metacharacters)
    if host.is_empty() || host.chars().any(|c| !c.is_alphanumeric() && c != '.' && c != '-' && c != ':' && c != '_') {
        return Err(format!("Invalid host: contains disallowed characters"));
    }

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

/// Determine whether the byte slice ends with an incomplete IAC sequence that
/// must be carried over to the next TCP read. Returns the index at which the
/// trailing incomplete sequence begins, or `data.len()` if everything parses
/// to a complete boundary.
///
/// Incomplete cases (per RFC 854):
///   * a bare trailing `IAC` (0xFF) with nothing after it,
///   * `IAC WILL/WONT/DO/DONT` (0xFB–0xFE) awaiting its option byte,
///   * `IAC SB ...` awaiting the closing `IAC SE`.
///
/// Note `IAC IAC` (escaped literal 0xFF) is a *complete* 2-byte sequence and is
/// never carried over.
fn telnet_incomplete_tail(data: &[u8]) -> usize {
    let n = data.len();
    let mut i = 0;
    while i < n {
        if data[i] != IAC {
            i += 1;
            continue;
        }
        // We're at an IAC.
        if i + 1 >= n {
            // Bare trailing IAC — carry over.
            return i;
        }
        let cmd = data[i + 1];
        match cmd {
            IAC => {
                // Escaped literal 0xFF — complete 2-byte sequence.
                i += 2;
            }
            WILL | WONT | DO | DONT => {
                if i + 2 >= n {
                    // Verb present but option byte missing — carry over.
                    return i;
                }
                i += 3;
            }
            SB => {
                // Subnegotiation: scan for the closing IAC SE.
                let mut j = i + 2;
                let mut closed = false;
                while j < n {
                    if data[j] == IAC && j + 1 < n && data[j + 1] == SE {
                        j += 2;
                        closed = true;
                        break;
                    }
                    j += 1;
                }
                if !closed {
                    // No terminating IAC SE yet — carry the whole SB block over.
                    return i;
                }
                i = j;
            }
            _ => {
                // Other two-byte command (GA, NOP, DM, SE, etc.).
                i += 2;
            }
        }
    }
    n
}

/// Process incoming bytes: parse IAC sequences, build negotiation responses,
/// and return only the displayable data.
///
/// `residue` holds any incomplete IAC sequence carried over from the previous
/// read. It is prepended to `buf[..n]` before parsing, and on return contains
/// any new trailing incomplete sequence to carry into the next read. This makes
/// the parser correct across TCP read boundaries — IAC sequences that straddle
/// a boundary are reassembled rather than dropped or pushed literally.
fn process_telnet_bytes(buf: &[u8], n: usize, residue: &mut Vec<u8>) -> (Vec<u8>, Vec<u8>) {
    // Prepend carried-over residue, then process the combined stream.
    let data: Vec<u8> = if residue.is_empty() {
        buf[..n].to_vec()
    } else {
        let mut d = Vec::with_capacity(residue.len() + n);
        d.extend_from_slice(residue);
        d.extend_from_slice(&buf[..n]);
        d
    };
    residue.clear();

    // Split off any trailing incomplete sequence so we only parse complete data.
    let boundary = telnet_incomplete_tail(&data);
    if boundary < data.len() {
        residue.extend_from_slice(&data[boundary..]);
    }
    let data = &data[..boundary];
    let len = data.len();

    let mut filtered = Vec::with_capacity(len);
    let mut responses = Vec::new();
    let mut i = 0;

    while i < len {
        if data[i] == IAC && i + 1 < len {
            let cmd = data[i + 1];
            match cmd {
                WILL => {
                    let opt = data[i + 2];
                    // Accept ECHO and SGA; reject everything else
                    if opt == OPT_ECHO || opt == OPT_SGA {
                        responses.extend_from_slice(&[IAC, DO, opt]);
                    } else {
                        responses.extend_from_slice(&[IAC, DONT, opt]);
                    }
                    i += 3;
                }
                WONT => {
                    responses.extend_from_slice(&[IAC, DONT, data[i + 2]]);
                    i += 3;
                }
                DO => {
                    // We don't support any DO requests from server
                    responses.extend_from_slice(&[IAC, WONT, data[i + 2]]);
                    i += 3;
                }
                DONT => {
                    // Acknowledge, no response needed
                    i += 3;
                }
                SB => {
                    // Skip subnegotiation until IAC SE (guaranteed complete here).
                    i += 2;
                    while i < len {
                        if data[i] == IAC && i + 1 < len && data[i + 1] == SE {
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
            filtered.push(data[i]);
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
        // Per-session residue carries any IAC sequence that straddles a TCP
        // read boundary into the next read so it is reassembled, not corrupted.
        let mut residue: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf).await {
                Ok(0) => {
                    let _ = app_handle.emit(&format!("telnet-closed-{}", sid), ());
                    break;
                }
                Ok(n) => {
                    let (filtered, responses) = process_telnet_bytes(&buf, n, &mut residue);

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
async fn telnet_send_raw(
    state: tauri::State<'_, TelnetState>,
    sessionId: String,
    data: String,
) -> Result<(), String> {
    let writer = {
        let connections = state.0.lock().await;
        match connections.get(&sessionId) {
            Some(conn) => conn.writer.clone(),
            None => return Err("Not connected".to_string()),
        }
    };
    let mut w = writer.lock().await;
    w.write_all(data.as_bytes())
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

// ─── Serial Port Connection ─────────────────────────────────
#[derive(Serialize, Deserialize)]
pub struct SerialPortInfo {
    pub name: String,
    pub description: String,
}

struct SerialConnection {
    port: Arc<std::sync::Mutex<Box<dyn serialport::SerialPort>>>,
    read_task: tokio::task::JoinHandle<()>,
}

struct SerialState(Arc<Mutex<HashMap<String, SerialConnection>>>);

#[tauri::command]
fn serial_list_ports() -> Result<Vec<SerialPortInfo>, String> {
    let ports = serialport::available_ports()
        .map_err(|e| format!("Failed to list serial ports: {}", e))?;
    Ok(ports
        .into_iter()
        .map(|p| {
            let description = match &p.port_type {
                serialport::SerialPortType::UsbPort(info) => {
                    let product = info.product.as_deref().unwrap_or("USB Serial");
                    let manufacturer = info.manufacturer.as_deref().unwrap_or("");
                    if manufacturer.is_empty() {
                        product.to_string()
                    } else {
                        format!("{} ({})", product, manufacturer)
                    }
                }
                serialport::SerialPortType::BluetoothPort => "Bluetooth Serial".to_string(),
                serialport::SerialPortType::PciPort => "PCI Serial".to_string(),
                _ => "Serial Port".to_string(),
            };
            SerialPortInfo {
                name: p.port_name,
                description,
            }
        })
        .collect())
}

#[tauri::command]
#[allow(non_snake_case)]
async fn serial_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, SerialState>,
    sessionId: String,
    portName: String,
    baudRate: u32,
    dataBits: Option<u8>,
    parity: Option<String>,
    stopBits: Option<String>,
) -> Result<(), String> {
    let data_bits = match dataBits.unwrap_or(8) {
        5 => serialport::DataBits::Five,
        6 => serialport::DataBits::Six,
        7 => serialport::DataBits::Seven,
        _ => serialport::DataBits::Eight,
    };
    let parity_val = match parity.as_deref() {
        Some("odd") => serialport::Parity::Odd,
        Some("even") => serialport::Parity::Even,
        _ => serialport::Parity::None,
    };
    let stop_bits = match stopBits.as_deref() {
        Some("2") => serialport::StopBits::Two,
        _ => serialport::StopBits::One,
    };

    let port_name = portName.clone();
    let port = tokio::task::spawn_blocking(move || {
        serialport::new(&port_name, baudRate)
            .data_bits(data_bits)
            .parity(parity_val)
            .stop_bits(stop_bits)
            .flow_control(serialport::FlowControl::None)
            .timeout(std::time::Duration::from_millis(100))
            .open()
            .map_err(|e| format!("Failed to open {}: {}", port_name, e))
    })
    .await
    .map_err(|e| format!("Serial task failed: {}", e))?
    ?;

    let port = Arc::new(std::sync::Mutex::new(port));
    let read_port = port.clone();
    let sid = sessionId.clone();
    let app_handle = app.clone();

    let read_task = tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        loop {
            // Read in a blocking thread since serialport is synchronous
            let read_port_inner = read_port.clone();
            let result = tokio::task::spawn_blocking(move || {
                let mut port = read_port_inner.lock().unwrap();
                match port.read(&mut buf) {
                    Ok(n) if n > 0 => Ok(Some(buf[..n].to_vec())),
                    Ok(_) => Ok(None),
                    Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => Ok(None),
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(None),
                    Err(e) => Err(e.to_string()),
                }
            })
            .await;

            match result {
                Ok(Ok(Some(data))) => {
                    let text = String::from_utf8_lossy(&data).to_string();
                    let _ = app_handle.emit(&format!("serial-data-{}", sid), text);
                }
                Ok(Ok(None)) => {
                    // Timeout / no data — just loop
                    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                }
                Ok(Err(e)) => {
                    let _ = app_handle.emit(&format!("serial-error-{}", sid), e);
                    break;
                }
                Err(_) => break, // Task was cancelled
            }
        }
        let _ = app_handle.emit(&format!("serial-closed-{}", sid), ());
    });

    let mut connections = state.0.lock().await;
    if let Some(old) = connections.remove(&sessionId) {
        old.read_task.abort();
    }
    connections.insert(
        sessionId,
        SerialConnection {
            port,
            read_task,
        },
    );

    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
async fn serial_send(
    state: tauri::State<'_, SerialState>,
    sessionId: String,
    data: String,
    lineEnding: Option<String>,
) -> Result<(), String> {
    let port = {
        let connections = state.0.lock().await;
        match connections.get(&sessionId) {
            Some(conn) => conn.port.clone(),
            None => return Err("Not connected".to_string()),
        }
    };
    let ending = match lineEnding.as_deref() {
        Some("cr") => "\r",
        Some("lf") => "\n",
        _ => "\r\n",
    };
    let payload = format!("{}{}", data, ending);
    tokio::task::spawn_blocking(move || {
        let mut port = port.lock().unwrap();
        port.write_all(payload.as_bytes())
            .map_err(|e| format!("Send failed: {}", e))
    })
    .await
    .map_err(|e| format!("Send task failed: {}", e))?
}

#[tauri::command]
#[allow(non_snake_case)]
async fn serial_send_raw(
    state: tauri::State<'_, SerialState>,
    sessionId: String,
    data: String,
) -> Result<(), String> {
    let port = {
        let connections = state.0.lock().await;
        match connections.get(&sessionId) {
            Some(conn) => conn.port.clone(),
            None => return Err("Not connected".to_string()),
        }
    };
    tokio::task::spawn_blocking(move || {
        let mut port = port.lock().unwrap();
        port.write_all(data.as_bytes())
            .map_err(|e| format!("Send failed: {}", e))
    })
    .await
    .map_err(|e| format!("Send task failed: {}", e))?
}

#[tauri::command]
#[allow(non_snake_case)]
async fn serial_disconnect(
    state: tauri::State<'_, SerialState>,
    sessionId: String,
) -> Result<(), String> {
    let mut connections = state.0.lock().await;
    if let Some(conn) = connections.remove(&sessionId) {
        conn.read_task.abort();
        // Port is dropped when Arc refcount reaches 0
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

// ─── HTTPS Proxy for BAS Controllers ────────────────────────
// Many BAS controllers (Siemens PXC, Tridium Niagara, Honeywell, etc.) serve
// their web UI over HTTPS with self-signed certificates. Browsers block these
// in iframes with no way to accept the cert. This command proxies requests
// through the Rust backend using reqwest with cert validation disabled,
// allowing the frontend to embed controller UIs seamlessly.

#[derive(Serialize, Deserialize)]
pub struct ProxyResponse {
    pub status: u16,
    pub content_type: String,
    pub body: String,
    pub is_binary: bool,
}

/// Check if a host is on a private/local network (safe to proxy without cert validation).
///
/// SECURITY: We parse the host into a real `IpAddr` and only accept literal
/// private/loopback/link-local addresses. Hostnames (including deceptive ones
/// like `10.attacker.example` or `127.evil.tld`) are rejected outright — no DNS
/// names are accepted, since they could resolve to public/attacker-controlled IPs.
fn is_private_network(host: &str) -> bool {
    // reqwest's host_str() leaves IPv6 literals wrapped in brackets, e.g. "[::1]".
    let host = host.strip_prefix('[').and_then(|h| h.strip_suffix(']')).unwrap_or(host);

    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(v4)) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
        Ok(IpAddr::V6(v6)) => {
            // Loopback (::1), link-local (fe80::/10), or unique-local (fc00::/7).
            v6.is_loopback()
                || (v6.segments()[0] & 0xffc0) == 0xfe80
                || (v6.segments()[0] & 0xfe00) == 0xfc00
        }
        // Not a literal IP address (i.e. a hostname) → reject.
        Err(_) => false,
    }
}

#[tauri::command]
async fn proxy_fetch(url: String, allow_invalid_certs: Option<bool>) -> Result<ProxyResponse, String> {
    // Parse URL to validate and extract host
    let parsed = reqwest::Url::parse(&url)
        .map_err(|e| format!("Invalid URL: {}", e))?;

    let host = parsed.host_str().unwrap_or("");

    // Only allow proxying to private network addresses (security boundary)
    if !is_private_network(host) {
        return Err("Proxy only available for private network addresses (10.x, 172.16-31.x, 192.168.x, localhost)".to_string());
    }

    // SECURITY:
    //  - Cert validation is ON by default; callers must explicitly opt in to
    //    accepting self-signed certs per request (field BAS controllers).
    //  - Redirects are disabled (Policy::none) to prevent the proxy being used
    //    as an SSRF redirect pivot off the private-network allowlist.
    let allow_invalid_certs = allow_invalid_certs.unwrap_or(false);
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(allow_invalid_certs)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("text/html")
        .to_string();

    // For HTML content, return as string. For binary, base64 encode.
    let is_text = content_type.contains("text") || content_type.contains("json")
        || content_type.contains("xml") || content_type.contains("javascript")
        || content_type.contains("css") || content_type.contains("svg");

    if is_text {
        let body = response.text().await
            .map_err(|e| format!("Failed to read response: {}", e))?;
        Ok(ProxyResponse {
            status,
            content_type,
            body,
            is_binary: false,
        })
    } else {
        let bytes = response.bytes().await
            .map_err(|e| format!("Failed to read response: {}", e))?;
        use serde::ser::Error;
        let base64 = base64_encode(&bytes);
        Ok(ProxyResponse {
            status,
            content_type,
            body: base64,
            is_binary: true,
        })
    }
}

/// Simple base64 encoding (no external dep needed)
fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[(n >> 18 & 63) as usize] as char);
        result.push(CHARS[(n >> 12 & 63) as usize] as char);
        if chunk.len() > 1 { result.push(CHARS[(n >> 6 & 63) as usize] as char); } else { result.push('='); }
        if chunk.len() > 2 { result.push(CHARS[(n & 63) as usize] as char); } else { result.push('='); }
    }
    result
}

// ─── Tauri App ──────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TelnetState(Arc::new(Mutex::new(HashMap::new()))))
        .manage(SerialState(Arc::new(Mutex::new(HashMap::new()))))
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
            telnet_send_raw,
            telnet_disconnect,
            serial_list_ports,
            serial_connect,
            serial_send,
            serial_send_raw,
            serial_disconnect,
            proxy_fetch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Feed an entire byte stream in a single call (baseline / "all at once").
    fn process_whole(stream: &[u8]) -> (Vec<u8>, Vec<u8>) {
        let mut residue = Vec::new();
        let (filtered, responses) = process_telnet_bytes(stream, stream.len(), &mut residue);
        // A well-formed complete stream must leave no residue.
        assert!(residue.is_empty(), "unexpected leftover residue: {:?}", residue);
        (filtered, responses)
    }

    /// Feed the same byte stream one byte per call, threading residue across
    /// calls exactly like the read loop does. Reassembled output and
    /// negotiation responses MUST match the all-at-once result.
    fn process_byte_at_a_time(stream: &[u8]) -> (Vec<u8>, Vec<u8>) {
        let mut residue = Vec::new();
        let mut filtered_all = Vec::new();
        let mut responses_all = Vec::new();
        for &b in stream {
            let one = [b];
            let (f, r) = process_telnet_bytes(&one, 1, &mut residue);
            filtered_all.extend_from_slice(&f);
            responses_all.extend_from_slice(&r);
        }
        // After the final byte the stream is complete; nothing should be left.
        assert!(residue.is_empty(), "residue not flushed: {:?}", residue);
        (filtered_all, responses_all)
    }

    fn assert_straddle_equivalent(stream: &[u8]) {
        let whole = process_whole(stream);
        let drip = process_byte_at_a_time(stream);
        assert_eq!(
            whole, drip,
            "byte-at-a-time parse diverged from all-at-once for stream {:?}",
            stream
        );
    }

    #[test]
    fn iac_do_straddles_boundary() {
        // IAC DO <opt=99> -> we reject unsupported DO with IAC WONT <opt>.
        let stream = [IAC, DO, 99u8];
        let (filtered, responses) = process_whole(&stream);
        assert!(filtered.is_empty());
        assert_eq!(responses, vec![IAC, WONT, 99u8]);
        assert_straddle_equivalent(&stream);
    }

    #[test]
    fn iac_will_negotiation_straddles() {
        // IAC WILL ECHO -> IAC DO ECHO ; IAC WILL <unsupported> -> IAC DONT.
        let stream = [IAC, WILL, OPT_ECHO, IAC, WILL, 77u8];
        let (filtered, responses) = process_whole(&stream);
        assert!(filtered.is_empty());
        assert_eq!(responses, vec![IAC, DO, OPT_ECHO, IAC, DONT, 77u8]);
        assert_straddle_equivalent(&stream);
    }

    #[test]
    fn subnegotiation_block_straddles() {
        // Data, then IAC SB <opt> <payload...> IAC SE, then more data.
        // Payload deliberately contains a lone 0xF0 (SE) that is NOT preceded
        // by IAC, to ensure only IAC SE terminates the block.
        let stream = [
            b'A', b'B',
            IAC, SB, 24u8, b'x', SE, b'y', IAC, SE,
            b'C', b'D',
        ];
        let (filtered, responses) = process_whole(&stream);
        assert_eq!(filtered, vec![b'A', b'B', b'C', b'D']);
        assert!(responses.is_empty());
        assert_straddle_equivalent(&stream);
    }

    #[test]
    fn escaped_iac_iac_is_literal_ff() {
        // IAC IAC is an escaped literal 0xFF; the second 0xFF must NOT start a
        // new command. Surround with data and a real command.
        let stream = [
            b'h', b'i',
            IAC, IAC,            // -> single 0xFF in output
            b'!',
            IAC, DO, OPT_SGA,    // -> IAC WONT SGA (server DO is rejected)
        ];
        let (filtered, responses) = process_whole(&stream);
        assert_eq!(filtered, vec![b'h', b'i', 0xFF, b'!']);
        assert_eq!(responses, vec![IAC, WONT, OPT_SGA]);
        assert_straddle_equivalent(&stream);
    }

    #[test]
    fn mixed_stream_byte_at_a_time_matches() {
        // A realistic mixed stream exercising every branch together, fed one
        // byte at a time across many calls — the core straddle regression.
        let stream = [
            b'l', b'o', b'g', b'i', b'n', b':', b' ',
            IAC, WILL, OPT_ECHO,           // -> IAC DO ECHO
            IAC, DO, OPT_SGA,              // -> IAC WONT SGA
            IAC, IAC,                      // -> literal 0xFF
            IAC, SB, 1u8, 2u8, 3u8, IAC, SE, // subnegotiation, no output
            b'd', b'o', b'n', b'e',
            IAC, DONT, OPT_ECHO,          // ack, no response
            b'\r', b'\n',
        ];
        assert_straddle_equivalent(&stream);

        // Spot-check the concrete expectation as well.
        let (filtered, responses) = process_whole(&stream);
        assert_eq!(filtered, b"login: \xffdone\r\n");
        assert_eq!(responses, vec![IAC, DO, OPT_ECHO, IAC, WONT, OPT_SGA]);
    }

    #[test]
    fn bare_trailing_iac_carries_over() {
        // A read ending on a lone IAC must stash it, not emit it literally.
        let mut residue = Vec::new();
        let first = [b'x', IAC];
        let (filtered, responses) = process_telnet_bytes(&first, first.len(), &mut residue);
        assert_eq!(filtered, vec![b'x']);
        assert!(responses.is_empty());
        assert_eq!(residue, vec![IAC]); // carried over, NOT pushed as 0xFF

        // Next read completes it as IAC NOP (no option, no output, no response).
        let second = [241u8 /* NOP */, b'y'];
        let (filtered, responses) = process_telnet_bytes(&second, second.len(), &mut residue);
        assert_eq!(filtered, vec![b'y']);
        assert!(responses.is_empty());
        assert!(residue.is_empty());
    }
}
