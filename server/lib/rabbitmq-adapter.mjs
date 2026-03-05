import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// RabbitMQ Adapter
// ---------------------------------------------------------------------------
// Wraps amqplib with a clean async API.
// Falls back gracefully when amqplib is not installed or RABBITMQ_URL is unset.
// ---------------------------------------------------------------------------

let amqplib = null;

async function tryLoadAmqplib() {
  if (amqplib) return amqplib;
  try {
    amqplib = await import("amqplib");
    return amqplib;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EXCHANGE_TYPES = {
  DIRECT: "direct",
  FANOUT: "fanout",
  TOPIC: "topic",
  HEADERS: "headers",
};

export const QUEUE_OPTIONS_DEFAULTS = {
  durable: true,
  autoDelete: false,
  exclusive: false,
};

export const PUBLISH_OPTIONS_DEFAULTS = {
  persistent: true,
  contentType: "application/json",
};

// ---------------------------------------------------------------------------
// RabbitMQAdapter
// ---------------------------------------------------------------------------

export class RabbitMQAdapter extends EventEmitter {
  constructor(options = {}) {
    super();

    this.url =
      options.url ||
      process.env.RABBITMQ_URL ||
      "amqp://guest:guest@localhost:5672";

    this.heartbeat = options.heartbeat ?? 60;
    this.reconnectDelay = options.reconnectDelay ?? 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.prefetch = options.prefetch ?? 10;

    this._connection = null;
    this._channel = null;
    this._confirmChannel = null;
    this._connected = false;
    this._reconnecting = false;
    this._reconnectAttempts = 0;
    this._consumers = new Map(); // tag -> { queue, handler, options }
    this._subscriptions = new Map(); // id -> { exchange, routingKey, queue, tag }
    this._pendingMessages = [];
    this._stats = {
      published: 0,
      consumed: 0,
      errors: 0,
      reconnects: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  async connect() {
    const lib = await tryLoadAmqplib();
    if (!lib) {
      throw new Error(
        "amqplib is not installed. Run: npm install amqplib"
      );
    }

    try {
      this._connection = await lib.connect(this.url, {
        heartbeat: this.heartbeat,
      });

      this._connection.on("error", (err) => {
        console.error("[rabbitmq] Connection error:", err.message);
        this._stats.errors++;
        this.emit("error", err);
        this._scheduleReconnect();
      });

      this._connection.on("close", () => {
        if (this._connected) {
          console.warn("[rabbitmq] Connection closed unexpectedly");
          this._connected = false;
          this.emit("disconnected");
          this._scheduleReconnect();
        }
      });

      this._channel = await this._connection.createChannel();
      this._channel.prefetch(this.prefetch);

      this._channel.on("error", (err) => {
        console.error("[rabbitmq] Channel error:", err.message);
        this._stats.errors++;
        this.emit("channel_error", err);
      });

      this._channel.on("close", () => {
        console.warn("[rabbitmq] Channel closed");
        this.emit("channel_closed");
      });

      this._confirmChannel = await this._connection.createConfirmChannel();
      this._confirmChannel.prefetch(this.prefetch);

      this._connected = true;
      this._reconnectAttempts = 0;
      this._reconnecting = false;

      // Re-attach consumers after reconnect
      await this._reattachConsumers();

      // Flush any pending messages
      await this._flushPending();

      console.log("[rabbitmq] Connected to", this.url);
      this.emit("connected");

      return { ok: true, url: this.url };
    } catch (err) {
      this._connected = false;
      throw new Error(`RabbitMQ connection failed: ${err.message}`);
    }
  }

  async disconnect() {
    this._reconnecting = false;
    this._connected = false;

    try {
      if (this._channel) {
        await this._channel.close().catch(() => {});
        this._channel = null;
      }
      if (this._confirmChannel) {
        await this._confirmChannel.close().catch(() => {});
        this._confirmChannel = null;
      }
      if (this._connection) {
        await this._connection.close().catch(() => {});
        this._connection = null;
      }
    } catch (err) {
      // Ignore errors on disconnect
    }

    console.log("[rabbitmq] Disconnected");
    this.emit("disconnected");
    return { ok: true };
  }

  _scheduleReconnect() {
    if (this._reconnecting) return;
    if (this._reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[rabbitmq] Max reconnect attempts reached");
      this.emit("max_reconnect_reached");
      return;
    }

    this._reconnecting = true;
    this._reconnectAttempts++;
    this._stats.reconnects++;

    const delay = this.reconnectDelay * this._reconnectAttempts;
    console.log(
      `[rabbitmq] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (err) {
        this._reconnecting = false;
        console.error("[rabbitmq] Reconnect failed:", err.message);
        this._scheduleReconnect();
      }
    }, delay);
  }

  async _reattachConsumers() {
    for (const [, consumer] of this._consumers) {
      try {
        await this._channel.consume(
          consumer.queue,
          consumer.handler,
          consumer.options
        );
        console.log(`[rabbitmq] Re-attached consumer for queue: ${consumer.queue}`);
      } catch (err) {
        console.error(`[rabbitmq] Failed to re-attach consumer for queue ${consumer.queue}:`, err.message);
      }
    }
  }

  async _flushPending() {
    if (this._pendingMessages.length === 0) return;
    console.log(`[rabbitmq] Flushing ${this._pendingMessages.length} pending messages`);
    const pending = [...this._pendingMessages];
    this._pendingMessages = [];
    for (const msg of pending) {
      try {
        await this.publish(msg.exchange, msg.routingKey, msg.message, msg.options);
      } catch (err) {
        console.error("[rabbitmq] Failed to flush pending message:", err.message);
      }
    }
  }

  get isConnected() {
    return this._connected;
  }

  // -------------------------------------------------------------------------
  // Exchange management
  // -------------------------------------------------------------------------

  async assertExchange(exchange, type = EXCHANGE_TYPES.TOPIC, options = {}) {
    this._requireChannel();
    await this._channel.assertExchange(exchange, type, {
      durable: true,
      autoDelete: false,
      ...options,
    });
    return { ok: true, exchange, type };
  }

  async deleteExchange(exchange, options = {}) {
    this._requireChannel();
    await this._channel.deleteExchange(exchange, options);
    return { ok: true, exchange };
  }

  // -------------------------------------------------------------------------
  // Queue management
  // -------------------------------------------------------------------------

  async assertQueue(queue, options = {}) {
    this._requireChannel();
    const result = await this._channel.assertQueue(queue, {
      ...QUEUE_OPTIONS_DEFAULTS,
      ...options,
    });
    return {
      ok: true,
      queue: result.queue,
      messageCount: result.messageCount,
      consumerCount: result.consumerCount,
    };
  }

  async deleteQueue(queue, options = {}) {
    this._requireChannel();
    const result = await this._channel.deleteQueue(queue, options);
    return { ok: true, queue, messageCount: result.messageCount };
  }

  async purgeQueue(queue) {
    this._requireChannel();
    const result = await this._channel.purgeQueue(queue);
    return { ok: true, queue, messageCount: result.messageCount };
  }

  async checkQueue(queue) {
    this._requireChannel();
    try {
      const result = await this._channel.checkQueue(queue);
      return {
        exists: true,
        queue: result.queue,
        messageCount: result.messageCount,
        consumerCount: result.consumerCount,
      };
    } catch {
      return { exists: false, queue };
    }
  }

  async bindQueue(queue, exchange, routingKey, args = {}) {
    this._requireChannel();
    await this._channel.bindQueue(queue, exchange, routingKey, args);
    return { ok: true, queue, exchange, routingKey };
  }

  async unbindQueue(queue, exchange, routingKey, args = {}) {
    this._requireChannel();
    await this._channel.unbindQueue(queue, exchange, routingKey, args);
    return { ok: true, queue, exchange, routingKey };
  }

  // -------------------------------------------------------------------------
  // Publishing
  // -------------------------------------------------------------------------

  async publish(exchange, routingKey, message, options = {}) {
    if (!this._connected) {
      // Queue for later
      this._pendingMessages.push({ exchange, routingKey, message, options });
      return { ok: true, queued: true };
    }

    this._requireChannel();

    const content = this._serialize(message);
    const publishOptions = {
      ...PUBLISH_OPTIONS_DEFAULTS,
      messageId: randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
      ...options,
    };

    return new Promise((resolve, reject) => {
      this._confirmChannel.publish(
        exchange,
        routingKey,
        content,
        publishOptions,
        (err) => {
          if (err) {
            this._stats.errors++;
            reject(new Error(`Publish failed: ${err.message}`));
          } else {
            this._stats.published++;
            resolve({ ok: true, exchange, routingKey, messageId: publishOptions.messageId });
          }
        }
      );
    });
  }

  async sendToQueue(queue, message, options = {}) {
    return this.publish("", queue, message, options);
  }

  // -------------------------------------------------------------------------
  // Consuming / Subscribing
  // -------------------------------------------------------------------------

  async subscribe(exchange, routingKey, handler, options = {}) {
    this._requireChannel();

    const queueName = options.queue || `${exchange}.${routingKey}.${randomUUID().slice(0, 8)}`;
    const queueOptions = {
      durable: options.durable ?? false,
      exclusive: options.exclusive ?? true,
      autoDelete: options.autoDelete ?? true,
    };

    await this.assertExchange(exchange, options.exchangeType || EXCHANGE_TYPES.TOPIC);
    await this.assertQueue(queueName, queueOptions);
    await this.bindQueue(queueName, exchange, routingKey);

    const wrappedHandler = this._wrapHandler(handler, options.autoAck ?? true);

    const { consumerTag } = await this._channel.consume(
      queueName,
      wrappedHandler,
      { noAck: options.autoAck ?? true }
    );

    const subscriptionId = randomUUID();
    this._subscriptions.set(subscriptionId, {
      exchange,
      routingKey,
      queue: queueName,
      tag: consumerTag,
    });

    this._consumers.set(consumerTag, {
      queue: queueName,
      handler: wrappedHandler,
      options: { noAck: options.autoAck ?? true },
    });

    console.log(`[rabbitmq] Subscribed to ${exchange}/${routingKey} (tag: ${consumerTag})`);
    return { ok: true, subscriptionId, consumerTag, queue: queueName };
  }

  async consume(queue, handler, options = {}) {
    this._requireChannel();

    await this.assertQueue(queue);

    const autoAck = options.autoAck ?? false;
    const wrappedHandler = this._wrapHandler(handler, autoAck);

    const { consumerTag } = await this._channel.consume(
      queue,
      wrappedHandler,
      { noAck: autoAck, ...options }
    );

    this._consumers.set(consumerTag, {
      queue,
      handler: wrappedHandler,
      options: { noAck: autoAck },
    });

    console.log(`[rabbitmq] Consuming queue: ${queue} (tag: ${consumerTag})`);
    return { ok: true, consumerTag, queue };
  }

  async cancelConsumer(consumerTag) {
    this._requireChannel();
    await this._channel.cancel(consumerTag);
    this._consumers.delete(consumerTag);
    return { ok: true, consumerTag };
  }

  async unsubscribe(subscriptionId) {
    const sub = this._subscriptions.get(subscriptionId);
    if (!sub) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    await this.cancelConsumer(sub.tag);
    this._subscriptions.delete(subscriptionId);
    return { ok: true, subscriptionId };
  }

  _wrapHandler(handler, autoAck) {
    return async (msg) => {
      if (!msg) return; // Consumer cancelled

      try {
        const parsed = this._deserialize(msg.content);
        const envelope = {
          content: parsed,
          fields: msg.fields,
          properties: msg.properties,
          ack: () => {
            if (!autoAck && this._channel) {
              this._channel.ack(msg);
            }
          },
          nack: (requeue = false) => {
            if (!autoAck && this._channel) {
              this._channel.nack(msg, false, requeue);
            }
          },
          reject: (requeue = false) => {
            if (!autoAck && this._channel) {
              this._channel.reject(msg, requeue);
            }
          },
        };

        await handler(envelope);
        this._stats.consumed++;

        if (autoAck) {
          // noop - noAck mode
        }
      } catch (err) {
        this._stats.errors++;
        console.error("[rabbitmq] Handler error:", err.message);
        if (!autoAck && this._channel) {
          this._channel.nack(msg, false, false); // Dead-letter
        }
        this.emit("handler_error", { err, msg });
      }
    };
  }

  // -------------------------------------------------------------------------
  // RPC Pattern
  // -------------------------------------------------------------------------

  async rpcCall(queue, message, timeout = 10000) {
    this._requireChannel();

    const correlationId = randomUUID();
    const replyQueue = await this._channel.assertQueue("", {
      exclusive: true,
      autoDelete: true,
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`RPC timeout after ${timeout}ms`));
      }, timeout);

      this._channel.consume(
        replyQueue.queue,
        (msg) => {
          if (!msg) return;
          if (msg.properties.correlationId === correlationId) {
            clearTimeout(timer);
            resolve(this._deserialize(msg.content));
          }
        },
        { noAck: true }
      );

      const content = this._serialize(message);
      this._channel.sendToQueue(queue, content, {
        correlationId,
        replyTo: replyQueue.queue,
        persistent: false,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Message acknowledgement
  // -------------------------------------------------------------------------

  ack(msg) {
    this._requireChannel();
    this._channel.ack(msg);
  }

  nack(msg, allUpTo = false, requeue = false) {
    this._requireChannel();
    this._channel.nack(msg, allUpTo, requeue);
  }

  reject(msg, requeue = false) {
    this._requireChannel();
    this._channel.reject(msg, requeue);
  }

  // -------------------------------------------------------------------------
  // Dead Letter Queue helpers
  // -------------------------------------------------------------------------

  async setupDeadLetterQueue(originalQueue, dlxExchange = "dlx", dlqName = null) {
    const dlq = dlqName || `${originalQueue}.dead`;

    await this.assertExchange(dlxExchange, EXCHANGE_TYPES.DIRECT);
    await this.assertQueue(dlq, { durable: true });
    await this.bindQueue(dlq, dlxExchange, originalQueue);

    await this.assertQueue(originalQueue, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": dlxExchange,
        "x-dead-letter-routing-key": originalQueue,
      },
    });

    return { ok: true, originalQueue, dlxExchange, dlq };
  }

  // -------------------------------------------------------------------------
  // Stats and status
  // -------------------------------------------------------------------------

  getStatus() {
    return {
      connected: this._connected,
      url: this.url.replace(/:[^@]*@/, ":****@"), // Redact password
      reconnectAttempts: this._reconnectAttempts,
      consumers: this._consumers.size,
      subscriptions: this._subscriptions.size,
      pendingMessages: this._pendingMessages.length,
      stats: { ...this._stats },
    };
  }

  listSubscriptions() {
    return [...this._subscriptions.entries()].map(([id, sub]) => ({
      id,
      exchange: sub.exchange,
      routingKey: sub.routingKey,
      queue: sub.queue,
      tag: sub.tag,
    }));
  }

  listConsumers() {
    return [...this._consumers.entries()].map(([tag, consumer]) => ({
      tag,
      queue: consumer.queue,
    }));
  }

  // -------------------------------------------------------------------------
  // Serialization
  // -------------------------------------------------------------------------

  _serialize(message) {
    if (Buffer.isBuffer(message)) return message;
    if (typeof message === "string") return Buffer.from(message);
    return Buffer.from(JSON.stringify(message));
  }

  _deserialize(buffer) {
    try {
      return JSON.parse(buffer.toString());
    } catch {
      return buffer.toString();
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  _requireChannel() {
    if (!this._channel || !this._connected) {
      throw new Error("RabbitMQ not connected. Call connect() first.");
    }
  }
}

// ---------------------------------------------------------------------------
// WebSocket Bridge
// ---------------------------------------------------------------------------
// Routes WebSocket messages to RabbitMQ exchanges and vice versa.
// ---------------------------------------------------------------------------

export class RabbitMQWebSocketBridge {
  constructor(rabbitmq, options = {}) {
    this.rabbitmq = rabbitmq;
    this.options = options;
    this._clients = new Map(); // wsClientId -> { ws, subscriptions: [] }
    this._bridgeExchange = options.bridgeExchange || "ws.bridge";
  }

  async initialize() {
    if (!this.rabbitmq.isConnected) {
      await this.rabbitmq.connect();
    }

    await this.rabbitmq.assertExchange(
      this._bridgeExchange,
      EXCHANGE_TYPES.TOPIC
    );

    console.log(`[rabbitmq-ws-bridge] Initialized on exchange: ${this._bridgeExchange}`);
    return { ok: true, exchange: this._bridgeExchange };
  }

  async addClient(clientId, ws) {
    this._clients.set(clientId, { ws, subscriptions: [] });

    ws.on("close", () => {
      this.removeClient(clientId);
    });

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        await this._handleClientMessage(clientId, msg);
      } catch (err) {
        console.error("[rabbitmq-ws-bridge] Message parse error:", err.message);
        this._sendToClient(clientId, { type: "error", error: err.message });
      }
    });

    this._sendToClient(clientId, {
      type: "connected",
      clientId,
      exchange: this._bridgeExchange,
    });

    return { ok: true, clientId };
  }

  async removeClient(clientId) {
    const client = this._clients.get(clientId);
    if (!client) return;

    for (const subId of client.subscriptions) {
      try {
        await this.rabbitmq.unsubscribe(subId);
      } catch {
        // Already removed
      }
    }

    this._clients.delete(clientId);
    console.log(`[rabbitmq-ws-bridge] Client removed: ${clientId}`);
  }

  async _handleClientMessage(clientId, msg) {
    switch (msg.type) {
      case "publish": {
        const { exchange, routingKey, payload, options } = msg;
        await this.rabbitmq.publish(
          exchange || this._bridgeExchange,
          routingKey || "ws.message",
          { clientId, payload, timestamp: Date.now() },
          options
        );
        this._sendToClient(clientId, { type: "published", routingKey });
        break;
      }

      case "subscribe": {
        const { exchange, routingKey } = msg;
        const result = await this.rabbitmq.subscribe(
          exchange || this._bridgeExchange,
          routingKey || "#",
          async (envelope) => {
            this._sendToClient(clientId, {
              type: "message",
              exchange,
              routingKey,
              payload: envelope.content,
              fields: envelope.fields,
              timestamp: Date.now(),
            });
            envelope.ack();
          },
          { autoAck: false, durable: false, exclusive: true, autoDelete: true }
        );

        const client = this._clients.get(clientId);
        if (client) {
          client.subscriptions.push(result.subscriptionId);
        }

        this._sendToClient(clientId, {
          type: "subscribed",
          subscriptionId: result.subscriptionId,
          exchange,
          routingKey,
        });
        break;
      }

      case "unsubscribe": {
        const { subscriptionId } = msg;
        await this.rabbitmq.unsubscribe(subscriptionId);
        const client = this._clients.get(clientId);
        if (client) {
          client.subscriptions = client.subscriptions.filter(
            (id) => id !== subscriptionId
          );
        }
        this._sendToClient(clientId, { type: "unsubscribed", subscriptionId });
        break;
      }

      case "ping": {
        this._sendToClient(clientId, { type: "pong", timestamp: Date.now() });
        break;
      }

      default: {
        this._sendToClient(clientId, {
          type: "error",
          error: `Unknown message type: ${msg.type}`,
        });
      }
    }
  }

  _sendToClient(clientId, data) {
    const client = this._clients.get(clientId);
    if (!client || !client.ws) return;

    try {
      if (client.ws.readyState === 1 /* OPEN */) {
        client.ws.send(JSON.stringify(data));
      }
    } catch (err) {
      console.error(`[rabbitmq-ws-bridge] Send error for client ${clientId}:`, err.message);
    }
  }

  getStatus() {
    return {
      exchange: this._bridgeExchange,
      clients: this._clients.size,
      clientIds: [...this._clients.keys()],
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _defaultAdapter = null;
let _defaultBridge = null;

export function getRabbitMQAdapter(options = {}) {
  if (!_defaultAdapter) {
    _defaultAdapter = new RabbitMQAdapter(options);
  }
  return _defaultAdapter;
}

export function getRabbitMQBridge(options = {}) {
  const adapter = getRabbitMQAdapter(options);
  if (!_defaultBridge) {
    _defaultBridge = new RabbitMQWebSocketBridge(adapter, options);
  }
  return _defaultBridge;
}

export async function checkRabbitMQAvailable() {
  const lib = await tryLoadAmqplib();
  if (!lib) {
    return {
      available: false,
      reason: "amqplib not installed",
      fix: "npm install amqplib",
    };
  }

  const url = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";

  try {
    const conn = await lib.connect(url, { heartbeat: 5 });
    await conn.close();
    return { available: true, url: url.replace(/:[^@]*@/, ":****@") };
  } catch (err) {
    return {
      available: false,
      reason: err.message,
      url: url.replace(/:[^@]*@/, ":****@"),
      fix: "Start RabbitMQ: docker run -d -p 5672:5672 -p 15672:15672 rabbitmq:management",
    };
  }
}
