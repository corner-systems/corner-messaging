// types/global.d.ts
import type {RowDataPacket} from 'mysql2'
import type {DeviceType} from "./db/User.js";

export {} // 모듈로 인식되도록 처리 (필수)

declare global {
    interface HeaderData {
        sessionSno: number
        userNo: number
        deviceId: string
        deviceType: DeviceType
        deviceToken: string
        versionName: string
        versionCode: string
        ip: string
    }

    type DeviceType = 'android' | 'ios' | 'etc'

    /** 'y' 또는 'n' 값을 가지는 플래그 타입 */
    type YnFlag = 'y' | 'n'

    type FileDataType = {
        url: string
        name: string
        type: string
        size: number
        regDt: string
    }

    // SELECT COUNT(*) AS cnt 결과용
    interface CountRow extends RowDataPacket {
        cnt: number
    }

    type RequestContextOptions = {
        authorization?: boolean
    }


    type ResultRow = { result: 'success' | 'failure' | 'error'; [k: string]: any };
}
