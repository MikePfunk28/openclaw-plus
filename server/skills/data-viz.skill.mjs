import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const skill = {
  id: "data-viz",
  name: "Data Visualization",
  description: "Create visualizations - charts, graphs, plots, heatmaps. Supports matplotlib, seaborn, plotly. Export to PNG, SVG, HTML, JSON.",
  inputSchema: {
    type: "object",
    properties: {
      chartType: {
        type: "string",
        enum: ["line", "bar", "scatter", "histogram", "box", "violin", "heatmap", "correlation", "pie", "area", "density", "pairplot", "jointplot", "count", "treemap", "wordcloud", "parallel_coordinates", "radar", "funnel", "gantt", "3d_scatter", "3d_surface"],
        description: "Type of chart to create"
      },
      data: {
        type: "string",
        description: "Data file path (CSV, JSON, Parquet)"
      },
      x: { type: "string", description: "X-axis column" },
      y: { type: "string", description: "Y-axis column (or array for multiple)" },
      z: { type: "string", description: "Z-axis column (for 3D plots)" },
      color: { type: "string", description: "Color by column" },
      size: { type: "string", description: "Size by column" },
      hue: { type: "string", description: "Hue/grouping column" },
      title: { type: "string", description: "Chart title" },
      xLabel: { type: "string", description: "X-axis label" },
      yLabel: { type: "string", description: "Y-axis label" },
      zLabel: { type: "string", description: "Z-axis label" },
      legend: { type: "boolean", description: "Show legend" },
      grid: { type: "boolean", description: "Show grid" },
      style: { type: "string", description: "Plot style (darkgrid, whitegrid, dark, white, ticks)" },
      palette: { type: "string", description: "Color palette" },
      figsize: { type: "array", items: { type: "number" }, description: "Figure size [width, height]" },
      output: { type: "string", description: "Output file path" },
      format: { type: "string", enum: ["png", "svg", "html", "json", "pdf"], description: "Output format" },
      interactive: { type: "boolean", description: "Create interactive plot (plotly)" },
      bins: { type: "number", description: "Number of bins for histogram" },
      kde: { type: "boolean", description: "Show KDE for histogram" },
      aggFunc: { type: "string", description: "Aggregation function for bar chart (sum, mean, count)" },
      text: { type: "string", description: "Text for wordcloud" },
      values: { type: "object", description: "Direct values for simple charts" },
      labels: { type: "array", items: { type: "string" }, description: "Labels for pie chart" },
      options: { type: "object", additionalProperties: true }
    },
    required: ["chartType"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const chartType = input?.chartType;
    const data = input?.data;
    const x = input?.x;
    const y = input?.y;
    const z = input?.z;
    const color = input?.color;
    const size = input?.size;
    const hue = input?.hue;
    const title = input?.title || "";
    const xLabel = input?.xLabel || x || "";
    const yLabel = input?.yLabel || y || "";
    const zLabel = input?.zLabel || z || "";
    const showLegend = input?.legend !== false;
    const showGrid = input?.grid !== false;
    const style = input?.style || "whitegrid";
    const palette = input?.palette || "deep";
    const figsize = input?.figsize || [12, 8];
    const output = input?.output;
    const format = input?.format || "png";
    const interactive = input?.interactive || format === "html";
    const bins = input?.bins || 30;
    const kde = input?.kde !== false;
    const aggFunc = input?.aggFunc || "mean";
    const text = input?.text;
    const values = input?.values;
    const labels = input?.labels;
    const options = input?.options || {};

    const outputDir = path.join(workspaceRoot, "output", "charts");
    await mkdir(outputDir, { recursive: true });

    const outputPath = (output 
      ? path.resolve(workspaceRoot, output)
      : path.join(outputDir, `${chartType}_${Date.now()}.${interactive ? "html" : format}`)).replace(/\\/g, "/");

    const execPython = (code, timeoutMs = 120000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn("uv", ["run", "--with", "pandas", "--with", "numpy", "--with", "matplotlib", "--with", "seaborn", "--with", "plotly", "python", "-c", code], {
          env: { ...process.env, PYTHONIOENCODING: "utf-8", UV_SYSTEM_PYTHON: "1" },
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
      if (result.exitCode !== 0) {
        return { ok: false, error: result.stderr || result.error || "Python execution failed" };
      }
      try {
        const parsed = JSON.parse(result.stdout);
        return { ok: true, ...parsed };
      } catch {
        return { ok: true, output: result.stdout };
      }
    };

    const baseCode = `
import pandas as pd
import numpy as np
import json
import warnings
warnings.filterwarnings('ignore')

def output(data):
    print(json.dumps(data, default=str))
`;

    if (interactive) {
      const code = `${baseCode}
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import plotly.io as pio

${data ? `df = pd.read_csv("${path.resolve(workspaceRoot, data).replace(/\\/g, "/")}")` : ""}

fig = None

${chartType === "line" ? `
fig = px.line(df, x='${x}', y=${Array.isArray(y) ? JSON.stringify(y) : `'${y}'`}, ${color ? `color='${color}',` : ""} ${title ? `title='${title}',` : ""})
` : chartType === "bar" ? `
${aggFunc ? `
agg_df = df.groupby('${x}')${Array.isArray(y) ? `[[${y.map(yy => `'${yy}'`).join(', ')}]]` : `['${y}']`}.${aggFunc}().reset_index()
fig = px.bar(agg_df, x='${x}', y=${Array.isArray(y) ? JSON.stringify(y) : `'${y}'`}, ${color ? `color='${color}',` : ""} ${title ? `title='${title}',` : ""})
` : `
fig = px.bar(df, x='${x}', y=${Array.isArray(y) ? JSON.stringify(y) : `'${y}'`}, ${color ? `color='${color}',` : ""} ${hue ? `color='${hue}',` : ""} ${title ? `title='${title}',` : ""})
`}
` : chartType === "scatter" ? `
fig = px.scatter(df, x='${x}', y='${y}', ${color ? `color='${color}',` : ""} ${size ? `size='${size}',` : ""} ${hue ? `color='${hue}',` : ""} ${title ? `title='${title}',` : ""}, hover_data=df.columns)
` : chartType === "histogram" ? `
fig = px.histogram(df, x='${x}', ${color ? `color='${color}',` : ""} nbins=${bins}, ${title ? `title='${title}',` : ""}, marginal='${kde ? "violin" : "box"}')
` : chartType === "box" ? `
fig = px.box(df, x='${x}', y='${y}', ${color ? `color='${color}',` : ""} ${title ? `title='${title}',` : ""})
` : chartType === "violin" ? `
fig = px.violin(df, x='${x}', y='${y}', ${color ? `color='${color}',` : ""} box=True, ${title ? `title='${title}',` : ""})
` : chartType === "heatmap" ? `
numeric_df = df.select_dtypes(include=[np.number])
fig = px.imshow(numeric_df.corr(), ${title ? `title='${title}',` : ""} color_continuous_scale='RdBu_r')
` : chartType === "correlation" ? `
numeric_df = df.select_dtypes(include=[np.number])
fig = px.imshow(numeric_df.corr(), ${title ? `title='${title} - Correlation Matrix',` : "title='Correlation Matrix',"} color_continuous_scale='RdBu_r', zmin=-1, zmax=1)
` : chartType === "pie" ? `
${values ? `
fig = px.pie(values=${JSON.stringify(Object.values(values))}, names=${JSON.stringify(labels || Object.keys(values))}, ${title ? `title='${title}',` : ""})
` : `
fig = px.pie(df, values='${y}', names='${x}', ${title ? `title='${title}',` : ""})
`}
` : chartType === "area" ? `
fig = px.area(df, x='${x}', y='${y}', ${color ? `color='${color}',` : ""} ${title ? `title='${title}',` : ""})
` : chartType === "density" ? `
fig = px.density_heatmap(df, x='${x}', y='${y}', ${title ? `title='${title}',` : ""})
` : chartType === "3d_scatter" ? `
fig = px.scatter_3d(df, x='${x}', y='${y}', z='${z}', ${color ? `color='${color}',` : ""} ${title ? `title='${title}',` : ""})
` : chartType === "count" ? `
fig = px.histogram(df, x='${x}', ${color ? `color='${color}',` : ""} ${title ? `title='${title}',` : ""})
` : `
fig = px.scatter(df, x='${x}', y='${y}', ${title ? `title='${title}',` : ""})
`}

fig.update_layout(
    ${title ? `title='${title}',` : ""}
    xaxis_title='${xLabel}',
    yaxis_title='${yLabel}',
    showlegend=${showLegend},
    width=${figsize[0] * 100},
    height=${figsize[1] * 100}
)

fig.write_html("${outputPath}")
output({"ok": True, "path": "${outputPath}", "chartType": "${chartType}", "interactive": True})
`;
      return parseResult(await execPython(code));
    }

    const code = `${baseCode}
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
from matplotlib.colors import LinearSegmentedColormap
import base64
import io

sns.set_style('${style}')
plt.rcParams['figure.figsize'] = [${figsize[0]}, ${figsize[1]}]
if '${palette}':
    sns.set_palette('${palette}')

${data ? `df = pd.read_csv("${path.resolve(workspaceRoot, data).replace(/\\/g, "/")}")` : ""}

fig, ax = plt.subplots()

${chartType === "line" ? `
${hue ? `
for h in df['${hue}'].unique():
    subset = df[df['${hue}'] == h]
    ax.plot(subset['${x}'], subset['${y}'], label=h)
ax.legend()
` : `
ax.plot(df['${x}'], df['${y}'])
`}
ax.set_xlabel('${xLabel}')
ax.set_ylabel('${yLabel}')
` : chartType === "bar" ? `
${aggFunc ? `
agg_df = df.groupby('${x}')['${y}'].${aggFunc}().reset_index()
sns.barplot(data=agg_df, x='${x}', y='${y}', ax=ax)
` : `
sns.barplot(data=df, x='${x}', y='${y}', ${hue ? `hue='${hue}',` : ""} ax=ax)
`}
ax.set_xlabel('${xLabel}')
ax.set_ylabel('${yLabel}')
` : chartType === "scatter" ? `
sns.scatterplot(data=df, x='${x}', y='${y}', ${hue ? `hue='${hue}',` : ""} ${size ? `size='${size}',` : ""} ax=ax)
ax.set_xlabel('${xLabel}')
ax.set_ylabel('${yLabel}')
` : chartType === "histogram" ? `
sns.histplot(data=df, x='${x}', bins=${bins}, kde=${kde}, ${hue ? `hue='${hue}',` : ""} ax=ax)
ax.set_xlabel('${xLabel}')
ax.set_ylabel('Count')
` : chartType === "box" ? `
sns.boxplot(data=df, x='${x}', y='${y}', ${hue ? `hue='${hue}',` : ""} ax=ax)
ax.set_xlabel('${xLabel}')
ax.set_ylabel('${yLabel}')
` : chartType === "violin" ? `
sns.violinplot(data=df, x='${x}', y='${y}', ${hue ? `hue='${hue}',` : ""} ax=ax)
ax.set_xlabel('${xLabel}')
ax.set_ylabel('${yLabel}')
` : chartType === "heatmap" || chartType === "correlation" ? `
numeric_df = df.select_dtypes(include=[np.number])
corr = numeric_df.corr()
sns.heatmap(corr, annot=True, cmap='RdBu_r', center=0, ax=ax)
ax.set_title('${title || "Correlation Matrix"}')
` : chartType === "pie" ? `
${values ? `
ax.pie(${JSON.stringify(Object.values(values))}, labels=${JSON.stringify(labels || Object.keys(values))}, autopct='%1.1f%%')
` : `
counts = df['${x}'].value_counts()
ax.pie(counts.values, labels=counts.index, autopct='%1.1f%%')
`}
` : chartType === "area" ? `
ax.fill_between(df['${x}'], df['${y}'], alpha=0.3)
ax.plot(df['${x}'], df['${y}'])
ax.set_xlabel('${xLabel}')
ax.set_ylabel('${yLabel}')
` : chartType === "count" ? `
sns.countplot(data=df, x='${x}', ${hue ? `hue='${hue}',` : ""} ax=ax)
ax.set_xlabel('${xLabel}')
ax.set_ylabel('Count')
` : chartType === "pairplot" ? `
g = sns.pairplot(df.select_dtypes(include=[np.number]))
g.savefig('${outputPath}')
plt.close()
output({"ok": True, "path": "${outputPath}", "chartType": "pairplot"})
` : chartType === "wordcloud" ? `
try:
    from wordcloud import WordCloud
    wordcloud = WordCloud(width=${figsize[0] * 100}, height=${figsize[1] * 100}).generate('${(text || "").replace(/'/g, "\\'")}')
    plt.figure(figsize=(${figsize[0]}, ${figsize[1]}))
    plt.imshow(wordcloud, interpolation='bilinear')
    plt.axis('off')
    plt.savefig('${outputPath}', bbox_inches='tight', dpi=100)
    plt.close()
    output({"ok": True, "path": "${outputPath}", "chartType": "wordcloud"})
except ImportError:
    output({"ok": False, "error": "wordcloud package not installed. Run: pip install wordcloud"})
` : `
ax.plot(df['${x}'], df['${y}'])
ax.set_xlabel('${xLabel}')
ax.set_ylabel('${yLabel}')
`}

${title && chartType !== "heatmap" && chartType !== "correlation" ? `ax.set_title('${title}')` : ""}
${showGrid ? "ax.grid(True, alpha=0.3)" : ""}
${showLegend && hue ? "ax.legend()" : ""}

plt.tight_layout()
plt.savefig('${outputPath}', dpi=100, bbox_inches='tight')
plt.close()

output({"ok": True, "path": "${outputPath}", "chartType": "${chartType}", "interactive": False})
`;

    const result = await execPython(code);
    const parsed = parseResult(result);
    if (parsed.ok) {
      parsed.outputPath = outputPath;
    }
    return parsed;
  }
};
