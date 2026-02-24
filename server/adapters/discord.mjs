import { Client, GatewayIntentBits, Partials } from "discord.js";

function resolveToken(config) {
  if (config?.token) {
    return config.token;
  }
  if (config?.tokenEnv) {
    return process.env[config.tokenEnv] || null;
  }
  return process.env.DISCORD_BOT_TOKEN || null;
}

function isAllowedSender(config, userId) {
  const allowFrom = Array.isArray(config?.allowFrom) ? config.allowFrom : [];
  if (allowFrom.length === 0) {
    return true;
  }
  return allowFrom.includes(String(userId)) || allowFrom.includes("*");
}

export async function startDiscordAdapter({ config, onInbound, logger }) {
  if (!config?.enabled) {
    return null;
  }

  const token = resolveToken(config);
  if (!token) {
    logger("discord adapter disabled: missing token");
    return null;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  });

  const modelId = config.modelId || null;

  client.on("messageCreate", async (message) => {
    if (message.author?.bot) {
      return;
    }

    const userId = String(message.author?.id || "");
    if (!userId || !isAllowedSender(config, userId)) {
      return;
    }

    const text = String(message.content || "").trim();
    if (!text) {
      return;
    }

    try {
      const result = await onInbound({
        channel: "discord",
        accountId: "default",
        peer: {
          kind: message.guildId ? "group" : "direct",
          id: String(message.channelId)
        },
        objective: text,
        modelId,
        metadata: {
          userId,
          channelId: String(message.channelId),
          guildId: message.guildId ? String(message.guildId) : null
        }
      });

      if (result?.answer) {
        await message.reply(result.answer);
      }
    } catch (error) {
      await message.reply(`Error: ${String(error?.message || error)}`);
    }
  });

  await client.login(token);
  logger("discord adapter started");

  return {
    async stop() {
      await client.destroy();
    }
  };
}
