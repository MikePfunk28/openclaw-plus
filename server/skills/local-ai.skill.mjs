import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export const skill = {
  id: "local-ai",
  name: "Local AI Models",
  description: "Local AI model operations - Ollama (LLMs), llama.cpp, whisper.cpp (speech-to-text), Coqui TTS. Run AI models locally without API keys.",
  inputSchema: {
    type: "object",
    properties: {
      engine: {
        type: "string",
        enum: ["ollama", "llamacpp", "whisper", "tts", "stable-diffusion", "comfyui"],
        description: "Local AI engine to use"
      },
      action: {
        type: "string",
        description: "Action to perform"
      },
      model: {
        type: "string",
        description: "Model name"
      },
      prompt: {
        type: "string",
        description: "Text prompt for generation"
      },
      input: {
        type: "string",
        description: "Input file path (for audio/video processing)"
      },
      output: {
        type: "string",
        description: "Output file path"
      },
      params: {
        type: "object",
        description: "Additional parameters",
        additionalProperties: true
      },
      baseUrl: {
        type: "string",
        description: "Base URL for the service"
      }
    },
    required: ["engine"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const engine = input?.engine;
    const action = input?.action;
    const model = input?.model;
    const prompt = input?.prompt;
    const inputFile = input?.input;
    const outputFile = input?.output;
    const params = input?.params || {};
    const baseUrl = input?.baseUrl;

    const modelsDir = path.join(workspaceRoot, "models");
    const outputDir = path.join(workspaceRoot, "output");
    await mkdir(modelsDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    const exec = (cmd, args, timeoutMs = 120000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn(cmd, args, {
          env: process.env,
          windowsHide: true
        });

        const timeoutId = setTimeout(() => {
          child.kill("SIGTERM");
          resolve({ exitCode: -1, stdout, stderr, timedOut: true });
        }, timeoutMs);

        child.stdout?.on("data", (data) => { stdout += data.toString(); });
        child.stderr?.on("data", (data) => { stderr += data.toString(); });

        child.on("close", (code) => {
          clearTimeout(timeoutId);
          resolve({ exitCode: code, stdout, stderr });
        });

        child.on("error", (err) => {
          clearTimeout(timeoutId);
          resolve({ exitCode: -1, stdout, stderr, error: err.message });
        });
      });
    };

    const execOllama = async (endpoint, body, timeoutMs = 120000) => {
      const url = `${baseUrl || "http://localhost:11434"}${endpoint}`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const text = await response.text();
          return { ok: false, error: text };
        }
        const data = await response.json();
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    };

    switch (engine) {
      case "ollama": {
        const ollamaUrl = baseUrl || "http://localhost:11434";
        
        switch (action) {
          case "list":
          case "models": {
            const result = await execOllama("/api/tags", {});
            if (!result.ok) {
              const cliResult = await exec("ollama", ["list"]);
              if (cliResult.exitCode !== 0) {
                return { ok: false, error: cliResult.stderr || "Ollama not running" };
              }
              const lines = cliResult.stdout.trim().split("\n").slice(1);
              const models = lines.map(line => {
                const parts = line.trim().split(/\s+/);
                return { name: parts[0], id: parts[1], modified: parts[2], size: parts[3] };
              });
              return { ok: true, models };
            }
            return { ok: true, models: result.data?.models || [] };
          }

          case "pull":
          case "download": {
            if (!model) throw new Error("model is required");
            const cliResult = await exec("ollama", ["pull", model], 600000);
            return { ok: cliResult.exitCode === 0, model, output: cliResult.stdout || cliResult.stderr };
          }

          case "run":
          case "generate": {
            if (!prompt) throw new Error("prompt is required");
            const modelName = model || "llama3.2";
            
            const result = await execOllama("/api/generate", {
              model: modelName,
              prompt,
              stream: false,
              options: {
                temperature: params.temperature || 0.7,
                top_p: params.top_p || 0.9,
                top_k: params.top_k || 40,
                num_predict: params.maxTokens || params.num_predict || 2048
              }
            });
            
            if (!result.ok) {
              return { ok: false, error: result.error };
            }
            
            return {
              ok: true,
              engine: "ollama",
              model: modelName,
              response: result.data?.response || "",
              context: result.data?.context,
              totalDuration: result.data?.total_duration,
              evalCount: result.data?.eval_count
            };
          }

          case "chat": {
            if (!prompt) throw new Error("prompt is required");
            const modelName = model || "llama3.2";
            const messages = params.messages || [{ role: "user", content: prompt }];
            
            const result = await execOllama("/api/chat", {
              model: modelName,
              messages,
              stream: false,
              options: {
                temperature: params.temperature || 0.7,
                num_predict: params.maxTokens || 2048
              }
            });
            
            if (!result.ok) {
              return { ok: false, error: result.error };
            }
            
            return {
              ok: true,
              engine: "ollama",
              model: modelName,
              message: result.data?.message,
              totalDuration: result.data?.total_duration
            };
          }

          case "embed": {
            const modelName = model || "nomic-embed-text";
            const text = prompt || params.text;
            if (!text) throw new Error("text or prompt is required");
            
            const result = await execOllama("/api/embeddings", {
              model: modelName,
              prompt: text
            });
            
            if (!result.ok) {
              return { ok: false, error: result.error };
            }
            
            return {
              ok: true,
              engine: "ollama",
              model: modelName,
              embedding: result.data?.embedding,
              dimensions: result.data?.embedding?.length
            };
          }

          case "delete": {
            if (!model) throw new Error("model is required");
            const cliResult = await exec("ollama", ["rm", model]);
            return { ok: cliResult.exitCode === 0, model, output: cliResult.stdout || cliResult.stderr };
          }

          case "ps":
          case "running": {
            const result = await execOllama("/api/ps", {});
            return { ok: result.ok, models: result.data?.models || result.data?.running || [] };
          }

          case "show":
          case "info": {
            if (!model) throw new Error("model is required");
            const result = await execOllama("/api/show", { name: model });
            return { ok: result.ok, info: result.data };
          }

          case "create": {
            const name = model || params.name;
            const modelfile = params.modelfile || params.from;
            if (!name) throw new Error("model name is required");
            
            const result = await execOllama("/api/create", {
              name,
              modelfile,
              from: params.from,
              system: params.system,
              template: params.template
            });
            
            return { ok: result.ok, model: name, output: result.data };
          }

          default:
            throw new Error(`Unknown ollama action: ${action}`);
        }
      }

      case "llamacpp": {
        const llamacppPath = params.path || "llama-cli";
        const modelPath = model || params.modelPath;
        
        switch (action) {
          case "generate":
          case "run": {
            if (!modelPath) throw new Error("model or modelPath is required");
            if (!prompt) throw new Error("prompt is required");
            
            const args = [
              "-m", modelPath,
              "-p", prompt,
              "-n", String(params.maxTokens || 512),
              "--temp", String(params.temperature || 0.7),
              "-ngl", String(params.gpuLayers || 0)
            ];
            
            if (params.contextSize) args.push("-c", String(params.contextSize));
            if (params.batchSize) args.push("-b", String(params.batchSize));
            
            const result = await exec(llamacppPath, args, 300000);
            return { ok: result.exitCode === 0, output: result.stdout || result.stderr };
          }

          case "server": {
            if (!modelPath) throw new Error("model or modelPath is required");
            
            const port = params.port || 8080;
            const args = [
              "-m", modelPath,
              "--port", String(port),
              "--host", params.host || "127.0.0.1",
              "-ngl", String(params.gpuLayers || 0)
            ];
            
            if (params.contextSize) args.push("-c", String(params.contextSize));
            
            const result = await exec(llamacppPath.replace("cli", "server"), args, 5000);
            return { ok: result.exitCode === 0, port, message: "Server started" };
          }

          default:
            throw new Error(`Unknown llamacpp action: ${action}`);
        }
      }

      case "whisper": {
        const whisperPath = params.path || "whisper";
        
        switch (action) {
          case "transcribe":
          case "speech-to-text":
          case "stt": {
            if (!inputFile) throw new Error("input file is required");
            
            const audioPath = path.resolve(workspaceRoot, inputFile);
            const outputPath = outputFile || path.join(outputDir, "transcript");
            const modelName = model || "base";
            
            const args = [
              audioPath,
              "--model", modelName,
              "--output_format", params.format || "json",
              "--output_dir", path.dirname(outputPath),
              "--language", params.language || "auto"
            ];
            
            if (params.translate) args.push("--task", "translate");
            if (params.wordTimestamps) args.push("--word_timestamps", "True");
            
            const result = await exec(whisperPath, args, 600000);
            
            if (result.exitCode !== 0) {
              return { ok: false, error: result.stderr };
            }
            
            let transcript = result.stdout;
            const jsonPath = outputPath.replace(/\.[^.]+$/, ".json");
            
            if (existsSync(jsonPath)) {
              try {
                const jsonData = await readFile(jsonPath, "utf8");
                const parsed = JSON.parse(jsonData);
                transcript = parsed.text || transcript;
              } catch {}
            }
            
            return {
              ok: true,
              engine: "whisper",
              model: modelName,
              inputFile: audioPath,
              transcript,
              outputPath: jsonPath
            };
          }

          case "models": {
            const models = [
              { name: "tiny", params: "39M", speed: "fastest", accuracy: "lowest" },
              { name: "base", params: "74M", speed: "faster", accuracy: "low" },
              { name: "small", params: "244M", speed: "fast", accuracy: "medium" },
              { name: "medium", params: "769M", speed: "medium", accuracy: "high" },
              { name: "large", params: "1550M", speed: "slow", accuracy: "highest" },
              { name: "large-v2", params: "1550M", speed: "slow", accuracy: "highest" },
              { name: "large-v3", params: "1550M", speed: "slow", accuracy: "best" }
            ];
            return { ok: true, models };
          }

          default:
            throw new Error(`Unknown whisper action: ${action}`);
        }
      }

      case "tts": {
        switch (action) {
          case "synthesize":
          case "speak":
          case "text-to-speech": {
            if (!prompt) throw new Error("prompt (text) is required");
            
            const outputPath = outputFile || path.join(outputDir, `speech_${Date.now()}.wav`);
            const voice = params.voice || "default";
            
            let result;
            
            if (params.engine === "coqui" || params.engine === "tts") {
              const args = [
                "--text", prompt,
                "--out_path", outputPath,
                "--model_name", model || params.ttsModel || "tts_models/en/ljspeech/vits"
              ];
              if (params.speakerIdx) args.push("--speaker_idx", String(params.speakerIdx));
              
              result = await exec("tts", args, 120000);
            } else if (params.engine === "piper") {
              const args = [
                "-m", model || "en_US-lessac-medium",
                "-f", outputPath
              ];
              
              const child = spawn("piper", args, { windowsHide: true });
              child.stdin?.write(prompt);
              child.stdin?.end();
              
              result = await new Promise((resolve) => {
                let stdout = "", stderr = "";
                child.stdout?.on("data", (d) => stdout += d);
                child.stderr?.on("data", (d) => stderr += d);
                child.on("close", (code) => resolve({ exitCode: code, stdout, stderr }));
              });
            } else if (params.engine === "espeak") {
              const args = ["-v", voice, "-w", outputPath, prompt];
              result = await exec("espeak", args, 60000);
            } else {
              const args = [
                "--text", prompt,
                "--out_path", outputPath
              ];
              result = await exec("tts", args, 120000);
            }
            
            return {
              ok: result.exitCode === 0,
              engine: params.engine || "tts",
              outputPath,
              voice,
              error: result.exitCode !== 0 ? result.stderr : undefined
            };
          }

          case "voices": {
            const result = await exec("tts", ["--list_models"]);
            return { ok: result.exitCode === 0, output: result.stdout || result.stderr };
          }

          default:
            throw new Error(`Unknown tts action: ${action}`);
        }
      }

      case "stable-diffusion": {
        const sdUrl = baseUrl || params.url || "http://localhost:7860";
        
        switch (action) {
          case "txt2img":
          case "generate": {
            if (!prompt) throw new Error("prompt is required");
            
            const body = {
              prompt,
              negative_prompt: params.negativePrompt || "",
              steps: params.steps || 20,
              width: params.width || 512,
              height: params.height || 512,
              cfg_scale: params.cfgScale || 7,
              seed: params.seed || -1,
              sampler_name: params.sampler || "Euler a"
            };
            
            try {
              const response = await fetch(`${sdUrl}/sdapi/v1/txt2img`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
              });
              
              if (!response.ok) {
                return { ok: false, error: `SD error: ${response.status}` };
              }
              
              const data = await response.json();
              const outputPath = outputFile || path.join(outputDir, `sd_${Date.now()}.png`);
              
              if (data.images?.[0]) {
                const buffer = Buffer.from(data.images[0], "base64");
                await writeFile(outputPath, buffer);
              }
              
              return {
                ok: true,
                engine: "stable-diffusion",
                outputPath,
                parameters: data.parameters,
                info: data.info
              };
            } catch (err) {
              return { ok: false, error: err.message };
            }
          }

          case "img2img": {
            if (!inputFile) throw new Error("input image is required");
            
            const inputPath = path.resolve(workspaceRoot, inputFile);
            const imageData = await readFile(inputPath);
            const base64 = imageData.toString("base64");
            
            const body = {
              init_images: [base64],
              prompt: prompt || "",
              negative_prompt: params.negativePrompt || "",
              steps: params.steps || 20,
              cfg_scale: params.cfgScale || 7,
              denoising_strength: params.denoisingStrength || 0.75,
              seed: params.seed || -1
            };
            
            try {
              const response = await fetch(`${sdUrl}/sdapi/v1/img2img`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
              });
              
              if (!response.ok) {
                return { ok: false, error: `SD error: ${response.status}` };
              }
              
              const data = await response.json();
              const outputPath = outputFile || path.join(outputDir, `sd_img2img_${Date.now()}.png`);
              
              if (data.images?.[0]) {
                const buffer = Buffer.from(data.images[0], "base64");
                await writeFile(outputPath, buffer);
              }
              
              return { ok: true, outputPath };
            } catch (err) {
              return { ok: false, error: err.message };
            }
          }

          case "models": {
            try {
              const response = await fetch(`${sdUrl}/sdapi/v1/sd-models`);
              const models = await response.json();
              return { ok: true, models };
            } catch (err) {
              return { ok: false, error: "Stable Diffusion not running at " + sdUrl };
            }
          }

          case "progress": {
            try {
              const response = await fetch(`${sdUrl}/sdapi/v1/progress`);
              const progress = await response.json();
              return { ok: true, progress };
            } catch (err) {
              return { ok: false, error: err.message };
            }
          }

          default:
            throw new Error(`Unknown stable-diffusion action: ${action}`);
        }
      }

      case "comfyui": {
        const comfyUrl = baseUrl || "http://localhost:8188";
        
        switch (action) {
          case "queue":
          case "prompt": {
            if (!params.workflow && !prompt) {
              throw new Error("workflow or prompt is required");
            }
            
            const workflow = params.workflow || {
              "3": {
                inputs: { seed: Date.now(), steps: 20, cfg: 8, sampler_name: "euler", scheduler: "normal", denoise: 1, model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0] },
                class_type: "KSampler"
              },
              "4": { inputs: { ckpt_name: model || "v1-5-pruned.safetensors" }, class_type: "CheckpointLoaderSimple" },
              "5": { inputs: { width: 512, height: 512, batch_size: 1 }, class_type: "EmptyLatentImage" },
              "6": { inputs: { text: prompt, clip: ["4", 1] }, class_type: "CLIPTextEncode" },
              "7": { inputs: { text: params.negativePrompt || "", clip: ["4", 1] }, class_type: "CLIPTextEncode" },
              "8": { inputs: { samples: ["3", 0], vae: ["4", 2] }, class_type: "VAEDecode" },
              "9": { inputs: { filename_prefix: "ComfyUI", images: ["8", 0] }, class_type: "SaveImage" }
            };
            
            try {
              const response = await fetch(`${comfyUrl}/prompt`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: workflow })
              });
              
              const data = await response.json();
              return { ok: response.ok, promptId: data.prompt_id, number: data.number };
            } catch (err) {
              return { ok: false, error: "ComfyUI not running at " + comfyUrl };
            }
          }

          case "status": {
            try {
              const response = await fetch(`${comfyUrl}/queue`);
              const data = await response.json();
              return { ok: true, queue: data };
            } catch (err) {
              return { ok: false, error: "ComfyUI not running" };
            }
          }

          case "interrupt": {
            try {
              await fetch(`${comfyUrl}/interrupt`, { method: "POST" });
              return { ok: true, message: "Interrupted" };
            } catch (err) {
              return { ok: false, error: err.message };
            }
          }

          default:
            throw new Error(`Unknown comfyui action: ${action}`);
        }
      }

      default:
        throw new Error(`Unknown engine: ${engine}`);
    }
  }
};
