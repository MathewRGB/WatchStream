import { APP_NAME } from '../app-name';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Only plain values: a log line can never carry a description, a code or a
 * chat text by accident, because those are not primitives worth passing here
 * and the callers are written to pass counts, states and error names only.
 */
export type LogData = Record<string, string | number | boolean | null>;

export interface LogEntry {
  time: number;
  level: LogLevel;
  scope: string;
  message: string;
  data?: LogData;
}

export type LogSink = (entry: LogEntry) => void;

const MAX_HISTORY = 300;
const history: LogEntry[] = [];

const consoleSink: LogSink = ({ level, scope, message, data }) => {
  const line = `[${APP_NAME}] ${scope}: ${message}`;
  if (data) console[level](line, data);
  else console[level](line);
};

let sink: LogSink = consoleSink;

/** Replaces where entries go (tests). `null` restores the browser console. */
export function setLogSink(next: LogSink | null): void {
  sink = next ?? consoleSink;
}

export function clearLogHistory(): void {
  history.length = 0;
}

/** The latest entries, oldest first. Kept in memory only, for "copy technical details". */
export function logHistory(): readonly LogEntry[] {
  return history;
}

/** The latest entries as text lines, e.g. `12:00:01.250 WARN link: ice failed {"state":"failed"}`. */
export function formatLogHistory(limit = 40): string {
  return history
    .slice(-limit)
    .map((entry) => {
      const time = new Date(entry.time).toISOString().slice(11, 23);
      const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
      return `${time} ${entry.level.toUpperCase()} ${entry.scope}: ${entry.message}${data}`;
    })
    .join('\n');
}

export interface Logger {
  debug(message: string, data?: LogData): void;
  info(message: string, data?: LogData): void;
  warn(message: string, data?: LogData): void;
  error(message: string, data?: LogData): void;
}

export function createLogger(scope: string): Logger {
  const write = (level: LogLevel) => (message: string, data?: LogData) => {
    const entry: LogEntry = { time: Date.now(), level, scope, message, ...(data && { data }) };
    history.push(entry);
    if (history.length > MAX_HISTORY) history.shift();
    sink(entry);
  };
  return { debug: write('debug'), info: write('info'), warn: write('warn'), error: write('error') };
}

const QUOTED_DESCRIPTION = /\b[a-z]=\S.*$/is;
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const IPV6 = /\b[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,}(?![0-9a-z])/gi;

/**
 * An error text as a log line may carry it. A browser quotes the line of a session description it
 * could not read, so what comes from it is cut there, and any address left is taken out.
 */
export function scrubMessage(message: string): string {
  return message
    .replace(QUOTED_DESCRIPTION, '')
    .replace(IPV4, '<address>')
    .replace(IPV6, '<address>')
    .trim()
    .slice(0, 200);
}

/** The name and message of anything thrown, for a log line. */
export function describeThrown(error: unknown): LogData {
  if (error instanceof Error) return { error: error.name, message: scrubMessage(error.message) };
  return { error: typeof error };
}
