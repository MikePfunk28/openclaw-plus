import { Bot } from "grammy";

function resolveToken(config) {
  if (config?.token) {
    return config.token;
  }
  if (config?.tokenEnv) {
    return process.env[config.tokenEnv] || null;
  }
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

function isAllowedSender(config, fromId) {
  const allowFrom = Array.isArray(config?.allowFrom) ? config.allowFrom : [];
  if (allowFrom.length === 0) {
    return true;
  }
  return allowFrom.includes(String(fromId)) || allowFrom.includes("*");
}

export async function startTelegramAdapter({ config, onInbound, logger }) {
  if (!config?.enabled) {
    return null;
  }

  const token = resolveToken(config);
  if (!token) {
    logger("telegram adapter disabled: missing token");
    return null;
  }

  const bot = new Bot(token);
  const modelId = config.modelId || null;

  bot.on("message:text", async (ctx) => {
    const fromId = ctx.from?.id;
    if (!fromId || !isAllowedSender(config, fromId)) {
      return;
    }

    const text = String(ctx.message?.text || "").trim();
    if (!text) {
      return;
    }

    try {
      const result = await onInbound({
        channel: "telegram",
        accountId: "default",
        peer: {
          kind: ctx.chat?.type === "private" ? "direct" : "group",
          id: String(ctx.chat?.id || fromId)
        },
        objective: text,
        modelId,
        metadata: {
          fromId: String(fromId),
          chatId: String(ctx.chat?.id || "")
        }
      });

      if (result?.answer) {
        await ctx.reply(result.answer);
      }
    } catch (error) {
      await ctx.reply(`Error: ${String(error?.message || error)}`);
    }
  });

  await bot.start();
  logger("telegram adapter started");

  return {
    async stop() {
      await bot.stop();
    }
  };
}
