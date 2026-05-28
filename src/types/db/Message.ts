// src/types/db/Message.ts
import type {RowDataPacket} from 'mysql2'

// 발송 서비스
export type MessageProfile = 'corner' | 'cornerspace'
// 발송 메시지 타입
export type MessageBizType = 'at' | 'ai'
// 발송 상태값
export type MessageStatus = 'wait' | 'sending' | 'failure' | 'done' | 'error'
// 발송 시스템
export type SendServer = 'none' | 'api' | 'admin' | 'scheduler'

export interface MessageRequestData {
    messageCode?: string;
    reqType: string;
    reqNo: string | number;
    reqIdx: number;
    userNo: number;          // 기본값 지정 불가
    changeValue?: Record<string, any>; // 기본값 지정 불가
}

export type MessageRequestSmsData = MessageRequestData & {title : string, content : string, url? : string};

export interface MessagingAlimtalkLog {
    sno?: number
    profile?: MessageProfile
    template_code: string | null
    bizType: MessageBizType
    text: string | null
    attachment?: any // json
    reqType: string | null
    reqNo: string | number | null
    reqIdx: number
    status?: MessageStatus
    images?: any // json
    reservationFl?: YnFlag
    reservationDt?: string | null
    request: any
    result?: any
    sendDt?: string | null
    regDt?: string | null
    modDt?: string | null
}

// SELECT 결과용(조회 전용)
export type MessagingAlimtalkLogRow = MessagingAlimtalkLog & RowDataPacket;

// INSERT/UPDATE용(저장 전용)
export type MessagingAlimtalkLogInsert = MessagingAlimtalkLog;

export interface MessagingAlimtalkTemplate extends RowDataPacket {
    sno: number
    profile: MessageProfile
    messageCode: string | null
    templateCode: string | null
    bizType: MessageBizType
    sendServer: SendServer
    title: string | null
    text: string | null
    attachment: any
    useFl: YnFlag | null,
    regDt: string | null
}

export interface MessagingPushLog {
    sno?: number
    reqType: string | null
    reqNo: string | number | null
    reqIdx: number
    title: string | null
    body: string | null
    url?: string | null
    status?: MessageStatus
    images?: any
    reservationFl?: YnFlag
    reservationDt?: string | null
    request: any
    result?: any
    sendDt?: string | null
    regDt?: string | null
    modDt?: string | null
}

// SELECT 결과용(조회 전용)
export type MessagingPushLogRow = MessagingPushLog & RowDataPacket;

// INSERT/UPDATE용(저장 전용)
export type MessagingPushLogInsert = MessagingPushLog;

export interface MessagingPushTemplate extends RowDataPacket {
    sno: number
    messageCode: string | null
    title: string | null
    body: string | null
    url: string | null
    useFl: YnFlag | null
    sendServer: SendServer
    regDt: string | null
}

export interface MessagingSmsLog {
    sno?: number
    title: string | null
    content: string | null
    url?: string | null
    reqType: string | null
    reqNo: string | null
    reqIdx: number
    status?: MessageStatus
    images?: any
    reservationFl?: YnFlag
    reservationDt?: string | null
    request: any
    result?: any
    sendDt?: string | null
    regDt?: string | null
    modDt?: string | null
}

// SELECT 결과용(조회 전용)
export type MessagingSmsLogRow = MessagingSmsLog & RowDataPacket;

// INSERT/UPDATE용(저장 전용)
export type MessagingSmsLogInsert = MessagingSmsLog;

