export class AITelemetry {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.traces = new Map();
    this.spans = new Map();
    this.generations = new Map();
    this.metrics = {
      totalRequests: 0,
      totalTokens: 0,
      totalLatency: 0,
      errors: 0,
      byModel: {},
      byProvider: {}
    };
    this.hooks = {
      beforeRequest: [],
      afterRequest: [],
      onError: [],
      onSpanStart: [],
      onSpanEnd: []
    };
  }

  createTrace(options = {}) {
    const traceId = options.traceId || `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const trace = {
      id: traceId,
      name: options.name || "unnamed",
      startTime: Date.now(),
      endTime: null,
      metadata: options.metadata || {},
      spans: [],
      generations: [],
      status: "running",
      user: options.user,
      session: options.session,
      tags: options.tags || []
    };
    
    this.traces.set(traceId, trace);
    this.emit("traceCreated", trace);
    
    return trace;
  }

  startSpan(options = {}) {
    const spanId = options.spanId || `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const traceId = options.traceId;
    
    const span = {
      id: spanId,
      traceId,
      parentId: options.parentId,
      name: options.name || "unnamed",
      startTime: Date.now(),
      endTime: null,
      duration: null,
      status: "running",
      metadata: options.metadata || {},
      events: [],
      input: options.input,
      output: null
    };
    
    this.spans.set(spanId, span);
    
    if (traceId && this.traces.has(traceId)) {
      this.traces.get(traceId).spans.push(spanId);
    }
    
    this.hooks.onSpanStart.forEach(hook => hook(span));
    this.emit("spanStarted", span);
    
    return span;
  }

  endSpan(spanId, output = null, metadata = {}) {
    const span = this.spans.get(spanId);
    if (!span) return null;
    
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.output = output;
    span.status = "completed";
    span.metadata = { ...span.metadata, ...metadata };
    
    this.hooks.onSpanEnd.forEach(hook => hook(span));
    this.emit("spanEnded", span);
    
    return span;
  }

  logGeneration(options = {}) {
    const generationId = options.id || `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const generation = {
      id: generationId,
      traceId: options.traceId,
      spanId: options.spanId,
      name: options.name || "llm_call",
      startTime: options.startTime || Date.now(),
      endTime: options.endTime || Date.now(),
      model: options.model,
      provider: options.provider,
      input: {
        messages: options.messages,
        prompt: options.prompt,
        system: options.system,
        ...options.inputParams
      },
      output: {
        content: options.output,
        raw: options.rawOutput,
        ...options.outputParams
      },
      usage: {
        promptTokens: options.promptTokens || 0,
        completionTokens: options.completionTokens || 0,
        totalTokens: options.totalTokens || 0
      },
      latency: options.latency,
      metadata: {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        topP: options.topP,
        stopSequences: options.stopSequences,
        ...options.metadata
      },
      status: options.error ? "error" : "success",
      error: options.error
    };
    
    this.generations.set(generationId, generation);
    
    if (options.traceId && this.traces.has(options.traceId)) {
      this.traces.get(options.traceId).generations.push(generationId);
    }
    
    this.updateMetrics(generation);
    this.emit("generationLogged", generation);
    
    return generation;
  }

  updateMetrics(generation) {
    this.metrics.totalRequests++;
    this.metrics.totalTokens += generation.usage.totalTokens || 0;
    this.metrics.totalLatency += generation.latency || 0;
    
    if (generation.status === "error") {
      this.metrics.errors++;
    }
    
    if (generation.model) {
      if (!this.metrics.byModel[generation.model]) {
        this.metrics.byModel[generation.model] = { requests: 0, tokens: 0, latency: 0 };
      }
      this.metrics.byModel[generation.model].requests++;
      this.metrics.byModel[generation.model].tokens += generation.usage.totalTokens || 0;
      this.metrics.byModel[generation.model].latency += generation.latency || 0;
    }
    
    if (generation.provider) {
      if (!this.metrics.byProvider[generation.provider]) {
        this.metrics.byProvider[generation.provider] = { requests: 0, tokens: 0, latency: 0 };
      }
      this.metrics.byProvider[generation.provider].requests++;
      this.metrics.byProvider[generation.provider].tokens += generation.usage.totalTokens || 0;
      this.metrics.byProvider[generation.provider].latency += generation.latency || 0;
    }
  }

  endTrace(traceId, metadata = {}) {
    const trace = this.traces.get(traceId);
    if (!trace) return null;
    
    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.status = "completed";
    trace.metadata = { ...trace.metadata, ...metadata };
    
    this.emit("traceEnded", trace);
    
    return trace;
  }

  addEvent(spanId, event) {
    const span = this.spans.get(spanId);
    if (!span) return;
    
    span.events.push({
      name: event.name,
      timestamp: event.timestamp || Date.now(),
      attributes: event.attributes || {}
    });
  }

  getTrace(traceId) {
    const trace = this.traces.get(traceId);
    if (!trace) return null;
    
    return {
      ...trace,
      spanDetails: trace.spans.map(id => this.spans.get(id)).filter(Boolean),
      generationDetails: trace.generations.map(id => this.generations.get(id)).filter(Boolean)
    };
  }

  getSpan(spanId) {
    return this.spans.get(spanId);
  }

  getGeneration(generationId) {
    return this.generations.get(generationId);
  }

  getMetrics() {
    return {
      ...this.metrics,
      avgLatency: this.metrics.totalRequests > 0 
        ? Math.round(this.metrics.totalLatency / this.metrics.totalRequests) 
        : 0,
      errorRate: this.metrics.totalRequests > 0 
        ? (this.metrics.errors / this.metrics.totalRequests * 100).toFixed(2) 
        : 0
    };
  }

  searchTraces(query = {}) {
    let results = Array.from(this.traces.values());
    
    if (query.name) {
      results = results.filter(t => t.name.includes(query.name));
    }
    if (query.status) {
      results = results.filter(t => t.status === query.status);
    }
    if (query.startTime) {
      results = results.filter(t => t.startTime >= query.startTime);
    }
    if (query.endTime) {
      results = results.filter(t => t.endTime <= query.endTime);
    }
    if (query.tags && query.tags.length > 0) {
      results = results.filter(t => query.tags.some(tag => t.tags.includes(tag)));
    }
    
    return results.sort((a, b) => b.startTime - a.startTime);
  }

  searchGenerations(query = {}) {
    let results = Array.from(this.generations.values());
    
    if (query.model) {
      results = results.filter(g => g.model === query.model);
    }
    if (query.provider) {
      results = results.filter(g => g.provider === query.provider);
    }
    if (query.status) {
      results = results.filter(g => g.status === query.status);
    }
    if (query.minLatency) {
      results = results.filter(g => g.latency >= query.minLatency);
    }
    
    return results.sort((a, b) => b.startTime - a.startTime);
  }

  traceModelOutput(traceId, modelOutput) {
    const trace = this.traces.get(traceId);
    if (!trace) return;
    
    const transformation = {
      timestamp: Date.now(),
      stage: modelOutput.stage || "unknown",
      input: modelOutput.input,
      output: modelOutput.output,
      transformation: modelOutput.transformation,
      location: modelOutput.location,
      context: modelOutput.context
    };
    
    if (!trace.transformations) {
      trace.transformations = [];
    }
    trace.transformations.push(transformation);
    
    this.emit("outputTraced", { traceId, transformation });
    
    return transformation;
  }

  exportTrace(traceId) {
    const trace = this.getTrace(traceId);
    if (!trace) return null;
    
    return JSON.stringify(trace, null, 2);
  }

  exportAll() {
    return {
      traces: Object.fromEntries(this.traces),
      spans: Object.fromEntries(this.spans),
      generations: Object.fromEntries(this.generations),
      metrics: this.metrics
    };
  }

  clear() {
    this.traces.clear();
    this.spans.clear();
    this.generations.clear();
    this.metrics = {
      totalRequests: 0,
      totalTokens: 0,
      totalLatency: 0,
      errors: 0,
      byModel: {},
      byProvider: {}
    };
  }

  on(event, callback) {
    if (this.hooks[event]) {
      this.hooks[event].push(callback);
    }
  }

  emit(event, data) {
    console.log(`[Telemetry] ${event}:`, data.id || data.name || "");
  }

  middleware() {
    return async (req, res, next) => {
      const trace = this.createTrace({
        name: `${req.method} ${req.path}`,
        metadata: {
          method: req.method,
          path: req.path,
          query: req.query,
          ip: req.ip
        }
      });
      
      req.trace = trace;
      
      const startTime = Date.now();
      
      res.on("finish", () => {
        this.endTrace(trace.id, {
          statusCode: res.statusCode,
          responseTime: Date.now() - startTime
        });
      });
      
      next();
    };
  }
}

export const telemetry = new AITelemetry();

export function wrapModelCall(provider, model, fn) {
  return async (...args) => {
    const startTime = Date.now();
    const span = telemetry.startSpan({ name: `${provider}/${model}` });
    
    try {
      const result = await fn(...args);
      const endTime = Date.now();
      
      telemetry.logGeneration({
        spanId: span.id,
        provider,
        model,
        messages: args[0]?.messages,
        prompt: args[0]?.prompt,
        output: typeof result === "string" ? result : result.content || result.text,
        rawOutput: result,
        promptTokens: result.usage?.prompt_tokens || 0,
        completionTokens: result.usage?.completion_tokens || 0,
        totalTokens: result.usage?.total_tokens || 0,
        latency: endTime - startTime,
        temperature: args[0]?.temperature,
        maxTokens: args[0]?.max_tokens
      });
      
      telemetry.endSpan(span.id, result);
      
      return result;
    } catch (error) {
      const endTime = Date.now();
      
      telemetry.logGeneration({
        spanId: span.id,
        provider,
        model,
        error: error.message,
        latency: endTime - startTime
      });
      
      telemetry.endSpan(span.id, null, { error: error.message });
      
      throw error;
    }
  };
}
