#!/usr/bin/env python3
"""
OpenClaw Plus Python Client with WebSocket Support
Full REST + WebSocket client for game engines and applications.
"""

import json
import threading
import urllib.request
import urllib.error
from typing import Optional, Dict, Any, List, Callable
import time

try:
    import websocket

    WEBSOCKET_AVAILABLE = True
except ImportError:
    WEBSOCKET_AVAILABLE = False


class OpenClawClient:
    def __init__(
        self, base_url: str = "http://localhost:8787", token: Optional[str] = None
    ):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.headers = {"Content-Type": "application/json"}
        if token:
            self.headers["Authorization"] = f"Bearer {token}"

        self._ws = None
        self._ws_thread = None
        self._ws_connected = False
        self._ws_callbacks: Dict[str, List[Callable]] = {
            "hello": [],
            "init": [],
            "progress": [],
            "done": [],
            "error": [],
            "pong": [],
        }

    def _request(self, method: str, path: str, data: Optional[dict] = None) -> dict:
        url = f"{self.base_url}{path}"
        body = json.dumps(data).encode() if data else None
        req = urllib.request.Request(
            url, data=body, headers=self.headers, method=method
        )

        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as e:
            error_body = e.read().decode() if e.fp else ""
            raise Exception(f"HTTP {e.code}: {error_body}")

    # ============ REST API ============

    def health(self) -> dict:
        return self._request("GET", "/api/health")

    def get_models(self) -> List[dict]:
        return self._request("GET", "/api/models").get("models", [])

    def get_skills(self) -> List[dict]:
        return self._request("GET", "/api/skills").get("skills", [])

    def get_hooks(self) -> List[dict]:
        return self._request("GET", "/api/hooks").get("hooks", [])

    def get_sessions(self) -> List[dict]:
        return self._request("GET", "/api/sessions").get("sessions", [])

    def get_session(self, session_id: str) -> dict:
        return self._request("GET", f"/api/sessions/{session_id}")

    def create_session(self, title: str, settings: Optional[dict] = None) -> dict:
        return self._request(
            "POST", "/api/sessions", {"title": title, "settings": settings}
        )

    def run(
        self,
        model_id: str,
        objective: str,
        session_id: Optional[str] = None,
        enabled_skill_ids: Optional[List[str]] = None,
        settings: Optional[dict] = None,
    ) -> dict:
        data = {
            "modelId": model_id,
            "objective": objective,
            "sessionId": session_id,
            "enabledSkillIds": enabled_skill_ids,
            "settings": settings,
        }
        return self._request("POST", "/api/run", data)

    def run_stream(
        self,
        model_id: str,
        objective: str,
        on_event: Callable[[dict], None],
        session_id: Optional[str] = None,
        enabled_skill_ids: Optional[List[str]] = None,
        settings: Optional[dict] = None,
        timeout_ms: int = 120000,
    ) -> dict:
        import http.client
        from urllib.parse import urlparse

        url = f"{self.base_url}/api/run/stream"
        parsed = urlparse(url)

        data = {
            "modelId": model_id,
            "objective": objective,
            "sessionId": session_id,
            "enabledSkillIds": enabled_skill_ids,
            "settings": settings,
        }

        body = json.dumps(data).encode()
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        if parsed.scheme == "https":
            conn = http.client.HTTPSConnection(
                parsed.netloc, timeout=timeout_ms // 1000
            )
        else:
            conn = http.client.HTTPConnection(parsed.netloc, timeout=timeout_ms // 1000)

        conn.request("POST", parsed.path, body, headers)
        response = conn.getresponse()

        final_result = None
        buffer = ""

        while True:
            chunk = response.read(1024).decode()
            if not chunk:
                break

            buffer += chunk
            lines = buffer.split("\n")
            buffer = lines.pop()

            for line in lines:
                if line.startswith("data: "):
                    try:
                        event_data = json.loads(line[6:])
                        if on_event:
                            on_event(event_data)
                        if event_data.get("type") == "done":
                            final_result = event_data
                    except json.JSONDecodeError:
                        pass

        conn.close()
        return final_result or {}

    def invoke_skill(self, skill_id: str, input_data: dict) -> dict:
        return self._request("POST", f"/api/skills/{skill_id}/invoke", input_data)

    # ============ Convenience Methods ============

    def shell_execute(
        self, command: str, cwd: Optional[str] = None, timeout: int = 60000
    ) -> dict:
        return self.invoke_skill(
            "shell_execute", {"command": command, "cwd": cwd, "timeout": timeout}
        )

    def powershell(
        self, command: str, elevated: bool = False, timeout: int = 60000
    ) -> dict:
        return self.invoke_skill(
            "windows_powershell",
            {"command": command, "elevated": elevated, "timeout": timeout},
        )

    def get_system_info(self, detail: str = "basic") -> dict:
        return self.invoke_skill("system_info", {"detail": detail})

    def list_processes(self) -> dict:
        return self.invoke_skill("process_control", {"action": "list"})

    def kill_process(self, target: str) -> dict:
        return self.invoke_skill(
            "process_control", {"action": "kill", "target": target}
        )

    def list_services(self) -> dict:
        return self.invoke_skill("windows_services", {"action": "list"})

    def start_service(self, name: str) -> dict:
        return self.invoke_skill("windows_services", {"action": "start", "name": name})

    def stop_service(self, name: str) -> dict:
        return self.invoke_skill("windows_services", {"action": "stop", "name": name})

    def search_packages(self, package: str) -> dict:
        return self.invoke_skill(
            "windows_winget", {"action": "search", "package": package}
        )

    def install_package(self, package: str, force: bool = False) -> dict:
        return self.invoke_skill(
            "windows_winget",
            {
                "action": "install",
                "package": package,
                "acceptPackageAgreements": True,
                "force": force,
            },
        )

    def read_file(self, path: str) -> dict:
        return self.invoke_skill("workspace_files", {"action": "read", "target": path})

    def write_file(self, path: str, content: str) -> dict:
        return self.invoke_skill(
            "workspace_files", {"action": "write", "target": path, "content": content}
        )

    def list_directory(self, path: str) -> dict:
        return self.invoke_skill("workspace_files", {"action": "list", "target": path})

    def get_network_adapters(self) -> dict:
        return self.invoke_skill("windows_network", {"action": "adapters"})

    def ping(self, host: str) -> dict:
        return self.invoke_skill("windows_network", {"action": "ping", "target": host})

    def get_event_logs(self, log: str = "Application", count: int = 20) -> dict:
        return self.invoke_skill(
            "windows_eventlog", {"action": "read", "log": log, "count": count}
        )

    def list_scheduled_tasks(self) -> dict:
        return self.invoke_skill("windows_tasks", {"action": "list"})

    def run_scheduled_task(self, path: str) -> dict:
        return self.invoke_skill("windows_tasks", {"action": "run", "path": path})

    # ============ WebSocket API ============

    def ws_connect(
        self,
        on_connect: Optional[Callable[[], None]] = None,
        on_disconnect: Optional[Callable[[], None]] = None,
    ) -> bool:
        if not WEBSOCKET_AVAILABLE:
            raise ImportError(
                "websocket-client not installed. Run: pip install websocket-client"
            )

        ws_url = (
            self.base_url.replace("http://", "ws://").replace("https://", "wss://")
            + "/ws"
        )
        if self.token:
            ws_url += f"?token={self.token}"

        def on_message(ws, message):
            try:
                data = json.loads(message)
                msg_type = data.get("type")
                if msg_type and msg_type in self._ws_callbacks:
                    for callback in self._ws_callbacks[msg_type]:
                        callback(data.get("payload", data))
            except json.JSONDecodeError:
                pass

        def on_error(ws, error):
            for callback in self._ws_callbacks.get("error", []):
                callback({"error": str(error)})

        def on_open(ws):
            self._ws_connected = True
            if on_connect:
                on_connect()

        def on_close(ws, close_status_code, close_msg):
            self._ws_connected = False
            if on_disconnect:
                on_disconnect()

        self._ws = websocket.WebSocketApp(
            ws_url,
            on_message=on_message,
            on_error=on_error,
            on_open=on_open,
            on_close=on_close,
        )

        self._ws_thread = threading.Thread(target=self._ws.run_forever, daemon=True)
        self._ws_thread.start()

        for _ in range(50):
            if self._ws_connected:
                return True
            time.sleep(0.1)

        return False

    def ws_disconnect(self):
        if self._ws:
            self._ws.close()
            self._ws = None
            self._ws_connected = False

    def ws_is_connected(self) -> bool:
        return self._ws_connected

    def ws_on(self, event_type: str, callback: Callable[[dict], None]):
        if event_type in self._ws_callbacks:
            self._ws_callbacks[event_type].append(callback)

    def ws_off(self, event_type: str, callback: Callable[[dict], None]):
        if event_type in self._ws_callbacks:
            if callback in self._ws_callbacks[event_type]:
                self._ws_callbacks[event_type].remove(callback)

    def ws_send(self, message_type: str, payload: dict = None):
        if not self._ws or not self._ws_connected:
            raise ConnectionError("WebSocket not connected")

        msg = {"type": message_type}
        if payload:
            msg.update(payload)

        self._ws.send(json.dumps(msg))

    def ws_init(self) -> None:
        self.ws_send("init")

    def ws_ping(self) -> None:
        self.ws_send("ping")

    def ws_run(
        self,
        model_id: str,
        objective: str,
        session_id: Optional[str] = None,
        enabled_skill_ids: Optional[List[str]] = None,
        settings: Optional[dict] = None,
    ):
        self.ws_send(
            "run",
            {
                "modelId": model_id,
                "objective": objective,
                "sessionId": session_id,
                "enabledSkillIds": enabled_skill_ids,
                "settings": settings,
            },
        )

    def ws_run_with_callback(
        self,
        model_id: str,
        objective: str,
        on_progress: Optional[Callable[[dict], None]] = None,
        on_done: Optional[Callable[[dict], None]] = None,
        session_id: Optional[str] = None,
        enabled_skill_ids: Optional[List[str]] = None,
        settings: Optional[dict] = None,
        timeout_ms: int = 120000,
    ) -> threading.Event:
        done_event = threading.Event()
        final_result = {"result": None}

        def on_progress_wrapper(data):
            if on_progress:
                on_progress(data)

        def on_done_wrapper(data):
            final_result["result"] = data
            done_event.set()
            if on_done:
                on_done(data)

        self.ws_on("progress", on_progress_wrapper)
        self.ws_on("done", on_done_wrapper)

        self.ws_run(model_id, objective, session_id, enabled_skill_ids, settings)

        def timeout_handler():
            time.sleep(timeout_ms / 1000)
            if not done_event.is_set():
                done_event.set()

        threading.Thread(target=timeout_handler, daemon=True).start()

        return done_event


if __name__ == "__main__":
    print("Testing OpenClaw REST API...")
    client = OpenClawClient()

    print("Health:", client.health())
    print("Models:", [m["id"] for m in client.get_models()])
    print("Skills:", [s["id"] for s in client.get_skills()])

    print("\nSystem Info:")
    info = client.get_system_info()
    if info.get("ok"):
        result = info.get("result", {})
        print(f"  Hostname: {result.get('hostname')}")
        print(f"  CPU: {result.get('cpu', {}).get('count')} cores")
        print(f"  Memory: {result.get('memory', {}).get('total', 0) // (1024**3)} GB")

    if WEBSOCKET_AVAILABLE:
        print("\nTesting WebSocket...")

        def on_hello(data):
            print(f"  Connected! Client ID: {data.get('clientId')}")

        def on_progress(data):
            print(f"  Progress: {data.get('type')}")

        def on_done(data):
            print(f"  Done: {data.get('done')}")

        client.ws_on("hello", on_hello)
        client.ws_on("progress", on_progress)
        client.ws_on("done", on_done)

        if client.ws_connect():
            print("  WebSocket connected")
            time.sleep(1)
            client.ws_disconnect()
            print("  WebSocket disconnected")
    else:
        print("\nWebSocket not available (install websocket-client)")
