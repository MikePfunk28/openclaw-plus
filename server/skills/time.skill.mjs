export const skill = {
  id: "time",
  name: "Time",
  description: "Get current time, convert timezones, and perform time calculations.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["now", "convert", "format", "diff", "add", "parse"],
        description: "Time action to perform"
      },
      timezone: {
        type: "string",
        description: "Timezone (e.g., 'America/New_York', 'UTC', 'Europe/London')"
      },
      time: {
        type: "string",
        description: "Time string for convert/parse (ISO format or natural language)"
      },
      fromTimezone: {
        type: "string",
        description: "Source timezone for conversion"
      },
      toTimezone: {
        type: "string",
        description: "Target timezone for conversion"
      },
      format: {
        type: "string",
        description: "Output format (e.g., 'YYYY-MM-DD HH:mm:ss')"
      },
      duration: {
        type: "string",
        description: "Duration to add (e.g., '2 hours', '3 days')"
      },
      startTime: {
        type: "string",
        description: "Start time for diff calculation"
      },
      endTime: {
        type: "string",
        description: "End time for diff calculation"
      }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input }) {
    const action = input?.action;

    const parseTime = (timeStr) => {
      if (!timeStr) return null;
      
      if (/^\d+$/.test(timeStr)) {
        return new Date(parseInt(timeStr));
      }
      
      const parsed = new Date(timeStr);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
      
      const relativeMatch = timeStr.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*(ago|from now)/i);
      if (relativeMatch) {
        const amount = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2].toLowerCase();
        const direction = relativeMatch[3].toLowerCase();
        const now = new Date();
        
        const multipliers = {
          second: 1000,
          minute: 60000,
          hour: 3600000,
          day: 86400000,
          week: 604800000,
          month: 2592000000,
          year: 31536000000
        };
        
        const ms = amount * (multipliers[unit] || 0);
        return new Date(direction === "ago" ? now.getTime() - ms : now.getTime() + ms);
      }
      
      return null;
    };

    const formatTime = (date, format, timezone) => {
      const options = {};
      
      if (timezone) {
        options.timeZone = timezone;
      }
      
      if (!format) {
        return date.toLocaleString("en-US", {
          timeZone: timezone || "UTC",
          dateStyle: "full",
          timeStyle: "long"
        });
      }
      
      const pad = (n) => String(n).padStart(2, "0");
      
      let result = format;
      result = result.replace("YYYY", date.getFullYear());
      result = result.replace("YY", String(date.getFullYear()).slice(-2));
      result = result.replace("MM", pad(date.getMonth() + 1));
      result = result.replace("DD", pad(date.getDate()));
      result = result.replace("HH", pad(date.getHours()));
      result = result.replace("mm", pad(date.getMinutes()));
      result = result.replace("ss", pad(date.getSeconds()));
      
      return result;
    };

    const parseDuration = (durationStr) => {
      const match = durationStr.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?/i);
      if (!match) return 0;
      
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      
      const multipliers = {
        second: 1000,
        minute: 60000,
        hour: 3600000,
        day: 86400000,
        week: 604800000,
        month: 2592000000,
        year: 31536000000
      };
      
      return amount * (multipliers[unit] || 0);
    };

    switch (action) {
      case "now": {
        const now = new Date();
        const timezone = input?.timezone;
        
        return {
          ok: true,
          action,
          iso: now.toISOString(),
          unix: Math.floor(now.getTime() / 1000),
          utc: now.toUTCString(),
          local: now.toLocaleString(),
          timezone: timezone || "local",
          formatted: formatTime(now, input?.format, timezone)
        };
      }

      case "convert": {
        const time = parseTime(input?.time);
        if (!time) {
          return { ok: false, error: "Invalid time format" };
        }
        
        const fromTz = input?.fromTimezone;
        const toTz = input?.toTimezone || input?.timezone;
        
        return {
          ok: true,
          action,
          input: input.time,
          fromTimezone: fromTz || "local",
          toTimezone: toTz || "UTC",
          converted: formatTime(time, input?.format, toTz),
          iso: time.toISOString()
        };
      }

      case "format": {
        const time = parseTime(input?.time) || new Date();
        const format = input?.format || "YYYY-MM-DD HH:mm:ss";
        const timezone = input?.timezone;
        
        return {
          ok: true,
          action,
          formatted: formatTime(time, format, timezone),
          iso: time.toISOString()
        };
      }

      case "diff": {
        const start = parseTime(input?.startTime);
        const end = parseTime(input?.endTime) || new Date();
        
        if (!start) {
          return { ok: false, error: "Invalid start time" };
        }
        
        const diffMs = end.getTime() - start.getTime();
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        return {
          ok: true,
          action,
          milliseconds: diffMs,
          seconds: diffSeconds,
          minutes: diffMinutes,
          hours: diffHours,
          days: diffDays,
          humanReadable: diffDays > 0 
            ? `${diffDays} day(s)` 
            : diffHours > 0 
              ? `${diffHours} hour(s)` 
              : diffMinutes > 0 
                ? `${diffMinutes} minute(s)`
                : `${diffSeconds} second(s)`
        };
      }

      case "add": {
        const time = parseTime(input?.time) || new Date();
        const duration = input?.duration;
        
        if (!duration) {
          return { ok: false, error: "duration is required" };
        }
        
        const ms = parseDuration(duration);
        const result = new Date(time.getTime() + ms);
        
        return {
          ok: true,
          action,
          input: input.time || "now",
          duration,
          result: result.toISOString(),
          formatted: formatTime(result, input?.format, input?.timezone)
        };
      }

      case "parse": {
        const time = parseTime(input?.time);
        
        if (!time) {
          return { ok: false, error: "Could not parse time" };
        }
        
        return {
          ok: true,
          action,
          input: input.time,
          iso: time.toISOString(),
          unix: Math.floor(time.getTime() / 1000),
          utc: time.toUTCString(),
          local: time.toLocaleString()
        };
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }
};
