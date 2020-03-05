import * as winston from 'winston';

const { colorize, combine, timestamp, printf, splat } = winston.format;

const logLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    verbose: 3,
    debug: 4,
    silly: 5,
  },
};

/**
 * Defines a custom format with winston print-f, used for formatting
 * with a timestamp, level and message. Designed to also handle cases
 * in which a error stack/message is involved.
 */
const myFormat = printf((info: any) => {
  let message = `${info.timestamp} ${info.level}: `;

  if (info instanceof Error) {
    message += ` ${info.stack}`;
  } else if (info.message instanceof Object) {
    message += JSON.stringify(info.message);
  } else {
    message += info.message;
  }

  return message;
});

/**
 * Creates a new logger that is exported, allows for logging directly
 * into the terminal and into two files, just errors and everything.
 */
const logger = winston.createLogger({
  levels: logLevels.levels,
  format: combine(timestamp(), splat(), myFormat),
  transports: [
    new winston.transports.Console({
      format: combine(timestamp(), colorize(), splat(), myFormat),
      level: process.env.LOG_LEVEL || 'info',
    }),
  ],
});

export { logger };
export default logger;
