// src/utils/checkSession.ts
import type {IncomingHttpHeaders} from 'http'
import {AESDecrypt} from './common.js'

const ENCRYPT_KEY = process.env.ENCRYPT_KEY ?? "cornerai";

/** User-Agent 기반으로 deviceType 추론 */
function detectDeviceType(userAgent: string): string {
    if (!userAgent) return 'Unknown'

    if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS'
    if (/Android/i.test(userAgent)) return 'Android'
    if (/Windows/i.test(userAgent)) return 'Windows'
    if (/Macintosh|Mac OS X/i.test(userAgent)) return 'Mac'
    if (/Linux/i.test(userAgent)) return 'Linux'
    return 'Unknown'
}

/** req.headers → HeaderData 매핑 */
export function getHeaderData(headers: IncomingHttpHeaders): HeaderData {
    // user-no: string | string[] | undefined → number로 안전 변환
    const rawUserNo = headers['user-no']
    const userNoParsed = Number(Array.isArray(rawUserNo) ? rawUserNo[0] : rawUserNo)
    const userNo = Number.isFinite(userNoParsed) ? userNoParsed : 0

    const userAgent = String(headers['user-agent'] ?? '')
    let deviceType = String(headers['device-type'] ?? '')
    if (!deviceType || deviceType === 'null') {
        deviceType = detectDeviceType(userAgent)
    }

    const data = {
        userNo, // ✅ number
        deviceId: String(headers['device-id'] ?? ''),
        deviceType: deviceType,
        deviceToken: String(headers['device-token'] ?? ''),
        versionName: String(headers['version-name'] ?? ''),
        versionCode: String(headers['version-code'] ?? ''),
        ip: String(headers['ip'] ?? headers['x-forwarded-for'] ?? ''),
    } as HeaderData;

    return data;
}

export function checkSessionData(header: HeaderData, authorization?: string): ResultRow {
    const {deviceId, deviceType} = header

    if (!authorization || !authorization.startsWith('Bearer ')) {
        return {
            result: 'failure',
            message: 'Authorization header is missing or invalid 세션 인증 확인 필요',
        }
    }
    if (!deviceId || !deviceType) {
        return {
            result: 'failure',
            message: '필수 헤더(deviceId/deviceType)가 없습니다.',
        }
    }

    let sessionObj: Record<string, unknown>
    try {
        const sessionToken = authorization.split(' ')[1]
        // @ts-ignore
        const decrypted = AESDecrypt(ENCRYPT_KEY, sessionToken)
        sessionObj = JSON.parse(decrypted)
    } catch {
        return {result: 'failure', message: '세션 토큰 복호화/파싱 실패'}
    }

    const sessDeviceId = String(sessionObj['deviceId'] ?? '')
    const sessDeviceType = String(sessionObj['deviceType'] ?? '')
    const sessUserNo = Number(sessionObj['userNo'] ?? 0)
    const sessionSno = Number(sessionObj['sessionSno'] ?? 0)

    if (!sessDeviceId)
        return {
            result: 'failure',
            message: 'session의 deviceId값을 찾을 수 없습니다.',
        }
    if (!Number.isFinite(sessUserNo))
        return {
            result: 'failure',
            message: 'session의 userNo값을 찾을 수 없습니다.',
        }
    if (deviceId !== sessDeviceId)
        return {
            result: 'failure',
            message: '기기의 deviceId와 session의 deviceId가 일치하지 않습니다.',
        }
    if (deviceType !== sessDeviceType)
        return {
            result: 'failure',
            message: '기기의 deviceType과 session의 deviceType이 일치하지 않습니다.',
        }

    return {result: 'success', sessionSno, userNo: sessUserNo, deviceId: sessDeviceId}
}
