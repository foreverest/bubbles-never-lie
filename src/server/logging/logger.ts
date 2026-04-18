type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type ConfiguredLogLevel = LogLevel | 'silent';
type LogMetadata = Record<string, unknown>;
type LogMethod = (message: string, metadata?: LogMetadata) => void;

export type ComponentLogger = {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
};

const logLevelPriorities: Record<ConfiguredLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
};
const defaultLogLevel: ConfiguredLogLevel = 'info';

export const createLogger = (component: string): ComponentLogger => ({
  debug: (message, metadata) => writeLog('debug', component, message, metadata),
  info: (message, metadata) => writeLog('info', component, message, metadata),
  warn: (message, metadata) => writeLog('warn', component, message, metadata),
  error: (message, metadata) => writeLog('error', component, message, metadata),
});

const writeLog = (
  level: LogLevel,
  component: string,
  message: string,
  metadata: LogMetadata | undefined
): void => {
  if (!shouldLog(level)) {
    return;
  }

  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${component}] ${message}${formatMetadata(metadata)}`;

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
};

const shouldLog = (level: LogLevel): boolean =>
  logLevelPriorities[level] >= logLevelPriorities[readConfiguredLogLevel()];

const readConfiguredLogLevel = (): ConfiguredLogLevel => {
  const value = process.env.BUBBLE_STATS_LOG_LEVEL?.toLowerCase();

  return isConfiguredLogLevel(value) ? value : defaultLogLevel;
};

const isConfiguredLogLevel = (
  value: string | undefined
): value is ConfiguredLogLevel =>
  value === 'debug' ||
  value === 'info' ||
  value === 'warn' ||
  value === 'error' ||
  value === 'silent';

const formatMetadata = (metadata: LogMetadata | undefined): string => {
  if (metadata === undefined) {
    return '';
  }

  try {
    const serialized = JSON.stringify(metadata);
    return serialized === undefined
      ? ' [metadata unavailable]'
      : ` ${serialized}`;
  } catch {
    return ' [metadata unavailable]';
  }
};
