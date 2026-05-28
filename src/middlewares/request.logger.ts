// src/middlewares/requestLogger.ts
// src/middlewares/requestLogger.ts
import type {Request, Response, NextFunction} from 'express'
import logger from '../utils/logger.js'
import {getHeaderData} from "../utils/session.js";

const normalizeIp = (ip?: string | null): string => {
    if (!ip) return ''
    if (ip.startsWith('::ffff:')) return ip.substring(7)
    if (ip === '::1') return '127.0.0.1'
    return ip
}

const getClientIp = (req: Request): string => {
    // Express 헤더 타입이 string | string[] | undefined
    const xff = req.headers['x-forwarded-for']

    let ip: string | undefined

    if (Array.isArray(xff)) {
        ip = xff[0]
    } else if (typeof xff === 'string') {
        ip = xff.split(',')[0]?.trim()
    }

    return normalizeIp(
        ip ||
        req.ip ||                        // Express가 계산한 IP
        req.socket.remoteAddress ||      // 소켓에서 가져오기
        '',
    )
}

function maskSensitive(h: any) {
    if (!h) return h
    const clone = {...h}
    if (clone.authorization) clone.authorization = '[REDACTED]'
    if (clone.cookie) clone.cookie = '[REDACTED]'
    return clone
}

function maskBody(b: any) {
    if (!b || typeof b !== 'object') return b
    const clone: any = {...b}
    for (const k of Object.keys(clone)) {
        const keyLower = k.toLowerCase()
        if (['password','passwd','pwd','token','access_token','refresh_token','secret'].some(s => keyLower.includes(s))) {
            clone[k] = '[REDACTED]'
        }
    }
    return clone
}

function buildTag(headerData: HeaderData) {
    const tag: Record<string, unknown> = {}

    if (headerData.ip) {
        tag.ip = headerData.ip
    }
    if (headerData.deviceType) {
        tag.type = headerData.deviceType
    }
    if (headerData.deviceId) {
        tag.id = headerData.deviceId
    }
    if (headerData.userNo) {
        tag.userNo = headerData.userNo
    }

    // versionName + versionCode 조합
    const version =
        headerData.versionName +
        (headerData.versionCode ? `(${headerData.versionCode})` : '')
    if (version.trim()) {
        tag.version = version
    }

    return tag
}

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now()
    const clientIp = getClientIp(req)
    const {method, originalUrl, query} = req
    let headerData: HeaderData = getHeaderData(req.headers)

    res.on('finish', () => {
        const duration = Date.now() - start
        const {statusCode} = res

        const tag = buildTag(headerData)

        logger(
            'access',
            JSON.stringify(tag),
            {
                method,
                url: originalUrl,
                status: statusCode,
                durationMs: duration,
                headers: maskSensitive(req.headers),
                query,
                body: maskBody(req.body),
            }
        )
    })

    next()
}