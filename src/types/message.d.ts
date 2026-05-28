// 발송 서비스
export type MessageProfile = 'corner' | 'cornerspace'
// 발송 메시지 타입
export type MessageBizType = 'at' | 'ai'
// 발송 상태값
export type MessageStatus = 'wait' | 'sending' | 'failure' | 'done' | 'error'
// 발송 시스템
export type SendServer = 'none' | 'api' | 'admin' | 'scheduler'

export interface MessageRequestData {
    messageCode: string;
    reqType: string;
    reqNo: string | number;
    reqIdx: number;
    userNo: number;          // 기본값 지정 불가
    changeValue?: Record<string, any>; // 기본값 지정 불가
}