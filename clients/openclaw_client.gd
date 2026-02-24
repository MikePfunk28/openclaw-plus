# OpenClaw Plus Godot 4.x Client with WebSocket Support
# Add this as an autoload script for easy access

extends Node

signal ws_connected()
signal ws_disconnected()
signal ws_hello(data)
signal ws_init(data)
signal ws_progress(data)
signal ws_done(data)
signal ws_error(data)

var base_url: String = "http://localhost:8787"
var auth_token: String = ""

var _ws: WebSocketPeer = null
var _ws_connected: bool = false
var _http_requests: Dictionary = {}

func _ready():
    pass

func _process(_delta):
    if _ws and _ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
        _ws.poll()
        while _ws.get_available_packet_count() > 0:
            var packet = _ws.get_packet()
            var json = packet.get_string_from_utf8()
            _process_ws_message(json)

func set_config(url: String, token: String = ""):
    base_url = url.rstrip("/")
    auth_token = token

# ============ REST API ============

func _make_request(method: String, path: String, body: Dictionary = {}) -> Dictionary:
    var http = HTTPRequest.new()
    var request_id = str(randi())
    add_child(http)
    
    var url = base_url + path
    var headers = ["Content-Type: application/json"]
    
    if auth_token != "":
        headers.append("Authorization: Bearer " + auth_token)
    
    var json_body = ""
    if not body.is_empty():
        json_body = JSON.stringify(body)
    
    var error = OK
    if method == "GET":
        error = http.request(url, headers, HTTPClient.METHOD_GET)
    elif method == "POST":
        error = http.request(url, headers, HTTPClient.METHOD_POST, json_body)
    
    if error != OK:
        http.queue_free()
        return {"error": "Request failed", "code": error}
    
    var response = await http.request_completed
    http.queue_free()
    
    var result = response[0]
    var response_code = response[1]
    var response_body = response[3].get_string_from_utf8()
    
    if response_code >= 400:
        return {"error": "HTTP " + str(response_code), "body": response_body}
    
    var json = JSON.new()
    if json.parse(response_body) == OK:
        return json.data
    return {"raw": response_body}

func health() -> Dictionary:
    return await _make_request("GET", "/api/health")

func get_models() -> Array:
    var result = await _make_request("GET", "/api/models")
    return result.get("models", [])

func get_skills() -> Array:
    var result = await _make_request("GET", "/api/skills")
    return result.get("skills", [])

func get_hooks() -> Array:
    var result = await _make_request("GET", "/api/hooks")
    return result.get("hooks", [])

func get_sessions() -> Array:
    var result = await _make_request("GET", "/api/sessions")
    return result.get("sessions", [])

func create_session(title: String, settings: Dictionary = {}) -> Dictionary:
    return await _make_request("POST", "/api/sessions", {"title": title, "settings": settings})

func run_task(model_id: String, objective: String, session_id: String = "", skills: Array = [], settings: Dictionary = {}) -> Dictionary:
    var body = {
        "modelId": model_id,
        "objective": objective
    }
    if session_id != "":
        body["sessionId"] = session_id
    if skills.size() > 0:
        body["enabledSkillIds"] = skills
    if not settings.is_empty():
        body["settings"] = settings
    return await _make_request("POST", "/api/run", body)

func invoke_skill(skill_id: String, input_data: Dictionary) -> Dictionary:
    return await _make_request("POST", "/api/skills/" + skill_id + "/invoke", input_data)

# ============ Convenience Methods ============

func shell_execute(command: String, cwd: String = "", timeout: int = 60000) -> Dictionary:
    var input_data = {"command": command, "timeout": timeout}
    if cwd != "":
        input_data["cwd"] = cwd
    return await invoke_skill("shell_execute", input_data)

func powershell(command: String, elevated: bool = false, timeout: int = 60000) -> Dictionary:
    return await invoke_skill("windows_powershell", {
        "command": command,
        "elevated": elevated,
        "timeout": timeout
    })

func get_system_info(detail: String = "basic") -> Dictionary:
    return await invoke_skill("system_info", {"detail": detail})

func list_processes() -> Dictionary:
    return await invoke_skill("process_control", {"action": "list"})

func kill_process(target: String) -> Dictionary:
    return await invoke_skill("process_control", {"action": "kill", "target": target})

func list_services() -> Dictionary:
    return await invoke_skill("windows_services", {"action": "list"})

func start_service(name: String) -> Dictionary:
    return await invoke_skill("windows_services", {"action": "start", "name": name})

func stop_service(name: String) -> Dictionary:
    return await invoke_skill("windows_services", {"action": "stop", "name": name})

func search_package(package_name: String) -> Dictionary:
    return await invoke_skill("windows_winget", {"action": "search", "package": package_name})

func install_package(package_name: String) -> Dictionary:
    return await invoke_skill("windows_winget", {
        "action": "install",
        "package": package_name,
        "acceptPackageAgreements": true
    })

func read_file(path: String) -> Dictionary:
    return await invoke_skill("workspace_files", {"action": "read", "target": path})

func write_file(path: String, content: String) -> Dictionary:
    return await invoke_skill("workspace_files", {"action": "write", "target": path, "content": content})

func list_directory(path: String) -> Dictionary:
    return await invoke_skill("workspace_files", {"action": "list", "target": path})

func get_network_adapters() -> Dictionary:
    return await invoke_skill("windows_network", {"action": "adapters"})

func ping_host(host: String) -> Dictionary:
    return await invoke_skill("windows_network", {"action": "ping", "target": host})

func get_event_logs(log_name: String = "Application", count: int = 20) -> Dictionary:
    return await invoke_skill("windows_eventlog", {"action": "read", "log": log_name, "count": count})

func list_scheduled_tasks() -> Dictionary:
    return await invoke_skill("windows_tasks", {"action": "list"})

func run_scheduled_task(task_path: String) -> Dictionary:
    return await invoke_skill("windows_tasks", {"action": "run", "path": task_path})

# ============ WebSocket API ============

func ws_connect() -> bool:
    if _ws_connected:
        return true
    
    _ws = WebSocketPeer.new()
    var ws_url = base_url.replace("http://", "ws://").replace("https://", "wss://") + "/ws"
    
    if auth_token != "":
        ws_url += "?token=" + auth_token
    
    var err = _ws.connect_to_url(ws_url)
    if err != OK:
        _ws = null
        return false
    
    # Wait for connection
    var timeout = Time.get_ticks_msec() + 5000
    while Time.get_ticks_msec() < timeout:
        _ws.poll()
        var state = _ws.get_ready_state()
        if state == WebSocketPeer.STATE_OPEN:
            _ws_connected = true
            ws_connected.emit()
            return true
        elif state == WebSocketPeer.STATE_CLOSED:
            _ws = null
            return false
        await get_tree().process_frame
    
    _ws = null
    return false

func ws_disconnect():
    if _ws:
        _ws.close()
        _ws = null
        _ws_connected = false
        ws_disconnected.emit()

func ws_is_connected() -> bool:
    return _ws_connected

func ws_send(type: String, payload: Dictionary = {}) -> bool:
    if not _ws_connected or not _ws:
        return false
    
    var msg = {"type": type}
    for key in payload:
        msg[key] = payload[key]
    
    var json = JSON.stringify(msg)
    _ws.send_text(json)
    return true

func ws_init():
    ws_send("init")

func ws_ping():
    ws_send("ping")

func ws_run(model_id: String, objective: String, session_id: String = "", 
            enabled_skills: Array = [], settings: Dictionary = {}):
    ws_send("run", {
        "modelId": model_id,
        "objective": objective,
        "sessionId": session_id if session_id != "" else null,
        "enabledSkillIds": enabled_skills if enabled_skills.size() > 0 else null,
        "settings": settings if not settings.is_empty() else null
    })

func ws_run_async(model_id: String, objective: String, session_id: String = "",
                   enabled_skills: Array = [], settings: Dictionary = {},
                   timeout_ms: int = 120000) -> Dictionary:
    var result = {}
    var done = false
    
    var progress_handler = func(data):
        pass
    
    var done_handler = func(data):
        result = data
        done = true
    
    ws_progress.connect(progress_handler)
    ws_done.connect(done_handler)
    
    ws_run(model_id, objective, session_id, enabled_skills, settings)
    
    var timeout = Time.get_ticks_msec() + timeout_ms
    while not done and Time.get_ticks_msec() < timeout:
        await get_tree().process_frame
    
    ws_progress.disconnect(progress_handler)
    ws_done.disconnect(done_handler)
    
    return result

func _process_ws_message(json_string: String):
    var json = JSON.new()
    if json.parse(json_string) != OK:
        return
	
	var data = json.data
    if not data is Dictionary:
        return
    
    var type = data.get("type", "")
    var payload = data.get("payload", data)
    
    match type:
        "hello":
            ws_hello.emit(payload)
        "init":
            ws_init.emit(payload)
        "progress":
            ws_progress.emit(payload)
        "done":
            ws_done.emit(payload)
        "error":
            ws_error.emit(payload)
        "pong":
            pass
