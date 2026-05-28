// src/models/user.model.ts
import db from '../config/database.js'
import type {UserInfo} from '../types/db/User.js'

export async function selectUserInfo(userNo: number): Promise<UserInfo | undefined> {
    const sql = `
    SELECT
      ui.userNo, ui.userId, ui.userNm, ui.nickname, ui.cellPhone, ui.email,
      ui.pushFl, ui.smsFl, ui.status, ui.kakaoId, ui.naverId, ui.googleId, ui.appleId,
      ui.prptRegDailyFreeCnt, ui.profileImage, ui.joinDt,
      (SELECT deviceToken FROM ct_user_device WHERE userNo=ui.userNo ORDER BY regDt DESC LIMIT 1) AS deviceToken
    FROM ct_user_info AS ui
    WHERE ui.status="active" AND ui.userNo = ?
    LIMIT 1
  `
    const [rows] = await db.query<UserInfo[]>(sql, [userNo])
    return rows[0]
}
