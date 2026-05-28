// src/middlewares/requestContextMiddleware.ts
import type {Request, Response, NextFunction, RequestHandler} from 'express'
import {checkSessionData, getHeaderData} from '../utils/session.js'
import logIgnoreList from '../config/logIgnoreList.js'

function mergeDefined<T extends object>(base: T, ...sources: Array<Partial<T>>): T {
    for (const src of sources) {
        if (!src) continue
        Object.entries(src).forEach(([k, v]) => {
            if (v !== undefined) {
                (base as any)[k] = v
            }
        })
    }
    return base
}



export default function requestContextMiddleware({
    authorization = true,
}: RequestContextOptions = {}): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
        let headerData: HeaderData = getHeaderData(req.headers)
        const {debug} = (req.query || {}) as Record<string, string | undefined>
        const startTime = new Date()

        // 응답 본문 캡처
        const oldSend = res.send.bind(res)
        let responseBody: unknown
        ;(res as any).send = (body: any) => {
            responseBody = body
            return oldSend(body)
        }

        // 디버그 헤더 주입 (userNo는 string)
        if (debug === 'true' || debug === 'y') {
            const debugData: Partial<HeaderData> = {
                userNo: 1904,
                deviceId: 'test1',
                deviceType: 'android',
                deviceToken: 'test1',
                versionName: 'test',
                versionCode: '1.0',
                ip: '192.1.1.1',
            }
            headerData = mergeDefined({...headerData}, debugData)
        } else if (authorization) {
            const resData = checkSessionData(headerData, req.headers.authorization)
            if (resData.result !== 'success') {
                return res.status(200).json(resData)
            }

            // checkSessionData 성공 시 반환하는 필드만 HeaderData에 반영
            const patch: Partial<HeaderData> = {
                userNo: resData.userNo, // string
                deviceId: resData.deviceId, // string
                // deviceType 등은 checkSessionData가 돌려주지 않으니 유지
            }
            headerData = mergeDefined({...headerData}, patch)

            // 세션 관련 값은 별도로 req에 보관(필요하면 사용)
            ;(req as any).session = {sessionSno: resData.sessionSno, userNo: resData.userNo}
        }

        // 요청 종료 시 로그 (ignore 리스트 제외)
        res.on('finish', () => {
            const qIndex = req.originalUrl.indexOf('?')
            const routePath = qIndex === -1 ? req.originalUrl : req.originalUrl.slice(0, qIndex)
            const isIgnored = Array.isArray(logIgnoreList) && logIgnoreList.includes(routePath)
            if (!isIgnored) {
                // insertRequestLog({
                //     req,
                //     res,
                //     responseBody,
                //     headerData,
                //     startTime,
                // }).catch(err => {
                //     console.error('🛑 Request log DB 저장 실패:', err)
                // })
            }
        })

        // 컨트롤러에서 참조하도록 주입
        ;(req as any).headerData = headerData
        next()
    }
}
