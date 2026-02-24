import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const skill = {
  id: "feature-engineering",
  name: "Feature Engineering",
  description: "Feature engineering for ML - create, transform, select features. Encoding, scaling, binning, polynomial features, feature selection, dimensionality reduction.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["encode", "scale", "bin", "polynomial", "select", "pca", "interactions", "transform", "extract_date", "extract_text", "aggregate", "lag", "rolling", "diff", "impute", "outliers", "normalize"],
        description: "Feature engineering action"
      },
      data: { type: "string", description: "Input data file path" },
      output: { type: "string", description: "Output file path" },
      columns: { type: "array", items: { type: "string" }, description: "Columns to process" },
      target: { type: "string", description: "Target column for supervised selection" },
      method: { type: "string", description: "Method to use" },
      nComponents: { type: "number", description: "Number of components for PCA" },
      degree: { type: "number", description: "Polynomial degree" },
      bins: { type: "number", description: "Number of bins" },
      strategy: { type: "string", description: "Strategy for imputation/binning" },
      window: { type: "number", description: "Window size for rolling operations" },
      lags: { type: "number", description: "Number of lag features" },
      threshold: { type: "number", description: "Threshold for feature selection" },
      k: { type: "number", description: "Top K features to select" },
      options: { type: "object", additionalProperties: true }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const data = input?.data;
    const output = input?.output;
    const columns = input?.columns || [];
    const target = input?.target;
    const method = input?.method || "standard";
    const nComponents = input?.nComponents || 2;
    const degree = input?.degree || 2;
    const bins = input?.bins || 5;
    const strategy = input?.strategy || "mean";
    const window = input?.window || 3;
    const lags = input?.lags || 3;
    const threshold = input?.threshold || 0.05;
    const k = input?.k || 10;
    const options = input?.options || {};

    const outputDir = path.join(workspaceRoot, "output", "features");
    await mkdir(outputDir, { recursive: true });

    const execPython = (code, timeoutMs = 180000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn("uv", ["run", "--with", "pandas", "--with", "numpy", "--with", "scikit-learn", "python", "-c", code], {
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

    if (!data) throw new Error("data is required");

    const dataPath = path.resolve(workspaceRoot, data).replace(/\\/g, "/");
    const outputPath = output ? path.resolve(workspaceRoot, output).replace(/\\/g, "/") : path.join(outputDir, `features_${action}_${Date.now()}.csv`).replace(/\\/g, "/");

    const baseCode = `
import pandas as pd
import numpy as np
import json
import warnings
warnings.filterwarnings('ignore')

def output(data):
    print(json.dumps(data, default=str))

df = pd.read_csv("${dataPath}")
original_cols = list(df.columns)
`;

    switch (action) {
      case "encode": {
        const code = `${baseCode}
from sklearn.preprocessing import LabelEncoder, OneHotEncoder
import pandas as pd

cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.select_dtypes(include=['object', 'category']).columns.tolist()"}

if '${method}' == 'onehot':
    df = pd.get_dummies(df, columns=cols, prefix=cols)
elif '${method}' == 'label':
    le = LabelEncoder()
    for col in cols:
        if col in df.columns:
            df[col] = le.fit_transform(df[col].astype(str))
elif '${method}' == 'frequency':
    for col in cols:
        if col in df.columns:
            freq = df[col].value_counts(normalize=True)
            df[col] = df[col].map(freq)
elif '${method}' == 'target':
    if '${target}':
        for col in cols:
            if col in df.columns:
                means = df.groupby(col)['${target}'].mean()
                df[col] = df[col].map(means)

df.to_csv("${outputPath}", index=False)
result = {"originalColumns": original_cols, "newColumns": list(df.columns), "encodedColumns": cols, "outputPath": "${outputPath}"}
output(result)
`;
        const result = parseResult(await execPython(code));
        if (result.ok) result.outputPath = outputPath;
        return result;
      }

      case "scale":
      case "normalize": {
        const code = `${baseCode}
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler, Normalizer

cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.select_dtypes(include=[np.number]).columns.tolist()"}

${method === "standard" ? "scaler = StandardScaler()" : method === "minmax" ? "scaler = MinMaxScaler()" : method === "robust" ? "scaler = RobustScaler()" : "scaler = Normalizer()"}

df[cols] = scaler.fit_transform(df[cols])

df.to_csv("${outputPath}", index=False)
result = {"scaledColumns": cols, "method": "${method}", "outputPath": "${outputPath}"}
output(result)
`;
        const result = parseResult(await execPython(code));
        if (result.ok) result.outputPath = outputPath;
        return result;
      }

      case "bin": {
        const code = `${baseCode}
cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.select_dtypes(include=[np.number]).columns.tolist()[:3]"}

for col in cols:
    if col in df.columns:
        if '${method}' == 'equal_width':
            df[f'{col}_binned'] = pd.cut(df[col], bins=${bins}, labels=False)
        elif '${method}' == 'equal_freq':
            df[f'{col}_binned'] = pd.qcut(df[col], q=${bins}, labels=False, duplicates='drop')
        elif '${method}' == 'kmeans':
            from sklearn.cluster import KMeans
            kmeans = KMeans(n_clusters=${bins}, random_state=42)
            df[f'{col}_binned'] = kmeans.fit_predict(df[[col]].fillna(df[col].mean()))

df.to_csv("${outputPath}", index=False)
result = {"binnedColumns": cols, "bins": ${bins}, "method": "${method}", "outputPath": "${outputPath}"}
output(result)
`;
        const result = parseResult(await execPython(code));
        if (result.ok) result.outputPath = outputPath;
        return result;
      }

      case "polynomial": {
        const code = `${baseCode}
from sklearn.preprocessing import PolynomialFeatures

cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.select_dtypes(include=[np.number]).columns.tolist()[:5]"}

poly = PolynomialFeatures(degree=${degree}, include_bias=False)
poly_features = poly.fit_transform(df[cols].fillna(0))

feature_names = poly.get_feature_names_out(cols)
poly_df = pd.DataFrame(poly_features, columns=feature_names, index=df.index)

df = pd.concat([df.drop(columns=cols), poly_df], axis=1)

df.to_csv("${outputPath}", index=False)
result = {"degree": ${degree}, "originalFeatures": cols, "newFeatureCount": len(feature_names), "outputPath": "${outputPath}"}
output(result)
`;
        const result = parseResult(await execPython(code));
        if (result.ok) result.outputPath = outputPath;
        return result;
      }

      case "select": {
        const code = `${baseCode}
from sklearn.feature_selection import SelectKBest, f_classif, f_regression, mutual_info_classif, RFE
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor

if not '${target}':
    result = {"error": "target column required for feature selection"}
    output(result)
    exit()

X = df.drop(columns=['${target}'])
y = df['${target}']

numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()
X = X[numeric_cols].fillna(0)

task = 'classification' if len(y.unique()) < 10 else 'regression'

${method === "kbest" ? `
selector = SelectKBest(f_classif if task == 'classification' else f_regression, k=${k})
selector.fit(X, y)
scores = selector.scores_
selected = X.columns[selector.get_support()].tolist()
` : method === "mutual_info" ? `
selector = SelectKBest(mutual_info_classif, k=${k})
selector.fit(X, y)
scores = selector.scores_
selected = X.columns[selector.get_support()].tolist()
` : method === "rfe" ? `
estimator = RandomForestClassifier(n_estimators=50, random_state=42) if task == 'classification' else RandomForestRegressor(n_estimators=50, random_state=42)
selector = RFE(estimator, n_features_to_select=${k})
selector.fit(X, y)
scores = selector.ranking_
selected = X.columns[selector.support_].tolist()
` : `
model = RandomForestClassifier(n_estimators=100, random_state=42) if task == 'classification' else RandomForestRegressor(n_estimators=100, random_state=42)
model.fit(X, y)
importances = pd.Series(model.feature_importances_, index=X.columns)
selected = importances.nlargest(${k}).index.tolist()
scores = importances.values
`}

feature_scores = dict(zip(X.columns.tolist(), [float(s) if s is not None else 0 for s in scores]))
sorted_scores = sorted(feature_scores.items(), key=lambda x: x[1], reverse=True)

result = {
    "selectedFeatures": selected,
    "featureScores": sorted_scores[:${k}],
    "method": "${method}",
    "k": ${k}
}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "pca": {
        const code = `${baseCode}
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.select_dtypes(include=[np.number]).columns.tolist()"}

X = df[cols].fillna(0)
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

pca = PCA(n_components=${nComponents})
X_pca = pca.fit_transform(X_scaled)

for i in range(${nComponents}):
    df[f'PC{i+1}'] = X_pca[:, i]

df.to_csv("${outputPath}", index=False)

explained_variance = pca.explained_variance_ratio_.tolist()
cumulative = np.cumsum(explained_variance).tolist()

result = {
    "nComponents": ${nComponents},
    "explainedVariance": explained_variance,
    "cumulativeVariance": cumulative,
    "components": pca.components_.tolist(),
    "outputPath": "${outputPath}"
}
output(result)
`;
        const result = parseResult(await execPython(code));
        if (result.ok) result.outputPath = outputPath;
        return result;
      }

      case "interactions": {
        const code = `${baseCode}
cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.select_dtypes(include=[np.number]).columns.tolist()[:5]"}

from itertools import combinations

new_features = []
for col1, col2 in combinations(cols, 2):
    df[f'{col1}_x_{col2}'] = df[col1] * df[col2]
    df[f'{col1}_div_{col2}'] = df[col1] / (df[col2] + 1e-8)
    new_features.extend([f'{col1}_x_{col2}', f'{col1}_div_{col2}'])

df.to_csv("${outputPath}", index=False)
result = {"interactionFeatures": new_features, "count": len(new_features), "outputPath": "${outputPath}"}
output(result)
`;
        const result = parseResult(await execPython(code));
        if (result.ok) result.outputPath = outputPath;
        return result;
      }

      case "transform": {
        const code = `${baseCode}
import numpy as np

cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.select_dtypes(include=[np.number]).columns.tolist()"}

for col in cols:
    if col not in df.columns:
        continue
    
${method === "log" ? `
    df[f'{col}_log'] = np.log1p(df[col].abs()) * np.sign(df[col])
` : method === "sqrt" ? `
    df[f'{col}_sqrt'] = np.sqrt(df[col].abs()) * np.sign(df[col])
` : method === "square" ? `
    df[f'{col}_sq'] = df[col] ** 2
` : method === "reciprocal" ? `
    df[f'{col}_recip'] = 1 / (df[col].abs() + 1e-8)
` : method === "boxcox" ? `
    from scipy.stats import boxcox
    df[f'{col}_boxcox'], _ = boxcox(df[col].abs() + 1)
` : `
    df[f'{col}_log'] = np.log1p(df[col].abs())
    df[f'{col}_sq'] = df[col] ** 2
`}

df.to_csv("${outputPath}", index=False)
result = {"transformedColumns": cols, "method": "${method}", "outputPath": "${outputPath}"}
output(result)
`;
        const result = parseResult(await execPython(code));
        if (result.ok) result.outputPath = outputPath;
        return result;
      }

      case "extract_date": {
        const code = `${baseCode}
cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.select_dtypes(include=['object']).columns.tolist()"}

import pandas as pd

for col in cols:
    if col not in df.columns:
        continue
    try:
        df[col] = pd.to_datetime(df[col], errors='coerce')
        if df[col].notna().sum() > 0:
            df[f'{col}_year'] = df[col].dt.year
            df[f'{col}_month'] = df[col].dt.month
            df[f'{col}_day'] = df[col].dt.day
            df[f'{col}_dayofweek'] = df[col].dt.dayofweek
            df[f'{col}_quarter'] = df[col].dt.quarter
            df[f'{col}_is_weekend'] = df[col].dt.dayofweek.isin([5, 6]).astype(int)
    except:
        pass

df.to_csv("${outputPath}", index=False)
result = {"processedColumns": cols, "outputPath": "${outputPath}"}
output(result)
`;
        const result = parseResult(await execPython(code));
        if (result.ok) result.outputPath = outputPath;
        return result;
      }

      case "extract_text": {
        const code = `${baseCode}
import re

cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.select_dtypes(include=['object']).columns.tolist()"}

for col in cols:
    if col not in df.columns:
        continue
    df[f'{col}_length'] = df[col].astype(str).str.len()
    df[f'{col}_word_count'] = df[col].astype(str).str.split().str.len()
    df[f'{col}_has_digits'] = df[col].astype(str).str.contains(r'\\d').astype(int)
    df[f'{col}_has_uppercase'] = df[col].astype(str).str.contains(r'[A-Z]').astype(int)
    df[f'{col}_digit_count'] = df[col].astype(str).str.count(r'\\d')

df.to_csv("${outputPath}", index=False)
result = {"processedColumns": cols, "outputPath": "${outputPath}"}
output(result)
`;
        const result = parseResult(await execPython(code));
        if (result.ok) result.outputPath = outputPath;
        return result;
      }

      case "lag": {
        const code = `${baseCode}
cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.select_dtypes(include=[np.number]).columns.tolist()[:5]"}

for col in cols:
    if col not in df.columns:
        continue
    for lag in range(1, ${lags + 1}):
        df[f'{col}_lag_{lag}'] = df[col].shift(lag)

df.to_csv("${outputPath}", index=False)
result = {"lagFeatures": [f'{col}_lag_{i}' for col in cols for i in range(1, ${lags + 1})], "lags": ${lags}, "outputPath": "${outputPath}"}
output(result)
`;
        const result = parseResult(await execPython(code));
        if (result.ok) result.outputPath = outputPath;
        return result;
      }

      case "rolling": {
        const code = `${baseCode}
cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.select_dtypes(include=[np.number]).columns.tolist()[:5]"}

for col in cols:
    if col not in df.columns:
        continue
    df[f'{col}_rolling_mean_${window}'] = df[col].rolling(window=${window}).mean()
    df[f'{col}_rolling_std_${window}'] = df[col].rolling(window=${window}).std()
    df[f'{col}_rolling_min_${window}'] = df[col].rolling(window=${window}).min()
    df[f'{col}_rolling_max_${window}'] = df[col].rolling(window=${window}).max()

df.to_csv("${outputPath}", index=False)
result = {"window": ${window}, "processedColumns": cols, "outputPath": "${outputPath}"}
output(result)
`;
        const result = parseResult(await execPython(code));
        if (result.ok) result.outputPath = outputPath;
        return result;
      }

      case "diff": {
        const code = `${baseCode}
cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.select_dtypes(include=[np.number]).columns.tolist()[:5]"}

for col in cols:
    if col not in df.columns:
        continue
    df[f'{col}_diff'] = df[col].diff()
    df[f'{col}_pct_change'] = df[col].pct_change()

df.to_csv("${outputPath}", index=False)
result = {"processedColumns": cols, "outputPath": "${outputPath}"}
output(result)
`;
        const result = parseResult(await execPython(code));
        if (result.ok) result.outputPath = outputPath;
        return result;
      }

      case "impute": {
        const code = `${baseCode}
from sklearn.impute import SimpleImputer, KNNImputer

cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.columns.tolist()"}

${strategy === "knn" ? `
imputer = KNNImputer(n_neighbors=5)
df[cols] = imputer.fit_transform(df[cols])
` : `
imputer = SimpleImputer(strategy='${strategy}')
numeric_cols = df[cols].select_dtypes(include=[np.number]).columns.tolist()
if numeric_cols:
    df[numeric_cols] = imputer.fit_transform(df[numeric_cols])
`}

null_count = df.isna().sum().sum()

df.to_csv("${outputPath}", index=False)
result = {"strategy": "${strategy}", "remainingNulls": int(null_count), "outputPath": "${outputPath}"}
output(result)
`;
        const result = parseResult(await execPython(code));
        if (result.ok) result.outputPath = outputPath;
        return result;
      }

      case "outliers": {
        const code = `${baseCode}
cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.select_dtypes(include=[np.number]).columns.tolist()"}

outlier_info = {}
method = '${method || "iqr"}'

for col in cols:
    if col not in df.columns:
        continue
    
    Q1 = df[col].quantile(0.25)
    Q3 = df[col].quantile(0.75)
    IQR = Q3 - Q1
    
    lower = Q1 - 1.5 * IQR
    upper = Q3 + 1.5 * IQR
    
    outliers = ((df[col] < lower) | (df[col] > upper)).sum()
    outlier_info[col] = {"count": int(outliers), "lower": float(lower), "upper": float(upper)}
    
    if method == 'clip':
        df[col] = df[col].clip(lower, upper)
    elif method == 'remove':
        df = df[(df[col] >= lower) & (df[col] <= upper)]

df.to_csv("${outputPath}", index=False)
result = {"outlierInfo": outlier_info, "method": method, "outputPath": "${outputPath}"}
output(result)
`;
        const result = parseResult(await execPython(code));
        if (result.ok) result.outputPath = outputPath;
        return result;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
};
