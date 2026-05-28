// src/models/message.alimtalk.model.ts
import db from '../config/database.js'
import type { ResultSetHeader } from 'mysql2'
import type {MessagingAlimtalkLogRow, MessagingAlimtalkLogInsert, MessagingAlimtalkTemplate} from '../types/db/index.js'

/** 대기중인 SMS 로그 조회 */
export async function selectLog(sno : number = 0): Promise<MessagingAlimtalkLogRow[]> {
    const values: any[] = []

    let query = `
    SELECT *
    FROM ct_messaging_alimtalk_log
    WHERE status = "wait"
      AND (reservationFl = "n" OR (reservationFl = "y" AND reservationDt < NOW()))
  `
    if(sno > 0) {
        query += ` AND sno = ?`
        values.push(sno)
    }
    query += ` ORDER BY sno LIMIT 100`

    const [rows] = await db.query<MessagingAlimtalkLogRow[]>(query, values)
    return rows
}

/** 상태: sending */
export async function changeStatusSending(sno: number): Promise<ResultSetHeader> {
    const query = `
    UPDATE ct_messaging_alimtalk_log
    SET status = "sending"
    WHERE status = "wait" AND sno = ?
  `
    const [res] = await db.query<ResultSetHeader>(query, [sno])
    return res
}

/** 상태: done + 결과 저장 */
export async function changeStatusDone(sno: number, result: unknown): Promise<ResultSetHeader> {
    const query = `
    UPDATE ct_messaging_alimtalk_log
    SET status = "done", result = ?
    WHERE status = "sending" AND sno = ?
  `
    const [res] = await db.query<ResultSetHeader>(query, [JSON.stringify(result), sno])
    return res
}

/** 템플릿 조회(useFl="y" 최신 1건) */
export async function selectTemplate(messageCode: string): Promise<MessagingAlimtalkTemplate | undefined> {
    const sql = `
    SELECT *
    FROM ct_messaging_alimtalk_template
    WHERE messageCode = ? AND useFl = "y"
    ORDER BY sno DESC
    LIMIT 1
  `
    const [rows] = await db.query<MessagingAlimtalkTemplate[]>(sql, [messageCode])
    return rows[0]
}

/** 동일 유형(reqType/reqNo) 최신 1건 조회 */
export async function selectLatestAlimtalkLog(
    reqType: string,
    reqNo: string | number
): Promise<MessagingAlimtalkLogRow | undefined> {
    const sql = `
    SELECT *
    FROM ct_messaging_alimtalk_log
    WHERE reqType = ? AND reqNo = ?
    ORDER BY sno
    LIMIT 1
  `
    const [rows] = await db.query<MessagingAlimtalkLogRow[]>(sql, [reqType, reqNo])
    return rows[0]
}

/**
 * 알림톡 발송 로그 인서트
 * - 이미 동일 reqType/reqNo/reqIdx가 있으면 failure 반환
 */
export async function insertAlimtalkV2(data : MessagingAlimtalkLogInsert, duplicateCheckFl : boolean = true): Promise<ResultRow> {
    // 중복 발송 여부 체크
    if(duplicateCheckFl) {
        // 기존 발송 내역 있는지 체크 (원본 코드처럼 corner 스키마 사용)
        const checkSql = `SELECT * FROM corner.ct_messaging_alimtalk_log WHERE reqType = ? AND reqNo = ? AND reqIdx = ?`
        const [exist] = await db.query<MessagingAlimtalkLogRow[]>(checkSql, [data.reqType, data.reqNo, data.reqIdx])
        if (exist.length > 0) {
            return { result: 'failure', message: '이미 발송 내역이 있음' }
        }
    }

    const insertSql = `
    INSERT INTO ct_messaging_alimtalk_log
      (template_code, bizType, text, attachment, reqType, reqNo, reqIdx, request, reservationFl, reservationDt, status)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'wait')
  `
    const params = [
        data.template_code,
        data.bizType,
        data.text,
        data.attachment,
        data.reqType,
        data.reqNo,
        data.reqIdx,
        data.request,
        'n', // reservationFl
    ]

    try {
        const [result] = await db.query<ResultSetHeader>(insertSql, params)
        return { result: 'success', type : 'alimtalk', logSno : result.insertId, reqType : data.reqType, reqNo: data.reqNo, reqIdx : data.reqIdx }
    } catch {
        return { result: 'failure', message: '메시지 발송 로그 기록 실패' }
    }
}