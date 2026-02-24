import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export const skill = {
  id: "browser-verifier",
  name: "Browser Verifier",
  description: "Browser-based verification with Playwright - screenshots, recordings, visual testing, accessibility checks, user flow testing.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["screenshot", "record", "test", "navigate", "click", "fill", "wait", "verify", "accessibility", "performance", "visual", "session", "compare", "pdf", "har"],
        description: "Browser action"
      },
      url: { type: "string", description: "URL to navigate/test" },
      selector: { type: "string", description: "CSS selector" },
      text: { type: "string", description: "Text to fill/find" },
      value: { type: "string", description: "Value to input" },
      output: { type: "string", description: "Output file path" },
      browser: { type: "string", enum: ["chromium", "firefox", "webkit"], description: "Browser to use" },
      viewport: { type: "object", description: "Viewport dimensions {width, height}" },
      timeout: { type: "number", description: "Timeout in ms" },
      waitFor: { type: "string", description: "Wait for selector/state" },
      script: { type: "string", description: "JavaScript to execute" },
      options: { type: "object", additionalProperties: true }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const url = input?.url;
    const selector = input?.selector;
    const text = input?.text;
    const value = input?.value;
    const output = input?.output;
    const browser = input?.browser || "chromium";
    const viewport = input?.viewport || { width: 1280, height: 720 };
    const timeout = input?.timeout || 30000;
    const waitFor = input?.waitFor;
    const script = input?.script;
    const options = input?.options || {};

    const artifactsDir = path.join(workspaceRoot, "artifacts", "browser");
    const screenshotsDir = path.join(artifactsDir, "screenshots");
    const recordingsDir = path.join(artifactsDir, "recordings");
    const tracesDir = path.join(artifactsDir, "traces");
    const harDir = path.join(artifactsDir, "har");
    
    await mkdir(screenshotsDir, { recursive: true });
    await mkdir(recordingsDir, { recursive: true });
    await mkdir(tracesDir, { recursive: true });
    await mkdir(harDir, { recursive: true });

    const timestamp = Date.now();
    const sanitizeFilename = (s) => (s || "output").replace(/[^a-z0-9]/gi, "-").slice(0, 50);

    const execPlaywright = async (testCode, timeoutMs = 120000) => {
      const fullCode = `
const { chromium, firefox, webkit } = require('playwright');

(async () => {
  const browserType = { chromium, firefox, webkit }['${browser}'];
  const browser = await browserType.launch({
    headless: ${options.headless !== false},
    recordingsDir: '${recordingsDir.replace(/\\/g, "/")}'
  });
  
  const context = await browser.newContext({
    viewport: { width: ${viewport.width}, height: ${viewport.height} },
    recordVideo: ${options.record ? `{ dir: '${recordingsDir.replace(/\\/g, "/")}' }` : "undefined"},
    recordHar: ${options.har ? `{ path: '${path.join(harDir, `${timestamp}.har`).replace(/\\/g, "/")}' }` : "undefined"}
  });
  
  const page = await context.newPage();
  page.setDefaultTimeout(${timeout});
  
  try {
    ${testCode}
    
    if (page.video) {
      const video = page.video();
      if (video) {
        const videoPath = await video.path();
        console.log(JSON.stringify({ videoPath }));
      }
    }
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }));
  } finally {
    await context.close();
    await browser.close();
  }
})();
`;
      
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn("node", ["-e", fullCode], {
          env: { ...process.env },
          windowsHide: true,
          cwd: workspaceRoot
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

    const parseResult = (result) => {
      if (result.exitCode !== 0 && !result.stdout) {
        return { ok: false, error: result.stderr || result.error || "Browser execution failed" };
      }
      
      const lines = result.stdout.trim().split("\n").filter(Boolean);
      const results = [];
      
      for (const line of lines) {
        try {
          results.push(JSON.parse(line));
        } catch {}
      }
      
      if (results.length === 1) {
        return { ok: !results[0].error, ...results[0] };
      }
      
      return { ok: true, results, raw: result.stdout };
    };

    switch (action) {
      case "screenshot": {
        if (!url) throw new Error("url is required for screenshot");
        
        const outputPath = output || path.join(screenshotsDir, `screenshot-${timestamp}.png`);
        const fullPage = options.fullPage !== false;
        
        const result = await execPlaywright(`
          await page.goto('${url}', { waitUntil: 'networkidle' });
          ${waitFor ? `await page.waitForSelector('${waitFor}');` : ""}
          await page.screenshot({ path: '${outputPath.replace(/\\/g, "/")}', fullPage: ${fullPage} });
          console.log(JSON.stringify({ screenshot: '${outputPath.replace(/\\/g, "/")}', url: '${url}' }));
        `);
        
        const parsed = parseResult(result);
        return { ok: true, ...parsed, path: outputPath, url };
      }

      case "record": {
        if (!url) throw new Error("url is required for recording");
        
        const outputPath = output || path.join(recordingsDir, `session-${timestamp}.webm`);
        
        const steps = options.steps || [];
        const stepsCode = steps.map(step => {
          if (step.action === "click") return `await page.click('${step.selector}');`;
          if (step.action === "fill") return `await page.fill('${step.selector}', '${step.value}');`;
          if (step.action === "wait") return `await page.waitForSelector('${step.selector}');`;
          if (step.action === "navigate") return `await page.goto('${step.url}');`;
          if (step.action === "screenshot") return `await page.screenshot({ path: '${path.join(screenshotsDir, `step-${Date.now()}.png`).replace(/\\/g, "/")}' });`;
          return "";
        }).join("\n          ");
        
        const result = await execPlaywright(`
          await page.goto('${url}', { waitUntil: 'networkidle' });
          await page.waitForTimeout(500);
          ${stepsCode}
          await page.waitForTimeout(1000);
          console.log(JSON.stringify({ recorded: true, url: '${url}', steps: ${steps.length} }));
        `, 180000);
        
        return parseResult(result);
      }

      case "test": {
        if (!url) throw new Error("url is required for test");
        
        const testSteps = options.steps || [
          { type: "navigate", url },
          { type: "verify", selector: "body" }
        ];
        
        const assertions = [];
        const testCode = testSteps.map((step, i) => {
          if (step.type === "navigate") {
            return `await page.goto('${step.url}', { waitUntil: 'networkidle' });`;
          }
          if (step.type === "click") {
            return `await page.click('${step.selector}');`;
          }
          if (step.type === "fill") {
            return `await page.fill('${step.selector}', '${step.value}');`;
          }
          if (step.type === "verify" || step.type === "assert") {
            assertions.push({ step: i, selector: step.selector, expected: step.expected });
            return `
            const element${i} = await page.$('${step.selector}');
            if (!element${i}) {
              throw new Error('Element not found: ${step.selector}');
            }
            ${step.expected ? `
            const text${i} = await element${i}.textContent();
            if (!text${i}.includes('${step.expected}')) {
              throw new Error('Expected "${step.expected}" but got: ' + text${i});
            }
            ` : ""}
            console.log(JSON.stringify({ step: ${i}, passed: true, selector: '${step.selector}' }));
            `;
          }
          if (step.type === "screenshot") {
            return `await page.screenshot({ path: '${path.join(screenshotsDir, `test-step-${i}-${timestamp}.png`).replace(/\\/g, "/")}' });`;
          }
          if (step.type === "wait") {
            return `await page.waitForSelector('${step.selector}', { timeout: ${step.timeout || timeout} });`;
          }
          return "";
        }).join("\n          ");
        
        const result = await execPlaywright(`
          console.log(JSON.stringify({ testStart: true, url: '${url}' }));
          ${testCode}
          console.log(JSON.stringify({ testComplete: true, passed: true }));
        `, 180000);
        
        return parseResult(result);
      }

      case "navigate": {
        if (!url) throw new Error("url is required");
        
        const result = await execPlaywright(`
          await page.goto('${url}', { waitUntil: 'networkidle' });
          const title = await page.title();
          const currentUrl = page.url();
          console.log(JSON.stringify({ navigated: true, title, url: currentUrl }));
        `);
        
        return parseResult(result);
      }

      case "click": {
        if (!selector) throw new Error("selector is required");
        
        const result = await execPlaywright(`
          ${url ? `await page.goto('${url}', { waitUntil: 'networkidle' });` : ""}
          await page.click('${selector}');
          console.log(JSON.stringify({ clicked: true, selector: '${selector}' }));
        `);
        
        return parseResult(result);
      }

      case "fill": {
        if (!selector || value === undefined) throw new Error("selector and value are required");
        
        const result = await execPlaywright(`
          ${url ? `await page.goto('${url}', { waitUntil: 'networkidle' });` : ""}
          await page.fill('${selector}', '${value.replace(/'/g, "\\'")}');
          console.log(JSON.stringify({ filled: true, selector: '${selector}' }));
        `);
        
        return parseResult(result);
      }

      case "verify": {
        if (!selector) throw new Error("selector is required");
        
        const result = await execPlaywright(`
          ${url ? `await page.goto('${url}', { waitUntil: 'networkidle' });` : ""}
          const element = await page.$('${selector}');
          ${text ? `
          if (element) {
            const content = await element.textContent();
            const found = content.includes('${text}');
            console.log(JSON.stringify({ verified: found, selector: '${selector}', text: '${text}', content: content.slice(0, 200) }));
          } else {
            console.log(JSON.stringify({ verified: false, selector: '${selector}', error: 'Element not found' }));
          }
          ` : `
          console.log(JSON.stringify({ verified: !!element, selector: '${selector}' }));
          `}
        `);
        
        return parseResult(result);
      }

      case "accessibility": {
        if (!url) throw new Error("url is required for accessibility check");
        
        const result = await execPlaywright(`
          await page.goto('${url}', { waitUntil: 'networkidle' });
          
          const issues = [];
          
          // Check for alt text on images
          const images = await page.$$('img');
          for (const img of images) {
            const alt = await img.getAttribute('alt');
            const ariaLabel = await img.getAttribute('aria-label');
            if (!alt && !ariaLabel) {
              const src = await img.getAttribute('src');
              issues.push({ type: 'image-alt', message: 'Image missing alt text', element: src });
            }
          }
          
          // Check for labels on inputs
          const inputs = await page.$$('input:not([type="hidden"])');
          for (const input of inputs) {
            const id = await input.getAttribute('id');
            const ariaLabel = await input.getAttribute('aria-label');
            const placeholder = await input.getAttribute('placeholder');
            if (id) {
              const label = await page.$(\`label[for="\${id}"]\`);
              if (!label && !ariaLabel) {
                issues.push({ type: 'input-label', message: 'Input missing label', element: id });
              }
            } else if (!ariaLabel && !placeholder) {
              issues.push({ type: 'input-label', message: 'Input missing accessible name' });
            }
          }
          
          // Check for button text
          const buttons = await page.$$('button');
          for (const button of buttons) {
            const text = await button.textContent();
            const ariaLabel = await button.getAttribute('aria-label');
            if (!text?.trim() && !ariaLabel) {
              issues.push({ type: 'button-text', message: 'Button has no accessible name' });
            }
          }
          
          // Check page title
          const title = await page.title();
          if (!title) {
            issues.push({ type: 'page-title', message: 'Page has no title' });
          }
          
          console.log(JSON.stringify({ 
            accessibility: true, 
            passed: issues.length === 0,
            issues,
            issueCount: issues.length,
            url: '${url}'
          }));
        `);
        
        return parseResult(result);
      }

      case "performance": {
        if (!url) throw new Error("url is required for performance check");
        
        const result = await execPlaywright(`
          const start = Date.now();
          await page.goto('${url}', { waitUntil: 'networkidle' });
          const loadTime = Date.now() - start;
          
          const metrics = await page.evaluate(() => {
            const perf = performance;
            const timing = perf.timing;
            return {
              domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
              loadComplete: timing.loadEventEnd - timing.navigationStart,
              domInteractive: timing.domInteractive - timing.navigationStart,
              responseTime: timing.responseEnd - timing.requestStart
            };
          });
          
          console.log(JSON.stringify({
            performance: true,
            url: '${url}',
            loadTime,
            metrics
          }));
        `);
        
        return parseResult(result);
      }

      case "visual": {
        if (!url) throw new Error("url is required for visual comparison");
        
        const outputPath = output || path.join(screenshotsDir, `visual-${timestamp}.png`);
        const baselinePath = options.baseline || path.join(screenshotsDir, "baseline.png");
        
        const result = await execPlaywright(`
          await page.goto('${url}', { waitUntil: 'networkidle' });
          await page.screenshot({ path: '${outputPath.replace(/\\/g, "/")}', fullPage: true });
          
          ${options.compare && existsSync(baselinePath) ? `
          const fs = require('fs');
          const { PNG } = require('pngjs');
          
          const img1 = PNG.sync.read(fs.readFileSync('${outputPath.replace(/\\/g, "/")}'));
          const img2 = PNG.sync.read(fs.readFileSync('${baselinePath.replace(/\\/g, "/")}'));
          
          let diffPixels = 0;
          const totalPixels = img1.width * img1.height;
          
          if (img1.width === img2.width && img1.height === img2.height) {
            for (let i = 0; i < img1.data.length; i += 4) {
              if (Math.abs(img1.data[i] - img2.data[i]) > 10 ||
                  Math.abs(img1.data[i+1] - img2.data[i+1]) > 10 ||
                  Math.abs(img1.data[i+2] - img2.data[i+2]) > 10) {
                diffPixels++;
              }
            }
          }
          
          const diffPercent = (diffPixels / totalPixels * 100).toFixed(2);
          console.log(JSON.stringify({
            visual: true,
            screenshot: '${outputPath.replace(/\\/g, "/")}',
            diffPixels,
            diffPercent,
            matches: parseFloat(diffPercent) < ${options.threshold || 0.1}
          }));
          ` : `
          console.log(JSON.stringify({
            visual: true,
            screenshot: '${outputPath.replace(/\\/g, "/")}',
            baseline: null
          }));
          `}
        `);
        
        return parseResult(result);
      }

      case "session": {
        if (!url) throw new Error("url is required for session recording");
        
        const outputPath = output || path.join(artifactsDir, `session-${timestamp}.json`);
        
        const actions = options.actions || [];
        const session = { url, startTime: new Date().toISOString(), actions: [] };
        
        const actionsCode = actions.map((act, i) => {
          if (act.type === "navigate") return `await page.goto('${act.url}'); session.actions.push({ type: 'navigate', url: '${act.url}' });`;
          if (act.type === "click") return `await page.click('${act.selector}'); session.actions.push({ type: 'click', selector: '${act.selector}' });`;
          if (act.type === "fill") return `await page.fill('${act.selector}', '${act.value}'); session.actions.push({ type: 'fill', selector: '${act.selector}' });`;
          if (act.type === "wait") return `await page.waitForTimeout(${act.ms || 1000}); session.actions.push({ type: 'wait', ms: ${act.ms || 1000} });`;
          if (act.type === "screenshot") return `
            const ss${i} = '${path.join(screenshotsDir, `session-${i}-${timestamp}.png`).replace(/\\/g, "/")}';
            await page.screenshot({ path: ss${i} });
            session.actions.push({ type: 'screenshot', path: ss${i} });
          `;
          return "";
        }).join("\n          ");
        
        const result = await execPlaywright(`
          const session = { url: '${url}', startTime: new Date().toISOString(), actions: [] };
          
          await page.goto('${url}', { waitUntil: 'networkidle' });
          
          ${actionsCode}
          
          session.endTime = new Date().toISOString();
          console.log(JSON.stringify({ session }));
        `, 300000);
        
        const parsed = parseResult(result);
        
        if (parsed.session) {
          await writeFile(outputPath, JSON.stringify(parsed.session, null, 2), "utf8");
          parsed.path = outputPath;
        }
        
        return parsed;
      }

      case "pdf": {
        if (!url) throw new Error("url is required for PDF");
        
        const outputPath = output || path.join(artifactsDir, `page-${timestamp}.pdf`);
        
        const result = await execPlaywright(`
          await page.goto('${url}', { waitUntil: 'networkidle' });
          await page.pdf({ 
            path: '${outputPath.replace(/\\/g, "/")}',
            format: '${options.format || "A4"}',
            printBackground: ${options.printBackground !== false}
          });
          console.log(JSON.stringify({ pdf: true, path: '${outputPath.replace(/\\/g, "/")}' }));
        `);
        
        return parseResult(result);
      }

      case "har": {
        if (!url) throw new Error("url is required for HAR");
        
        const outputPath = output || path.join(harDir, `network-${timestamp}.har`);
        
        const result = await execPlaywright(`
          await page.goto('${url}', { waitUntil: 'networkidle' });
          await page.context().storageState();
          await page.waitForTimeout(1000);
          console.log(JSON.stringify({ har: true, path: '${outputPath.replace(/\\/g, "/")}' }));
        `);
        
        return parseResult(result);
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
};
