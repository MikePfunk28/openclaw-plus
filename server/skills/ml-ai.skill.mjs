import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export const skill = {
  id: "ml-ai",
  name: "Machine Learning & AI",
  description: "ML/AI operations - train models, evaluate, hyperparameter tuning, feature importance, predictions. Supports scikit-learn, XGBoost, PyTorch, TensorFlow.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["train", "predict", "evaluate", "tune", "feature_importance", "cross_validate", "save", "load", "list", "delete", "compare", "pipeline", "embed", "classify", "regress", "cluster", "auto_ml"],
        description: "ML action to perform"
      },
      model: {
        type: "string",
        description: "Model type or path"
      },
      modelPath: {
        type: "string",
        description: "Path to save/load model"
      },
      data: {
        type: "string",
        description: "Training data file path"
      },
      target: {
        type: "string",
        description: "Target column name"
      },
      features: {
        type: "array",
        description: "Feature columns",
        items: { type: "string" }
      },
      taskType: {
        type: "string",
        enum: ["classification", "regression", "clustering", "embedding"],
        description: "Type of ML task"
      },
      algorithm: {
        type: "string",
        description: "Algorithm to use (random_forest, xgboost, logistic_regression, etc.)"
      },
      hyperparameters: {
        type: "object",
        description: "Model hyperparameters"
      },
      input: {
        type: "object",
        description: "Input data for prediction"
      },
      inputs: {
        type: "array",
        description: "Multiple inputs for batch prediction"
      },
      testSize: {
        type: "number",
        description: "Test set proportion"
      },
      cv: {
        type: "number",
        description: "Cross-validation folds"
      },
      metrics: {
        type: "array",
        description: "Metrics to compute",
        items: { type: "string" }
      },
      randomState: {
        type: "number",
        description: "Random seed"
      },
      normalize: {
        type: "boolean",
        description: "Normalize features"
      },
      maxFeatures: {
        type: "number",
        description: "Max features for feature importance"
      },
      searchSpace: {
        type: "object",
        description: "Hyperparameter search space for tuning"
      },
      nTrials: {
        type: "number",
        description: "Number of trials for hyperparameter search"
      },
      options: {
        type: "object",
        description: "Additional options",
        additionalProperties: true
      }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const model = input?.model;
    const modelPath = input?.modelPath;
    const data = input?.data;
    const target = input?.target;
    const features = input?.features;
    const taskType = input?.taskType || "classification";
    const algorithm = input?.algorithm || "random_forest";
    const hyperparameters = input?.hyperparameters || {};
    const inputData = input?.input;
    const inputsData = input?.inputs;
    const testSize = input?.testSize || 0.2;
    const cv = input?.cv || 5;
    const metrics = input?.metrics || ["accuracy", "precision", "recall", "f1"];
    const randomState = input?.randomState || 42;
    const normalize = input?.normalize !== false;
    const maxFeatures = input?.maxFeatures || 20;
    const searchSpace = input?.searchSpace || {};
    const nTrials = input?.nTrials || 50;
    const options = input?.options || {};

    const modelsDir = path.join(workspaceRoot, "models");
    const outputDir = path.join(workspaceRoot, "output");
    await mkdir(modelsDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    const execPython = (code, timeoutMs = 300000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn("uv", ["run", "--with", "pandas", "--with", "numpy", "--with", "scikit-learn", "--with", "xgboost", "--with", "joblib", "python", "-c", code], {
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

    const getDataPath = (p) => {
      if (!p) return null;
      return path.resolve(workspaceRoot, p).replace(/\\/g, "/");
    };

    const baseCode = `
import pandas as pd
import numpy as np
import json
import sys
import os
import pickle
import joblib
from datetime import datetime

def json_serialize(obj):
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, (np.int64, np.int32)):
        return int(obj)
    if isinstance(obj, (np.float64, np.float32)):
        return float(obj)
    if pd.isna(obj):
        return None
    return str(obj)

def output(data):
    print(json.dumps(data, default=json_serialize))
`;

    const algorithms = {
      classification: {
        logistic_regression: "LogisticRegression(random_state=42, max_iter=1000)",
        random_forest: "RandomForestClassifier(random_state=42, n_estimators=100)",
        gradient_boosting: "GradientBoostingClassifier(random_state=42)",
        xgboost: "XGBClassifier(random_state=42, use_label_encoder=False, eval_metric='logloss')",
        svm: "SVC(random_state=42)",
        knn: "KNeighborsClassifier()",
        decision_tree: "DecisionTreeClassifier(random_state=42)",
        naive_bayes: "GaussianNB()",
        mlp: "MLPClassifier(random_state=42, max_iter=1000)"
      },
      regression: {
        linear: "LinearRegression()",
        ridge: "Ridge(random_state=42)",
        lasso: "Lasso(random_state=42)",
        random_forest: "RandomForestRegressor(random_state=42, n_estimators=100)",
        gradient_boosting: "GradientBoostingRegressor(random_state=42)",
        xgboost: "XGBRegressor(random_state=42)",
        svm: "SVR()",
        knn: "KNeighborsRegressor()",
        decision_tree: "DecisionTreeRegressor(random_state=42)",
        mlp: "MLPRegressor(random_state=42, max_iter=1000)"
      },
      clustering: {
        kmeans: "KMeans(random_state=42, n_init=10)",
        dbscan: "DBSCAN()",
        agglomerative: "AgglomerativeClustering()",
        gaussian_mixture: "GaussianMixture(random_state=42)"
      }
    };

    switch (action) {
      case "list": {
        try {
          const files = await readdir(modelsDir);
          const modelFiles = files.filter(f => f.endsWith(".pkl") || f.endsWith(".joblib") || f.endsWith(".pt") || f.endsWith(".h5"));
          const models = [];
          for (const f of modelFiles) {
            const stat_ = await stat(path.join(modelsDir, f));
            models.push({
              name: f,
              path: path.join(modelsDir, f),
              size: stat_.size,
              modified: stat_.mtime
            });
          }
          return { ok: true, models, count: models.length };
        } catch (err) {
          return { ok: true, models: [], count: 0 };
        }
      }

      case "delete": {
        if (!modelPath) throw new Error("modelPath is required");
        const fullPath = path.resolve(workspaceRoot, modelPath);
        if (existsSync(fullPath)) {
          await unlink(fullPath);
          return { ok: true, deleted: fullPath };
        }
        return { ok: false, error: "Model not found" };
      }

      case "train": {
        if (!data) throw new Error("data is required");
        if (!target) throw new Error("target is required");
        
        const dataPath = getDataPath(data);
        const outputPath = modelPath || path.join(modelsDir, `model_${algorithm}_${Date.now()}.joblib`);
        
        const hpCode = Object.entries(hyperparameters).map(([k, v]) => {
          if (typeof v === "string") return `${k}='${v}'`;
          return `${k}=${v}`;
        }).join(", ");
        
        const modelClass = algorithms[taskType]?.[algorithm] || algorithms.classification.random_forest;
        const modelInit = hpCode ? `${modelClass.replace(")", `, ${hpCode})`)}` : modelClass;
        
        const code = `${baseCode}
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, mean_squared_error, mean_absolute_error, r2_score
${taskType === "classification" ? "from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier" : ""}
${taskType === "regression" ? "from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor" : ""}
${taskType === "clustering" ? "from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering" : ""}
from sklearn.linear_model import LogisticRegression, LinearRegression, Ridge, Lasso
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.svm import SVC, SVR
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.naive_bayes import GaussianNB
import joblib

try:
    from xgboost import XGBClassifier, XGBRegressor
except:
    pass

df = pd.read_csv("${dataPath}")
${features ? `feature_cols = ${JSON.stringify(features)}` : `feature_cols = [c for c in df.columns if c != '${target}']`}

X = df[feature_cols].values
y = df['${target}'].values

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=${testSize}, random_state=${randomState})

${normalize ? `
scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)
X_test = scaler.transform(X_test)
` : ""}

model = ${modelInit}
model.fit(X_train, y_train)

y_pred = model.predict(X_test)

results = {
    "algorithm": "${algorithm}",
    "taskType": "${taskType}",
    "features": feature_cols,
    "target": "${target}",
    "trainSamples": len(X_train),
    "testSamples": len(X_test)
}

${taskType === "classification" ? `
results["metrics"] = {
    "accuracy": float(accuracy_score(y_test, y_pred)),
    "precision": float(precision_score(y_test, y_pred, average='weighted', zero_division=0)),
    "recall": float(recall_score(y_test, y_pred, average='weighted', zero_division=0)),
    "f1": float(f1_score(y_test, y_pred, average='weighted', zero_division=0))
}
` : taskType === "regression" ? `
results["metrics"] = {
    "mse": float(mean_squared_error(y_test, y_pred)),
    "rmse": float(np.sqrt(mean_squared_error(y_test, y_pred))),
    "mae": float(mean_absolute_error(y_test, y_pred)),
    "r2": float(r2_score(y_test, y_pred))
}
` : `
results["metrics"] = {
    "silhouette": float(silhouette_score(X_test, y_pred)) if len(set(y_pred)) > 1 else None
}
`}

joblib.dump({"model": model, "scaler": scaler if ${normalize} else None, "features": feature_cols}, "${outputPath}")
results["modelPath"] = "${outputPath}"

output(results)
`;
        return parseResult(await execPython(code, 600000));
      }

      case "predict": {
        if (!modelPath && !model) throw new Error("modelPath or model is required");
        const mp = modelPath ? path.resolve(workspaceRoot, modelPath) : path.join(modelsDir, model);
        
        if (!existsSync(mp)) {
          return { ok: false, error: `Model not found: ${mp}` };
        }
        
        const predictData = inputsData || (inputData ? [inputData] : null);
        if (!predictData) throw new Error("input or inputs is required");
        
        const code = `${baseCode}
import joblib

loaded = joblib.load("${mp}")
model = loaded["model"]
scaler = loaded.get("scaler")
features = loaded.get("features")

data = ${JSON.stringify(predictData)}
df = pd.DataFrame(data)

${features ? `df = df[features]` : ""}

${normalize && scaler ? `X = scaler.transform(df.values)` : "X = df.values"}

predictions = model.predict(X).tolist()

${model.predict_proba ? "probabilities = model.predict_proba(X).tolist()" : ""}

result = {
    "predictions": predictions,
    ${normalize && scaler ? '"probabilities": probabilities,' : ""}
    "count": len(predictions)
}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "evaluate": {
        if (!data) throw new Error("data is required");
        if (!modelPath) throw new Error("modelPath is required");
        
        const mp = path.resolve(workspaceRoot, modelPath);
        const dataPath = getDataPath(data);
        
        const code = `${baseCode}
import joblib
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, mean_squared_error, mean_absolute_error, r2_score, confusion_matrix, classification_report

loaded = joblib.load("${mp}")
model = loaded["model"]
scaler = loaded.get("scaler")
features = loaded.get("features")

df = pd.read_csv("${dataPath}")
${target ? `
X = df[features].values if features else df.drop(columns=['${target}']).values
y_true = df['${target}'].values
${scaler ? "X = scaler.transform(X)" : ""}

y_pred = model.predict(X)

${taskType === "classification" ? `
result = {
    "metrics": {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, average='weighted', zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, average='weighted', zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, average='weighted', zero_division=0))
    },
    "confusionMatrix": confusion_matrix(y_true, y_pred).tolist(),
    "classificationReport": classification_report(y_true, y_pred, output_dict=True)
}
` : `
result = {
    "metrics": {
        "mse": float(mean_squared_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "r2": float(r2_score(y_true, y_pred))
    }
}
`}
` : `
result = {"error": "target column required for evaluation"}
`}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "feature_importance": {
        if (!modelPath) throw new Error("modelPath is required");
        
        const mp = path.resolve(workspaceRoot, modelPath);
        
        const code = `${baseCode}
import joblib

loaded = joblib.load("${mp}")
model = loaded["model"]
features = loaded.get("features", [])

if hasattr(model, 'feature_importances_'):
    importances = model.feature_importances_.tolist()
elif hasattr(model, 'coef_'):
    importances = np.abs(model.coef_).flatten().tolist()
else:
    importances = None

if importances and features:
    sorted_idx = np.argsort(importances)[::-1][:${maxFeatures}]
    result = {
        "featureImportance": [{"feature": features[i], "importance": importances[i]} for i in sorted_idx],
        "hasImportance": True
    }
else:
    result = {"hasImportance": False, "message": "Model does not support feature importance"}

output(result)
`;
        return parseResult(await execPython(code));
      }

      case "cross_validate": {
        if (!data) throw new Error("data is required");
        if (!target) throw new Error("target is required");
        
        const dataPath = getDataPath(data);
        const modelClass = algorithms[taskType]?.[algorithm] || algorithms.classification.random_forest;
        
        const code = `${baseCode}
from sklearn.model_selection import cross_val_score, StratifiedKFold, KFold
from sklearn.preprocessing import StandardScaler
${taskType === "classification" ? "from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier" : "from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor"}
from sklearn.linear_model import LogisticRegression, LinearRegression, Ridge
from sklearn.pipeline import make_pipeline

df = pd.read_csv("${dataPath}")
${features ? `feature_cols = ${JSON.stringify(features)}` : `feature_cols = [c for c in df.columns if c != '${target}']`}

X = df[feature_cols].values
y = df['${target}'].values

model = ${modelClass}
${normalize ? `pipeline = make_pipeline(StandardScaler(), model)` : "pipeline = model"}

scoring = ${taskType === "classification" ? "'f1_weighted'" : "'r2'"}
${taskType === "classification" ? `cv = StratifiedKFold(n_splits=${cv}, shuffle=True, random_state=${randomState})` : `cv = KFold(n_splits=${cv}, shuffle=True, random_state=${randomState})`}

scores = cross_val_score(pipeline, X, y, cv=cv, scoring=scoring)

result = {
    "cvScores": scores.tolist(),
    "meanScore": float(scores.mean()),
    "stdScore": float(scores.std()),
    "folds": ${cv},
    "algorithm": "${algorithm}"
}
output(result)
`;
        return parseResult(await execPython(code, 600000));
      }

      case "tune": {
        if (!data) throw new Error("data is required");
        if (!target) throw new Error("target is required");
        if (!searchSpace || Object.keys(searchSpace).length === 0) {
          throw new Error("searchSpace is required for tuning");
        }
        
        const dataPath = getDataPath(data);
        const modelClass = algorithms[taskType]?.[algorithm] || algorithms.classification.random_forest;
        const searchSpaceCode = Object.entries(searchSpace).map(([k, v]) => `'${k}': ${JSON.stringify(v)}`).join(", ");
        
        const code = `${baseCode}
from sklearn.model_selection import RandomizedSearchCV, train_test_split
from sklearn.preprocessing import StandardScaler
${taskType === "classification" ? "from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier" : "from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor"}
from sklearn.pipeline import Pipeline
import joblib

df = pd.read_csv("${dataPath}")
${features ? `feature_cols = ${JSON.stringify(features)}` : `feature_cols = [c for c in df.columns if c != '${target}']`}

X = df[feature_cols].values
y = df['${target}'].values

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=${testSize}, random_state=${randomState})

param_dist = {${searchSpaceCode}}

${normalize ? `
pipeline = Pipeline([
    ('scaler', StandardScaler()),
    ('model', ${modelClass})
])
param_dist = {f'model__{k}': v for k, v in param_dist.items()}
` : `pipeline = ${modelClass}`}

search = RandomizedSearchCV(pipeline, param_dist, n_iter=${nTrials}, cv=${cv}, random_state=${randomState}, n_jobs=-1, verbose=0)
search.fit(X_train, y_train)

best_model = search.best_estimator_
y_pred = best_model.predict(${normalize ? "X_test" : "X_test"})

${taskType === "classification" ? `
from sklearn.metrics import accuracy_score, f1_score
score = float(accuracy_score(y_test, y_pred))
` : `
from sklearn.metrics import r2_score
score = float(r2_score(y_test, y_pred))
`}

output_path = "${path.join(modelsDir, `tuned_${algorithm}_${Date.now()}.joblib`)}"
joblib.dump({"model": best_model, "params": search.best_params_}, output_path)

result = {
    "bestParams": search.best_params_,
    "bestScore": float(search.best_score_),
    "testScore": score,
    "nTrials": ${nTrials},
    "modelPath": output_path
}
output(result)
`;
        return parseResult(await execPython(code, 900000));
      }

      case "save": {
        return { ok: false, error: "Use train action with modelPath to save models" };
      }

      case "load": {
        if (!modelPath) throw new Error("modelPath is required");
        const mp = path.resolve(workspaceRoot, modelPath);
        
        if (!existsSync(mp)) {
          return { ok: false, error: `Model not found: ${mp}` };
        }
        
        const code = `${baseCode}
import joblib

loaded = joblib.load("${mp}")
result = {
    "loaded": True,
    "modelType": type(loaded.get("model", loaded)).__name__,
    "features": loaded.get("features", []),
    "path": "${mp}"
}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "cluster": {
        if (!data) throw new Error("data is required");
        
        const dataPath = getDataPath(data);
        const nClusters = hyperparameters.nClusters || hyperparameters.n_clusters || 3;
        const alg = algorithm || "kmeans";
        
        const code = `${baseCode}
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score

df = pd.read_csv("${dataPath}")
${features ? `feature_cols = ${JSON.stringify(features)}` : "feature_cols = df.columns.tolist()"}

X = df[feature_cols].values

${normalize ? `scaler = StandardScaler(); X = scaler.fit_transform(X)` : ""}

${alg === "kmeans" ? `model = KMeans(n_clusters=${nClusters}, random_state=${randomState}, n_init=10)` : 
  alg === "dbscan" ? `model = DBSCAN(eps=${hyperparameters.eps || 0.5}, min_samples=${hyperparameters.minSamples || 5})` :
  alg === "agglomerative" ? `model = AgglomerativeClustering(n_clusters=${nClusters})` :
  `model = GaussianMixture(n_components=${nClusters}, random_state=${randomState})`}

${alg === "gaussian_mixture" ? `labels = model.fit_predict(X)` : `model.fit(X); labels = model.labels_`}

n_clusters_found = len(set(labels)) - (1 if -1 in labels else 0)

silhouette = None
if n_clusters_found > 1:
    try:
        silhouette = float(silhouette_score(X, labels))
    except:
        pass

result = {
    "algorithm": "${alg}",
    "nClusters": n_clusters_found,
    "labels": labels.tolist(),
    "silhouette": silhouette,
    "clusterSizes": dict(pd.Series(labels).value_counts().to_dict())
}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "embed": {
        if (!data) throw new Error("data is required");
        
        const dataPath = getDataPath(data);
        const method = options.method || "pca";
        const nComponents = options.nComponents || 2;
        
        const code = `${baseCode}
from sklearn.decomposition import PCA, TruncatedSVD
from sklearn.manifold import TSNE
from sklearn.preprocessing import StandardScaler

df = pd.read_csv("${dataPath}")
${features ? `feature_cols = ${JSON.stringify(features)}` : `feature_cols = df.select_dtypes(include=[np.number]).columns.tolist()`}

X = df[feature_cols].values

${normalize ? `scaler = StandardScaler(); X = scaler.fit_transform(X)` : ""}

${method === "pca" ? `embedder = PCA(n_components=${nComponents}, random_state=${randomState})` :
  method === "tsne" ? `embedder = TSNE(n_components=${nComponents}, random_state=${randomState})` :
  `embedder = TruncatedSVD(n_components=${nComponents}, random_state=${randomState})`}

embeddings = embedder.fit_transform(X)

${method === "pca" ? `variance = embedder.explained_variance_ratio_.tolist()` : "variance = None"}

result = {
    "method": "${method}",
    "nComponents": ${nComponents},
    "embeddings": embeddings.tolist(),
    ${variance ? `"explainedVariance": variance,` : ""}
    "shape": list(embeddings.shape)
}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "auto_ml": {
        if (!data) throw new Error("data is required");
        if (!target) throw new Error("target is required");
        
        const dataPath = getDataPath(data);
        const timeBudget = options.timeBudget || 60;
        
        const code = `${baseCode}
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import LogisticRegression, LinearRegression, Ridge
from sklearn.svm import SVC, SVR
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.metrics import accuracy_score, f1_score, r2_score, mean_squared_error
import joblib
import time

df = pd.read_csv("${dataPath}")
${features ? `feature_cols = ${JSON.stringify(features)}` : `feature_cols = [c for c in df.columns if c != '${target}']`}

X = df[feature_cols].values
y = df['${target}'].values

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=${testSize}, random_state=${randomState})

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

task_type = "${taskType}"

${taskType === "classification" ? `
models = {
    "logistic_regression": LogisticRegression(random_state=42, max_iter=1000),
    "random_forest": RandomForestClassifier(random_state=42, n_estimators=100),
    "gradient_boosting": GradientBoostingClassifier(random_state=42),
    "knn": KNeighborsClassifier(),
}
scoring = lambda y_true, y_pred: accuracy_score(y_true, y_pred)
score_name = "accuracy"
` : `
models = {
    "linear_regression": LinearRegression(),
    "ridge": Ridge(random_state=42),
    "random_forest": RandomForestRegressor(random_state=42, n_estimators=100),
    "gradient_boosting": GradientBoostingRegressor(random_state=42),
    "knn": KNeighborsRegressor(),
}
scoring = lambda y_true, y_pred: r2_score(y_true, y_pred)
score_name = "r2"
`}

results = []
best_score = -float('inf')
best_model = None
best_name = None

start_time = time.time()
for name, model in models.items():
    if time.time() - start_time > ${timeBudget}:
        break
    try:
        model.fit(X_train_scaled, y_train)
        y_pred = model.predict(X_test_scaled)
        score = scoring(y_test, y_pred)
        results.append({"model": name, score_name: float(score)})
        if score > best_score:
            best_score = score
            best_model = model
            best_name = name
    except Exception as e:
        results.append({"model": name, "error": str(e)})

output_path = "${path.join(modelsDir, `automl_best_${Date.now()}.joblib`)}"
joblib.dump({"model": best_model, "scaler": scaler, "features": feature_cols, "algorithm": best_name}, output_path)

result = {
    "results": sorted(results, key=lambda x: x.get(score_name, -float('inf')), reverse=True),
    "bestModel": best_name,
    "bestScore": float(best_score),
    "modelPath": output_path
}
output(result)
`;
        return parseResult(await execPython(code, (timeBudget + 60) * 1000));
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
};
