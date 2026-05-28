// src/middlewares/accessControl.ts
import type {Request, Response, NextFunction} from 'express'
import ipRangeCheck from 'ip-range-check'

// 화이트리스트 IP (CIDR 지원)
const allowedIPs = ['203.0.113.10', '198.51.100.0/24']

// 모바일 UA 패턴 (간단 버전)
const mobileRegex = /(iphone|ipod|ipad|android|blackberry|webos|opera mini|iemobile|windows phone)/i

export const accessControl = (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.connection.remoteAddress || ''

    const isWhitelisted = ipRangeCheck(ip, allowedIPs)
    const userAgent = req.headers['user-agent'] || ''
    const isMobile = mobileRegex.test(userAgent)


    if (isWhitelisted || isMobile) {
        return next()
    }

    return res.status(403).json({ error: 'Forbidden: Access is restricted' })
}
