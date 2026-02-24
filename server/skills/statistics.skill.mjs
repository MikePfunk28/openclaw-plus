import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const skill = {
  id: "statistics",
  name: "Statistical Analysis",
  description: "Statistical analysis - descriptive stats, hypothesis testing, correlation, regression, ANOVA, chi-square, t-tests, distributions.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["describe", "correlation", "ttest", "anova", "chi_square", "regression", "normality", "distribution", "percentile", "zscore", "confidence_interval", "effect_size", "power_analysis", "multiple_comparison", "time_series_decompose", "autocorrelation", "granger_causality"],
        description: "Statistical action"
      },
      data: { type: "string", description: "Data file path" },
      columns: { type: "array", items: { type: "string" } },
      column: { type: "string", description: "Primary column" },
      column2: { type: "string", description: "Second column for comparisons" },
      groupBy: { type: "string", description: "Grouping column" },
      target: { type: "string", description: "Target variable" },
      predictors: { type: "array", items: { type: "string" } },
      testType: { type: "string", description: "Type of test (one-sample, two-sample, paired)" },
      alpha: { type: "number", description: "Significance level" },
      alternative: { type: "string", description: "Alternative hypothesis (two-sided, less, greater)" },
      percentiles: { type: "array", items: { type: "number" } },
      mu: { type: "number", description: "Population mean for one-sample test" },
      options: { type: "object", additionalProperties: true }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const data = input?.data;
    const columns = input?.columns || [];
    const column = input?.column;
    const column2 = input?.column2;
    const groupBy = input?.groupBy;
    const target = input?.target;
    const predictors = input?.predictors || [];
    const testType = input?.testType || "two-sample";
    const alpha = input?.alpha || 0.05;
    const alternative = input?.alternative || "two-sided";
    const percentiles = input?.percentiles || [25, 50, 75, 90, 95, 99];
    const mu = input?.mu;
    const options = input?.options || {};

    const outputDir = path.join(workspaceRoot, "output", "stats");
    await mkdir(outputDir, { recursive: true });

    const execPython = (code, timeoutMs = 120000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn("uv", ["run", "--with", "pandas", "--with", "numpy", "--with", "scipy", "--with", "scikit-learn", "python", "-c", code], {
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

    const baseCode = `
import pandas as pd
import numpy as np
import json
from scipy import stats
import warnings
warnings.filterwarnings('ignore')

def output(data):
    print(json.dumps(data, default=lambda x: float(x) if hasattr(x, '__float__') else str(x)))

df = pd.read_csv("${dataPath}")
`;

    switch (action) {
      case "describe": {
        const code = `${baseCode}
cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.select_dtypes(include=[np.number]).columns.tolist()"}

stats_dict = {}
for col in cols:
    if col not in df.columns:
        continue
    data = df[col].dropna()
    stats_dict[col] = {
        "count": int(len(data)),
        "mean": float(data.mean()),
        "std": float(data.std()),
        "min": float(data.min()),
        "q1": float(data.quantile(0.25)),
        "median": float(data.median()),
        "q3": float(data.quantile(0.75)),
        "max": float(data.max()),
        "skewness": float(data.skew()),
        "kurtosis": float(data.kurtosis()),
        "iqr": float(data.quantile(0.75) - data.quantile(0.25)),
        "cv": float(data.std() / data.mean() * 100) if data.mean() != 0 else None,
        "missing": int(df[col].isna().sum())
    }

output({"statistics": stats_dict, "columns": list(stats_dict.keys())})
`;
        return parseResult(await execPython(code));
      }

      case "correlation": {
        const code = `${baseCode}
cols = ${columns.length > 0 ? JSON.stringify(columns) : "df.select_dtypes(include=[np.number]).columns.tolist()"}

data = df[cols].dropna()

pearson = data.corr(method='pearson').to_dict()
spearman = data.corr(method='spearman').to_dict()

strong_correlations = []
for i, col1 in enumerate(cols):
    for col2 in cols[i+1:]:
        r = abs(pearson.get(col1, {}).get(col2, 0))
        if r > 0.5:
            strong_correlations.append({"pair": [col1, col2], "correlation": pearson[col1][col2]})

output({
    "pearson": pearson,
    "spearman": spearman,
    "strongCorrelations": sorted(strong_correlations, key=lambda x: abs(x["correlation"]), reverse=True)[:10]
})
`;
        return parseResult(await execPython(code));
      }

      case "ttest": {
        if (!column) throw new Error("column is required for t-test");
        
        const code = `${baseCode}
col = '${column}'

${testType === "one-sample" ? `
data = df[col].dropna()
mu = ${mu !== undefined ? mu : "data.mean()"}
t_stat, p_value = stats.ttest_1samp(data, mu)

result = {
    "testType": "one-sample",
    "column": col,
    "sampleMean": float(data.mean()),
    "populationMean": float(mu),
    "tStatistic": float(t_stat),
    "pValue": float(p_value),
    "significant": p_value < ${alpha},
    "alpha": ${alpha}
}
` : testType === "paired" && column2 ? `
data1 = df[col].dropna()
data2 = df['${column2}'].dropna()
min_len = min(len(data1), len(data2))
t_stat, p_value = stats.ttest_rel(data1[:min_len], data2[:min_len])

result = {
    "testType": "paired",
    "column1": col,
    "column2": "${column2}",
    "mean1": float(data1.mean()),
    "mean2": float(data2.mean()),
    "meanDifference": float(data1.mean() - data2.mean()),
    "tStatistic": float(t_stat),
    "pValue": float(p_value),
    "significant": p_value < ${alpha},
    "alpha": ${alpha}
}
` : groupBy ? `
groups = df.groupby('${groupBy}')[col].apply(list).to_dict()
group_names = list(groups.keys())

if len(group_names) >= 2:
    t_stat, p_value = stats.ttest_ind(groups[group_names[0]], groups[group_names[1]], equal_var=False)
    result = {
        "testType": "independent",
        "column": col,
        "groupBy": "${groupBy}",
        "group1": group_names[0],
        "group2": group_names[1],
        "mean1": float(np.mean(groups[group_names[0]])),
        "mean2": float(np.mean(groups[group_names[1]])),
        "tStatistic": float(t_stat),
        "pValue": float(p_value),
        "significant": p_value < ${alpha},
        "alpha": ${alpha}
    }
else:
    result = {"error": "Need at least 2 groups for t-test"}
` : column2 ? `
data1 = df[col].dropna()
data2 = df['${column2}'].dropna()
t_stat, p_value = stats.ttest_ind(data1, data2, equal_var=False)

result = {
    "testType": "independent",
    "column1": col,
    "column2": "${column2}",
    "mean1": float(data1.mean()),
    "mean2": float(data2.mean()),
    "tStatistic": float(t_stat),
    "pValue": float(p_value),
    "significant": p_value < ${alpha},
    "alpha": ${alpha}
}
` : `
result = {"error": "Specify column2 or groupBy for two-sample test"}
`}

output(result)
`;
        return parseResult(await execPython(code));
      }

      case "anova": {
        if (!column) throw new Error("column is required for ANOVA");
        if (!groupBy) throw new Error("groupBy is required for ANOVA");
        
        const code = `${baseCode}
groups = df.groupby('${groupBy}')['${column}'].apply(list).to_dict()
group_list = [g for g in groups.values() if len(g) > 1]

if len(group_list) >= 2:
    f_stat, p_value = stats.f_oneway(*group_list)
    
    ss_between = sum(len(g) * (np.mean(g) - df['${column}'].mean())**2 for g in group_list)
    ss_within = sum(sum((x - np.mean(g))**2 for x in g) for g in group_list)
    ss_total = ss_between + ss_within
    
    df_between = len(group_list) - 1
    df_within = sum(len(g) for g in group_list) - len(group_list)
    
    eta_squared = ss_between / ss_total if ss_total > 0 else 0
    
    group_stats = {name: {"mean": float(np.mean(g)), "std": float(np.std(g)), "n": len(g)} for name, g in groups.items()}
    
    result = {
        "fStatistic": float(f_stat),
        "pValue": float(p_value),
        "significant": p_value < ${alpha},
        "alpha": ${alpha},
        "dfBetween": int(df_between),
        "dfWithin": int(df_within),
        "ssBetween": float(ss_between),
        "ssWithin": float(ss_within),
        "etaSquared": float(eta_squared),
        "groupStats": group_stats
    }
else:
    result = {"error": "Need at least 2 groups with data"}

output(result)
`;
        return parseResult(await execPython(code));
      }

      case "chi_square": {
        if (!column || !column2) throw new Error("column and column2 are required for chi-square");
        
        const code = `${baseCode}
contingency = pd.crosstab(df['${column}'], df['${column2}'])
chi2, p_value, dof, expected = stats.chi2_contingency(contingency)

n = contingency.sum().sum()
cramers_v = np.sqrt(chi2 / (n * (min(contingency.shape) - 1))) if min(contingency.shape) > 1 else 0

result = {
    "chi2Statistic": float(chi2),
    "pValue": float(p_value),
    "degreesOfFreedom": int(dof),
    "significant": p_value < ${alpha},
    "alpha": ${alpha},
    "cramersV": float(cramers_v),
    "contingencyTable": contingency.to_dict(),
    "interpretation": "Variables are associated" if p_value < ${alpha} else "Variables are independent"
}

output(result)
`;
        return parseResult(await execPython(code));
      }

      case "regression": {
        if (!target) throw new Error("target is required for regression");
        
        const code = `${baseCode}
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_squared_error, accuracy_score
import numpy as np

target_col = '${target}'
pred_cols = ${predictors.length > 0 ? JSON.stringify(predictors) : "[c for c in df.select_dtypes(include=[np.number]).columns if c != target_col][:5]"}

data = df[[target_col] + pred_cols].dropna()
X = data[pred_cols]
y = data[target_col]

is_classification = len(y.unique()) < 10 and y.dtype == 'int64'

if is_classification:
    model = LogisticRegression(max_iter=1000)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    score = accuracy_score(y_test, y_pred)
    
    result = {
        "type": "logistic",
        "accuracy": float(score),
        "coefficients": dict(zip(pred_cols, model.coef_[0].tolist())),
        "intercept": float(model.intercept_[0]),
        "features": pred_cols
    }
else:
    model = LinearRegression()
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    
    result = {
        "type": "linear",
        "r2": float(r2_score(y_test, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_test, y_pred))),
        "coefficients": dict(zip(pred_cols, model.coef_.tolist())),
        "intercept": float(model.intercept_),
        "features": pred_cols
    }

output(result)
`;
        return parseResult(await execPython(code));
      }

      case "normality": {
        if (!column) throw new Error("column is required for normality test");
        
        const code = `${baseCode}
data = df['${column}'].dropna()

shapiro_stat, shapiro_p = stats.shapiro(data[:5000] if len(data) > 5000 else data)
dagostino_stat, dagostino_p = stats.normaltest(data)
anderson_result = stats.anderson(data)

skewness = stats.skew(data)
kurtosis = stats.kurtosis(data)

result = {
    "column": "${column}",
    "n": len(data),
    "shapiroWilk": {"statistic": float(shapiro_stat), "pValue": float(shapiro_p), "normal": shapiro_p > ${alpha}},
    "dagostinoPearson": {"statistic": float(dagostino_stat), "pValue": float(dagostino_p), "normal": dagostino_p > ${alpha}},
    "anderson": {
        "statistic": float(anderson_result.statistic),
        "criticalValues": anderson_result.critical_values.tolist(),
        "significanceLevels": anderson_result.significance_level.tolist()
    },
    "skewness": float(skewness),
    "kurtosis": float(kurtosis),
    "isNormal": shapiro_p > ${alpha} and abs(skewness) < 1 and abs(kurtosis) < 3,
    "interpretation": "Data appears normally distributed" if shapiro_p > ${alpha} else "Data does not appear normally distributed"
}

output(result)
`;
        return parseResult(await execPython(code));
      }

      case "distribution": {
        if (!column) throw new Error("column is required for distribution analysis");
        
        const code = `${baseCode}
data = df['${column}'].dropna()

distributions = ['norm', 'lognorm', 'expon', 'gamma', 'beta', 'weibull_min']
results = []

for dist_name in distributions:
    try:
        dist = getattr(stats, dist_name)
        params = dist.fit(data)
        d_stat, p_value = stats.kstest(data, dist_name, args=params)
        results.append({
            "distribution": dist_name,
            "ksStatistic": float(d_stat),
            "pValue": float(p_value),
            "params": [float(p) for p in params]
        })
    except:
        pass

results.sort(key=lambda x: x['ksStatistic'])
best_fit = results[0] if results else None

percentiles = np.percentile(data, ${JSON.stringify(percentiles)}).tolist()

result = {
    "column": "${column}",
    "n": len(data),
    "mean": float(data.mean()),
    "std": float(data.std()),
    "min": float(data.min()),
    "max": float(data.max()),
    "percentiles": dict(zip([${percentiles.join(", ")}], percentiles)),
    "distributionFits": results,
    "bestFit": best_fit
}

output(result)
`;
        return parseResult(await execPython(code));
      }

      case "percentile": {
        if (!column) throw new Error("column is required");
        
        const code = `${baseCode}
data = df['${column}'].dropna()
pcts = ${JSON.stringify(percentiles)}

result = {
    "column": "${column}",
    "percentiles": {str(p): float(np.percentile(data, p)) for p in pcts},
    "deciles": {str(i*10): float(np.percentile(data, i*10)) for i in range(1, 10)},
    "quartiles": {
        "Q1": float(np.percentile(data, 25)),
        "Q2": float(np.percentile(data, 50)),
        "Q3": float(np.percentile(data, 75))
    }
}

output(result)
`;
        return parseResult(await execPython(code));
      }

      case "zscore": {
        const cols = columns.length > 0 ? columns : [column];
        if (!cols || cols.length === 0) throw new Error("columns is required");
        
        const code = `${baseCode}
cols = ${JSON.stringify(cols)}

zscore_results = {}
outliers = {}

for col in cols:
    if col not in df.columns:
        continue
    data = df[col].dropna()
    z_scores = np.abs(stats.zscore(data))
    
    zscore_results[col] = {
        "mean": float(z_scores.mean()),
        "std": float(z_scores.std()),
        "max": float(z_scores.max())
    }
    
    outlier_mask = z_scores > 3
    outliers[col] = {
        "count": int(outlier_mask.sum()),
        "percentage": float(outlier_mask.sum() / len(data) * 100)
    }

result = {"zscoreStats": zscore_results, "outliers": outliers}

output(result)
`;
        return parseResult(await execPython(code));
      }

      case "confidence_interval": {
        if (!column) throw new Error("column is required");
        
        const code = `${baseCode}
data = df['${column}'].dropna()
n = len(data)
mean = data.mean()
std = data.std()
se = std / np.sqrt(n)

ci_95 = stats.t.interval(0.95, n-1, loc=mean, scale=se)
ci_99 = stats.t.interval(0.99, n-1, loc=mean, scale=se)

result = {
    "column": "${column}",
    "n": n,
    "mean": float(mean),
    "std": float(std),
    "standardError": float(se),
    "confidenceIntervals": {
        "95%": {"lower": float(ci_95[0]), "upper": float(ci_95[1])},
        "99%": {"lower": float(ci_99[0]), "upper": float(ci_99[1])}
    }
}

output(result)
`;
        return parseResult(await execPython(code));
      }

      case "effect_size": {
        if (!column) throw new Error("column is required");
        
        const code = `${baseCode}
${groupBy ? `
groups = df.groupby('${groupBy}')['${column}'].apply(list).to_dict()
group_names = list(groups.keys())

if len(group_names) >= 2:
    g1, g2 = groups[group_names[0]], groups[group_names[1]]
    
    pooled_std = np.sqrt(((len(g1)-1)*np.var(g1) + (len(g2)-1)*np.var(g2)) / (len(g1)+len(g2)-2))
    cohens_d = (np.mean(g1) - np.mean(g2)) / pooled_std if pooled_std > 0 else 0
    
    r = cohens_d / np.sqrt(cohens_d**2 + 4)
    
    result = {
        "column": "${column}",
        "group1": group_names[0],
        "group2": group_names[1],
        "cohensD": float(cohens_d),
        "pointBiserialR": float(r),
        "interpretation": "large" if abs(cohens_d) > 0.8 else ("medium" if abs(cohens_d) > 0.5 else "small")
    }
else:
    result = {"error": "Need at least 2 groups"}
` : `
result = {"error": "groupBy is required for effect size calculation"}
`}

output(result)
`;
        return parseResult(await execPython(code));
      }

      case "autocorrelation": {
        if (!column) throw new Error("column is required for autocorrelation");
        
        const lags = options.lags || 20;
        const code = `${baseCode}
data = df['${column}'].dropna()

def autocorr(x, lag):
    return x.autocorr(lag)

acf = [autocorr(data, i) for i in range(${lags + 1})]

dw = 2 * (1 - acf[1]) if len(acf) > 1 else None

result = {
    "column": "${column}",
    "autocorrelations": acf,
    "durbinWatson": float(dw) if dw else None,
    "lag1Autocorrelation": float(acf[1]) if len(acf) > 1 else None
}

output(result)
`;
        return parseResult(await execPython(code));
      }

      case "time_series_decompose": {
        if (!column) throw new Error("column is required for time series decomposition");
        
        const period = options.period || 12;
        const code = `${baseCode}
from statsmodels.tsa.seasonal import seasonal_decompose

data = df['${column}'].dropna()

${options.dateColumn ? `df['${options.dateColumn}'] = pd.to_datetime(df['${options.dateColumn}'])
data = data.loc[df['${options.dateColumn}'].sort_values().index]` : ""}

try:
    decomposition = seasonal_decompose(data, model='additive', period=${period})
    
    result = {
        "column": "${column}",
        "period": ${period},
        "trend": decomposition.trend.dropna().tolist()[:50],
        "seasonal": decomposition.seasonal.tolist()[:50],
        "residual": decomposition.resid.dropna().tolist()[:50],
        "observed": data.tolist()[:50]
    }
except Exception as e:
    result = {"error": str(e)}

output(result)
`;
        return parseResult(await execPython(code));
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
};
