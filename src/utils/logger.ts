// src/utils/logger.ts
import winston from 'winston'
import * as fs from 'fs'
import * as path from 'path'
import moment from 'moment'
import CircularJSON from 'circular-json'

const {combine, timestamp, printf} = winston.format

const logDir = 'logs'
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, {recursive: true})

const timezoned = (): string => moment().format('YYYY-MM-DD HH:mm:ss')

// printf 콜백 타입은 TransformableInfo로
const logFormat = printf(
    ({level, message, timestamp, tag}: winston.Logform.TransformableInfo & {tag?: string;}) => {
        const ts = typeof timestamp === 'string' ? timestamp : timezoned()
        return `${ts} [${tag ?? level}]: ${message as string}`
    },
)

// 개별 타입용 로거 생성
const createLogger = (logType: string): winston.Logger => {
    const dateSuffix = moment().format('YYYYMMDD')
    const filename = `${logType}.${dateSuffix}.log`

    return winston.createLogger({
        level: 'info',
        format: combine(timestamp({format: timezoned}), logFormat),
        defaultMeta: {tag: logType},
        transports: [
            //new winston.transports.Console(),
            new winston.transports.File({
                filename: path.join(logDir, filename),
            }),
        ],
    })
}

// 로거 인스턴스 캐시
const loggers: Record<string, winston.Logger> = {}

const toMessageString = (v: unknown): string =>
    typeof v === 'string' ? v : CircularJSON.stringify(v)

/**
 * 요청한 logType으로 로거를 가져와 info 레벨로 출력
 */
const logger = (logType: string, tag: string, message: unknown): void => {
    if (!loggers[logType]) {
        loggers[logType] = createLogger(logType)
    }
    const msg = toMessageString(message)
    loggers[logType].info(msg, {tag})
}

export default logger
export {createLogger}
