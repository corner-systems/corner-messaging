// src/models/message.sms.model.ts
import type {RowDataPacket, ResultSetHeader} from 'mysql2'
import db from '../config/database.js'
import type {MessagingSmsLogRow, MessagingSmsLogInsert} from '../types/db/index.js'

// 푸시 발송 대기 목록 입력
export async function insertLog(data : MessagingSmsLogInsert, duplicateCheckFl : boolean = true): Promise<ResultRow> {
    // 중복 발송 여부 체크
    if(duplicateCheckFl) {
        // 기존 발송 내역 있는지 체크 (원본 코드처럼 corner 스키마 사용)
        const checkSql = `SELECT * FROM corner.ct_messaging_sms_log WHERE reqType = ? AND reqNo = ? AND reqIdx = ?`
        const [exist] = await db.query<MessagingSmsLogRow[]>(checkSql, [data.reqType, data.reqNo, data.reqIdx])
        if (exist.length > 0) {
            return { result: 'failure', message: '이미 발송 내역이 있음' }
        }
    }

    const insertSql = `
    INSERT INTO ct_messaging_sms_log
      (title, content, url, reqType, reqNo, reqIdx, request, reservationFl, reservationDt, status)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'wait')
  `
    const params = [
        data.title, data.content, data.url, data.reqType, data.reqNo, data.reqIdx, data.request, 'n'
    ]

    try {
        const [result] = await db.query<ResultSetHeader>(insertSql, params)
        return { result: 'success', type : 'sms', logSno : result.insertId, reqType : data.reqType, reqNo: data.reqNo, reqIdx : data.reqIdx }
    } catch {
        return { result: 'failure', message: '메시지 발송 로그 기록 실패' }
    }
}

/** 대기중인 SMS 로그 조회 */
export async function selectLog(sno : number = 0): Promise<MessagingSmsLogRow[]> {
    const values: any[] = []

    let query = `
    SELECT *
    FROM ct_messaging_sms_log
    WHERE status = "wait"
      AND (reservationFl = "n" OR (reservationFl = "y" AND reservationDt < NOW()))
  `
    if(sno > 0) {
        query += ` AND sno = ?`
        values.push(sno)
    }
    query += ` ORDER BY sno LIMIT 100`

    const [rows] = await db.query<MessagingSmsLogRow[]>(query, values)
    return rows
}

/** 상태: sending */
export async function changeStatusSending(sno: number): Promise<ResultSetHeader> {
    const query = `
    UPDATE ct_messaging_sms_log
    SET status = "sending"
    WHERE status = "wait" AND sno = ?
  `
    const [res] = await db.query<ResultSetHeader>(query, [sno])
    return res
}

/** 상태: done + 결과 저장 */
export async function changeStatusDone(sno: number, result: unknown): Promise<ResultSetHeader> {
    const query = `
    UPDATE ct_messaging_sms_log
    SET status = "done", result = ?
    WHERE status = "sending" AND sno = ?
  `
    const [res] = await db.query<ResultSetHeader>(query, [JSON.stringify(result), sno])
    return res
}

