import pino from "pino";

export function createLogger(level: string = "info", logFile?: string): pino.Logger {
  if (logFile) {
    return pino({ level }, pino.destination(logFile));
  }
  return pino({
    level,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  });
}

export type Logger = pino.Logger;
