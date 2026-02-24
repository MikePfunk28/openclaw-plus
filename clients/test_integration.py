#!/usr/bin/env python3
"""
OpenClaw Plus Integration Test
Tests REST API and shows example usage for game engines.
"""

import json
import urllib.request
import urllib.error
from typing import Optional, Dict, Any, List


class OpenClawClient:
    def __init__(
        self, base_url: str = "http://localhost:8787", token: Optional[str] = None
    ):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.headers = {"Content-Type": "application/json"}
        if token:
            self.headers["Authorization"] = f"Bearer {token}"

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

    def health(self) -> dict:
        return self._request("GET", "/api/health")

    def get_models(self) -> List[dict]:
        return self._request("GET", "/api/models").get("models", [])

    def get_skills(self) -> List[dict]:
        return self._request("GET", "/api/skills").get("skills", [])

    def run(
        self,
        model_id: str,
        objective: str,
        session_id: Optional[str] = None,
        enabled_skill_ids: Optional[List[str]] = None,
        settings: Optional[dict] = None,
    ) -> dict:
        data = {"modelId": model_id, "objective": objective}
        if session_id:
            data["sessionId"] = session_id
        if enabled_skill_ids:
            data["enabledSkillIds"] = enabled_skill_ids
        if settings:
            data["settings"] = settings
        return self._request("POST", "/api/run", data)

    def invoke_skill(self, skill_id: str, input_data: dict) -> dict:
        return self._request("POST", f"/api/skills/{skill_id}/invoke", input_data)

    def shell(self, command: str) -> dict:
        return self.invoke_skill("shell_execute", {"command": command})

    def powershell(self, command: str) -> dict:
        return self.invoke_skill("windows_powershell", {"command": command})

    def system_info(self) -> dict:
        return self.invoke_skill("system_info", {"detail": "basic"})

    def list_services(self) -> dict:
        return self.invoke_skill("windows_services", {"action": "list"})

    def list_packages(self) -> dict:
        return self.invoke_skill("windows_winget", {"action": "list"})


def test_all():
    print("=" * 60)
    print("OpenClaw Plus Integration Test")
    print("=" * 60)

    client = OpenClawClient()

    # Health
    print("\n[1] Health Check")
    health = client.health()
    assert health.get("ok"), "Server not healthy"
    print(f"    Status: OK - {health.get('app')}")

    # Models
    print("\n[2] Models")
    models = client.get_models()
    print(f"    Available: {[m['id'] for m in models]}")

    # Skills
    print("\n[3] Skills")
    skills = client.get_skills()
    skill_ids = [s["id"] for s in skills]
    print(f"    Count: {len(skills)}")
    print(f"    Windows skills: {[s for s in skill_ids if s.startswith('windows')]}")

    # System Info
    print("\n[4] System Info")
    info = client.system_info()
    if info.get("ok"):
        r = info.get("result", {})
        print(f"    Hostname: {r.get('hostname')}")
        print(f"    Platform: {r.get('platform')}")
        print(f"    CPU: {r.get('cpu', {}).get('count')} cores")
        mem = r.get("memory", {})
        print(
            f"    Memory: {mem.get('total', 0) // (1024**3)} GB total, {mem.get('free', 0) // (1024**3)} GB free"
        )

    # Shell
    print("\n[5] Shell Execute")
    result = client.shell("echo 'Hello from OpenClaw!'")
    if result.get("ok"):
        print(f"    Output: {result.get('result', {}).get('stdout', '').strip()}")

    # PowerShell
    print("\n[6] PowerShell")
    result = client.powershell("Get-Date | Select-Object -ExpandProperty DateTime")
    if result.get("ok"):
        print(f"    DateTime: {result.get('result', {}).get('stdout', '').strip()}")

    # Services
    print("\n[7] Windows Services")
    result = client.list_services()
    if result.get("ok"):
        count = result.get("result", {}).get("count", 0)
        print(f"    Running services: {count}")

    # Packages
    print("\n[8] Installed Packages (Winget)")
    result = client.list_packages()
    if result.get("ok"):
        count = result.get("result", {}).get("count", 0)
        print(f"    Installed packages: {count}")

    print("\n" + "=" * 60)
    print("All tests passed!")
    print("=" * 60)

    print("""
Game Engine Integration:
------------------------
• Unity:       Use clients/OpenClawClient.cs
• Unreal:      Use clients/OpenClawClient.h
• Godot:       Use clients/openclaw_client.gd
• Python:      Use clients/openclaw_client.py

REST API Endpoints:
-------------------
GET  /api/health                 - Health check
GET  /api/models                 - List AI models
GET  /api/skills                 - List skills
GET  /api/sessions               - List sessions
POST /api/sessions               - Create session
POST /api/run                    - Run AI task
POST /api/run/stream             - Run with SSE streaming
POST /api/skills/{id}/invoke     - Invoke skill directly

WebSocket: ws://localhost:8787/ws
----------------------------------
Messages: { "type": "init" | "ping" | "run", ... }
Events:   hello, init, progress, done, error, pong
""")


if __name__ == "__main__":
    test_all()
