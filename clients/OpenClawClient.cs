using System;
using System.Collections.Concurrent;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Net.WebSockets;
using System.Collections.Generic;

namespace OpenClawClient
{
    public class OpenClawClient : IDisposable
    {
        private readonly HttpClient _http;
        private readonly string _baseUrl;
        private readonly string _token;
        
        private ClientWebSocket _ws;
        private CancellationTokenSource _wsCts;
        private readonly ConcurrentDictionary<string, List<Action<object>>> _wsCallbacks = new();
        private readonly BlockingCollection<object> _wsMessageQueue = new();
        private bool _wsConnected;

        public bool IsWsConnected => _wsConnected;

        public OpenClawClient(string baseUrl = "http://localhost:8787", string token = null)
        {
            _baseUrl = baseUrl.TrimEnd('/');
            _token = token;
            _http = new HttpClient();
            
            if (!string.IsNullOrEmpty(_token))
            {
                _http.DefaultRequestHeaders.Add("Authorization", $"Bearer {_token}");
            }
            
            InitCallbacks();
        }

        private void InitCallbacks()
        {
            foreach (var type in new[] { "hello", "init", "progress", "done", "error", "pong" })
            {
                _wsCallbacks[type] = new List<Action<object>>();
            }
        }

        // ============ REST API ============

        public async Task<HealthResponse> GetHealthAsync()
        {
            return await GetAsync<HealthResponse>("/api/health");
        }

        public async Task<ModelsResponse> GetModelsAsync()
        {
            return await GetAsync<ModelsResponse>("/api/models");
        }

        public async Task<SkillsResponse> GetSkillsAsync()
        {
            return await GetAsync<SkillsResponse>("/api/skills");
        }

        public async Task<HooksResponse> GetHooksAsync()
        {
            return await GetAsync<HooksResponse>("/api/hooks");
        }

        public async Task<SessionsResponse> GetSessionsAsync()
        {
            return await GetAsync<SessionsResponse>("/api/sessions");
        }

        public async Task<SessionResponse> GetSessionAsync(string sessionId)
        {
            return await GetAsync<SessionResponse>($"/api/sessions/{sessionId}");
        }

        public async Task<SessionResponse> CreateSessionAsync(string title, object settings = null)
        {
            var body = new { title, settings };
            return await PostAsync<SessionResponse>("/api/sessions", body);
        }

        public async Task<RunResponse> RunAsync(string modelId, string objective, 
            string sessionId = null, string[] enabledSkillIds = null, object settings = null)
        {
            var body = new { modelId, objective, sessionId, enabledSkillIds, settings };
            return await PostAsync<RunResponse>("/api/run", body);
        }

        public async IAsyncEnumerable<StreamEvent> RunStreamAsync(string modelId, string objective,
            string sessionId = null, string[] enabledSkillIds = null, object settings = null)
        {
            var body = new { modelId, objective, sessionId, enabledSkillIds, settings };
            var json = JsonSerializer.Serialize(body);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/api/run/stream") { Content = content };
            if (!string.IsNullOrEmpty(_token))
                request.Headers.Add("Authorization", $"Bearer {_token}");

            var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
            response.EnsureSuccessStatusCode();

            using var stream = await response.Content.ReadAsStreamAsync();
            using var reader = new System.IO.StreamReader(stream);
            
            var buffer = new StringBuilder();
            
            while (!reader.EndOfStream)
            {
                var line = await reader.ReadLineAsync();
                if (string.IsNullOrEmpty(line)) continue;
                
                if (line.StartsWith("data: "))
                {
                    var data = line.Substring(6);
                    try
                    {
                        var evt = JsonSerializer.Deserialize<StreamEvent>(data, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                        if (evt != null)
                        {
                            yield return evt;
                            if (evt.Type == "done") yield break;
                        }
                    }
                    catch { }
                }
            }
        }

        public async Task<SkillInvokeResponse> InvokeSkillAsync(string skillId, object input)
        {
            return await PostAsync<SkillInvokeResponse>($"/api/skills/{skillId}/invoke", input);
        }

        // ============ Convenience Methods ============

        public async Task<ShellResponse> ExecuteShellAsync(string command, string cwd = null, int timeout = 60000)
        {
            var input = new { command, cwd, timeout };
            var result = await InvokeSkillAsync("shell_execute", input);
            return JsonSerializer.Deserialize<ShellResponse>(JsonSerializer.Serialize(result.Result), 
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        public async Task<PowerShellResponse> ExecutePowerShellAsync(string command, bool elevated = false, int timeout = 60000)
        {
            var input = new { command, elevated, timeout };
            var result = await InvokeSkillAsync("windows_powershell", input);
            return JsonSerializer.Deserialize<PowerShellResponse>(JsonSerializer.Serialize(result.Result),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        public async Task<ProcessListResponse> ListProcessesAsync()
        {
            var input = new { action = "list" };
            var result = await InvokeSkillAsync("process_control", input);
            return JsonSerializer.Deserialize<ProcessListResponse>(JsonSerializer.Serialize(result.Result),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        public async Task<SystemInfoResponse> GetSystemInfoAsync(string detail = "basic")
        {
            var input = new { detail };
            var result = await InvokeSkillAsync("system_info", input);
            return JsonSerializer.Deserialize<SystemInfoResponse>(JsonSerializer.Serialize(result.Result),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        public async Task<WindowsServicesResponse> ListWindowsServicesAsync()
        {
            var input = new { action = "list" };
            var result = await InvokeSkillAsync("windows_services", input);
            return JsonSerializer.Deserialize<WindowsServicesResponse>(JsonSerializer.Serialize(result.Result),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        public async Task<WindowsWingetResponse> SearchPackagesAsync(string package)
        {
            var input = new { action = "search", package };
            var result = await InvokeSkillAsync("windows_winget", input);
            return JsonSerializer.Deserialize<WindowsWingetResponse>(JsonSerializer.Serialize(result.Result),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        public async Task<WindowsWingetResponse> InstallPackageAsync(string package, bool force = false)
        {
            var input = new { action = "install", package, acceptPackageAgreements = true, force };
            var result = await InvokeSkillAsync("windows_winget", input);
            return JsonSerializer.Deserialize<WindowsWingetResponse>(JsonSerializer.Serialize(result.Result),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        public async Task<FileResponse> ReadFileAsync(string path)
        {
            var input = new { action = "read", target = path };
            var result = await InvokeSkillAsync("workspace_files", input);
            return JsonSerializer.Deserialize<FileResponse>(JsonSerializer.Serialize(result.Result),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        public async Task<FileResponse> WriteFileAsync(string path, string content)
        {
            var input = new { action = "write", target = path, content };
            var result = await InvokeSkillAsync("workspace_files", input);
            return JsonSerializer.Deserialize<FileResponse>(JsonSerializer.Serialize(result.Result),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        // ============ WebSocket API ============

        public async Task<bool> WsConnectAsync(Action onConnect = null, Action onDisconnect = null)
        {
            if (_wsConnected) return true;
            
            var wsUrl = _baseUrl.Replace("http://", "ws://").Replace("https://", "wss://") + "/ws";
            if (!string.IsNullOrEmpty(_token))
                wsUrl += $"?token={_token}";
            
            _ws = new ClientWebSocket();
            _wsCts = new CancellationTokenSource();
            
            try
            {
                await _ws.ConnectAsync(new Uri(wsUrl), _wsCts.Token);
                _wsConnected = true;
                
                _ = Task.Run(async () =>
                {
                    var buffer = new byte[8192];
                    while (_ws.State == WebSocketState.Open && !_wsCts.Token.IsCancellationRequested)
                    {
                        try
                        {
                            var result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), _wsCts.Token);
                            if (result.MessageType == WebSocketMessageType.Text)
                            {
                                var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                                ProcessWsMessage(json);
                            }
                            else if (result.MessageType == WebSocketMessageType.Close)
                            {
                                _wsConnected = false;
                                onDisconnect?.Invoke();
                                break;
                            }
                        }
                        catch (OperationCanceledException) { break; }
                        catch { break; }
                    }
                });
                
                onConnect?.Invoke();
                return true;
            }
            catch
            {
                _wsConnected = false;
                return false;
            }
        }

        public async Task WsDisconnectAsync()
        {
            if (_ws != null && _ws.State == WebSocketState.Open)
            {
                _wsCts?.Cancel();
                await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
            }
            _ws?.Dispose();
            _ws = null;
            _wsConnected = false;
        }

        public void WsOn(string eventType, Action<object> callback)
        {
            if (_wsCallbacks.TryGetValue(eventType, out var list))
                list.Add(callback);
        }

        public void WsOff(string eventType, Action<object> callback)
        {
            if (_wsCallbacks.TryGetValue(eventType, out var list))
                list.Remove(callback);
        }

        public async Task WsSendAsync(string type, object payload = null)
        {
            if (!_wsConnected || _ws == null) throw new InvalidOperationException("WebSocket not connected");
            
            var msg = new Dictionary<string, object> { ["type"] = type };
            if (payload != null)
            {
                if (payload is IDictionary<string, object> dict)
                    foreach (var kvp in dict) msg[kvp.Key] = kvp.Value;
                else
                    msg["payload"] = payload;
            }
            
            var json = JsonSerializer.Serialize(msg);
            await _ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(json)), 
                WebSocketMessageType.Text, true, CancellationToken.None);
        }

        public async Task WsInitAsync()
        {
            await WsSendAsync("init");
        }

        public async Task WsPingAsync()
        {
            await WsSendAsync("ping");
        }

        public async Task WsRunAsync(string modelId, string objective, string sessionId = null,
            string[] enabledSkillIds = null, object settings = null)
        {
            await WsSendAsync("run", new { modelId, objective, sessionId, enabledSkillIds, settings });
        }

        public async Task<object> WsRunWithCallbackAsync(string modelId, string objective,
            Action<object> onProgress = null, Action<object> onDone = null,
            string sessionId = null, string[] enabledSkillIds = null, object settings = null,
            int timeoutMs = 120000)
        {
            var tcs = new TaskCompletionSource<object>();
            var cts = new CancellationTokenSource(timeoutMs);
            
            void ProgressHandler(object data)
            {
                onProgress?.Invoke(data);
            }
            
            void DoneHandler(object data)
            {
                onDone?.Invoke(data);
                tcs.TrySetResult(data);
            }
            
            WsOn("progress", ProgressHandler);
            WsOn("done", DoneHandler);
            
            cts.Token.Register(() => tcs.TrySetCanceled());
            
            await WsRunAsync(modelId, objective, sessionId, enabledSkillIds, settings);
            
            try
            {
                return await tcs.Task;
            }
            finally
            {
                WsOff("progress", ProgressHandler);
                WsOff("done", DoneHandler);
                cts.Dispose();
            }
        }

        private void ProcessWsMessage(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                var type = root.GetProperty("type").GetString();
                
                if (type != null && _wsCallbacks.TryGetValue(type, out var callbacks))
                {
                    var payload = root.TryGetProperty("payload", out var p) ? p : root;
                    foreach (var cb in callbacks.ToArray())
                        cb.Invoke(payload);
                }
            }
            catch { }
        }

        // ============ HTTP Helpers ============

        private async Task<T> GetAsync<T>(string path)
        {
            var response = await _http.GetAsync($"{_baseUrl}{path}");
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<T>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        private async Task<T> PostAsync<T>(string path, object body)
        {
            var json = JsonSerializer.Serialize(body);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _http.PostAsync($"{_baseUrl}{path}", content);
            response.EnsureSuccessStatusCode();
            var responseJson = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<T>(responseJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        public void Dispose()
        {
            _wsCts?.Cancel();
            _ws?.Dispose();
            _http?.Dispose();
        }
    }

    // ============ Response Types ============

    public class HealthResponse { public bool Ok { get; set; } public string App { get; set; } }
    public class ModelsResponse { public Model[] Models { get; set; } }
    public class Model { public string Id { get; set; } public string Label { get; set; } public string Provider { get; set; } }
    public class SkillsResponse { public Skill[] Skills { get; set; } public string[] Warnings { get; set; } }
    public class Skill { public string Id { get; set; } public string Name { get; set; } public string Description { get; set; } }
    public class HooksResponse { public Hook[] Hooks { get; set; } }
    public class Hook { public string Id { get; set; } public string Description { get; set; } public string[] Events { get; set; } }
    public class SessionsResponse { public Session[] Sessions { get; set; } }
    public class SessionResponse { public Session Session { get; set; } }
    public class Session { public string Id { get; set; } public string Title { get; set; } public string UserId { get; set; } public object Settings { get; set; } }
    public class RunResponse { public string Answer { get; set; } public bool Done { get; set; } public string DoneReason { get; set; } public int Cycles { get; set; } public Session Session { get; set; } public object[] Trace { get; set; } }
    public class StreamEvent { public string Type { get; set; } public object Payload { get; set; } }
    public class SkillInvokeResponse { public bool Ok { get; set; } public string SkillId { get; set; } public object Result { get; set; } }
    public class ShellResponse { public bool Ok { get; set; } public int ExitCode { get; set; } public string Stdout { get; set; } public string Stderr { get; set; } public bool Blocked { get; set; } }
    public class PowerShellResponse { public bool Ok { get; set; } public int ExitCode { get; set; } public string Stdout { get; set; } public string Stderr { get; set; } public bool Elevated { get; set; } }
    public class ProcessListResponse { public bool Ok { get; set; } public string Action { get; set; } public int Count { get; set; } public ProcessInfo[] Processes { get; set; } }
    public class ProcessInfo { public string Name { get; set; } public int Pid { get; set; } }
    public class SystemInfoResponse { public bool Ok { get; set; } public string Hostname { get; set; } public string Platform { get; set; } public CpuInfo Cpu { get; set; } public MemoryInfo Memory { get; set; } }
    public class CpuInfo { public int Count { get; set; } public string Model { get; set; } }
    public class MemoryInfo { public long Total { get; set; } public long Free { get; set; } public long Used { get; set; } }
    public class WindowsServicesResponse { public bool Ok { get; set; } public int Count { get; set; } public WindowsService[] Services { get; set; } }
    public class WindowsService { public string Name { get; set; } public string DisplayName { get; set; } public string State { get; set; } }
    public class WindowsWingetResponse { public bool Ok { get; set; } public int Count { get; set; } public WingetPackage[] Packages { get; set; } }
    public class WingetPackage { public string Name { get; set; } public string Id { get; set; } public string Version { get; set; } }
    public class FileResponse { public bool Ok { get; set; } public string Path { get; set; } public string Content { get; set; } public bool Written { get; set; } }
}
