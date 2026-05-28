// src/types/db/UserInfo.ts
import type {RowDataPacket} from 'mysql2'
import type {UserAuthStatus, UserStatus} from "../user.js";

export interface UserInfo extends RowDataPacket {
    userNo: number
    userId: string | null
    userNm: string | null
    status: UserStatus | null
    nickname: string | null
    cellPhone: string | null
    birthday: string | null
    email: string | null
    pushFl: YnFlag | null
    smsFl: YnFlag | null
    kakaoId: string | null
    naverId: string | null
    googleId: string | null
    appleId: string | null
    prptRegDailyFreeCnt: number
    profileImage: Record<string, unknown> | null
    info: Record<string, unknown> | null
    joinDt: Date | null
    regDt: Date | null
    modDt: Date | null
    deviceToken: string | null
}
