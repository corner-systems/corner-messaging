// src/services/message.service.ts
import * as messagePushModel from '../models/message.push.model.js'
import * as messageSmsModel from '../models/message.sms.model.js'
import * as messageAlimtalkModel from '../models/message.alimtalk.model.js'
import * as userModel from '../models/user.model.js'
import { replaceTemplateVariables } from '../utils/common.js'
import * as fcm from './messaging/fcm.service.js'
import * as surem from './messaging/surem.service.js'
import type {
    MessageRequestData,
    MessageRequestSmsData,
    MessagingAlimtalkLogInsert,
    MessagingAlimtalkLogRow,
    MessagingPushLogInsert,
    MessagingPushLogRow,
    MessagingSmsLogInsert,
    MessagingSmsLogRow
} from '../types/db/Message.js'
import type {UserInfo} from '../types/db/User.js'
import type {SendOptions} from "./messaging/fcm.service.js";

// 알림톡 발송 요청
export async function insertAlimtalkV2(data : MessageRequestData, duplicateCheckFl: boolean = true): Promise<ResultRow | null> {
    // 수신자 정보
    const userInfo = (await userModel.selectUserInfo(data.userNo)) as UserInfo | undefined
    if (!userInfo)
        return { result: 'failure', message: '수신자 정보 조회 실패' }

    if(!data.messageCode)
       return { result: 'failure', message: 'messageCode 확인 불가' }

    // 템플릿 정보
    const templateInfo = await messageAlimtalkModel.selectTemplate(data.messageCode)
    if (!templateInfo)
        return { result: 'failure', message: '템플릿 정보 조회 실패' }

    let results: ResultRow | null =  null
    let text = templateInfo.text;
    let attachment = JSON.stringify(templateInfo.attachment);
    if(data.changeValue) {
        text = replaceTemplateVariables(text ?? '', data.changeValue)
        attachment = replaceTemplateVariables(attachment ?? '', data.changeValue)
    }

    if (userInfo.cellPhone && userInfo.smsFl === 'y' && text) {
        const values : MessagingAlimtalkLogInsert = {
            template_code: templateInfo.templateCode ?? '',
            bizType: templateInfo.bizType === 'ai' ? 'ai' : 'at',
            reqType: data.reqType,
            reqNo: data.reqNo,
            reqIdx: data.reqIdx,
            text: text,
            attachment: attachment,
            request: JSON.stringify({targetFl: 'select', receiver : [userInfo.cellPhone]}),
        }

        results = await messageAlimtalkModel.insertAlimtalkV2(values, duplicateCheckFl);
    }

    return results
}

// 대기중인 알림톡 발송
export async function sendAlimtalkHistoryV2(logSno : number = 0): Promise<ResultRow> {
    const list = await messageAlimtalkModel.selectLog(logSno);
    if (!list.length)
        return { result: 'success', message: '대기중인 히스토리가 없습니다.' }

    const result = { failure: 0, success: 0, reason: [] as any[] }
    for (const item  of list as MessagingAlimtalkLogRow[]) {
        if (item.sno != null) {
            // 발송중으로 상태값 변경
            await messageAlimtalkModel.changeStatusSending(item.sno)

            const request= item.request;
            if (request?.targetFl === 'select') {
                for (const receiver of request.receiver) {
                    try {
                        const res = await surem.sendAlimTalkV2(item, receiver)
                        if ((res as any).result === 'success')
                            result.success++
                        else {
                            result.failure++
                            result.reason.push((res as any).message ?? 'unknown')
                        }
                    } catch (e) {
                        result.failure++
                        result.reason.push(e)
                    }
                }
            }

            // 상태값 완료로 변경
            await messageAlimtalkModel.changeStatusDone(item.sno, result)
        }
    }

    return { result: 'success', data : result }
}


// 푸시 발송 요청
export async function insertPushV2(data : MessageRequestData, duplicateCheckFl: boolean = true): Promise<ResultRow | null> {
    // 수신자 정보
    const userInfo = (await userModel.selectUserInfo(data.userNo)) as UserInfo | undefined
    if (!userInfo)
        return { result: 'failure', message: '수신자 정보 조회 실패' }

    if(!data.messageCode)
       return { result: 'failure', message: 'messageCode 확인 불가' }

    // 템플릿 정보
    const templateInfo = await messagePushModel.selectTemplate(data.messageCode)
    if (!templateInfo)
        return { result: 'failure', message: '템플릿 정보 조회 실패' }

    let results: ResultRow | null =  null

    let title =  templateInfo.title;
    let body = templateInfo.body;
    let url = templateInfo.url;
    if(data.changeValue) {
        title = replaceTemplateVariables(title?? '', data.changeValue)
        body = replaceTemplateVariables(body ?? '', data.changeValue)
        url = replaceTemplateVariables(url ?? '', data.changeValue)
    }

    if (userInfo.cellPhone && userInfo.pushFl === 'y' && body) {
        const values : MessagingPushLogInsert = {
            reqType: data.reqType,
            reqNo: data.reqNo,
            reqIdx: data.reqIdx,
            title: title,
            body: body,
            url: url,
            request: JSON.stringify({targetFl: 'cellPhone', receiver : [userInfo.cellPhone]}),
        }

        results = await messagePushModel.insertPushV2(values, duplicateCheckFl);
    }

    return results
}

// 대기중인 푸시 발송
export async function sendPushHistoryV2(logSno : number = 0): Promise<ResultRow> {
    const list = await messagePushModel.selectLog(logSno);
    if (!list.length)
        return { result: 'success', message: '대기중인 히스토리가 없습니다.' }

    const result = { failure: 0, success: 0, reason: [] as any[] }
    for (const item  of list as MessagingPushLogRow[]) {
        if (item.sno != null) {
            // 발송중으로 상태값 변경
            await messagePushModel.changeStatusSending(item.sno)

            const request = item.request;
            const resTarget = await messagePushModel.selectTarget(request.targetFl, request.receiver);

            for (const userInfo of resTarget) {
                const {deviceToken} = userInfo;
                if(deviceToken) {
                    try {
                        const data: SendOptions = {
                            ...(item.title  != null ? { title: item.title }   : {}),
                            ...(item.content != null ? { body:  item.content } : {}),
                            ...(item.url    != null ? { url:   item.url }     : {}),
                        };

                        // @ts-ignore
                        const res = await fcm.sendNotification(String(item.sno), cellPhone, item.content ?? '')
                        if ((res as any).result === 'success')
                            result.success++
                        else {
                            result.failure++
                            result.reason.push(res)
                        }
                    } catch (e) {
                        result.failure++
                        result.reason.push(e)
                    }
                }
            }

            // 상태값 완료로 변경
            await messagePushModel.changeStatusDone(item.sno, result)
        }
    }

    return { result: 'success', data : result }
}


// SMS 발송 요청
export async function insertSMSV2(data : MessageRequestSmsData, duplicateCheckFl: boolean = true): Promise<ResultRow | null> {
    // 수신자 정보
    const userInfo = (await userModel.selectUserInfo(data.userNo)) as UserInfo | undefined
    if (!userInfo)
        return { result: 'failure', message: '수신자 정보 조회 실패' }

    let results: ResultRow | null =  null

    if (userInfo.cellPhone && userInfo.pushFl === 'y' && data.content) {
        const values : MessagingSmsLogInsert = {
            reqType: data.reqType,
            reqNo: data.reqNo != null ? String(data.reqNo) : null,
            reqIdx: data.reqIdx,
            title: data.title,
            content : data.content,
            url: data.url != null ? String(data.url) : '',
            request: JSON.stringify({targetFl: 'cellPhone', receiver : [userInfo.cellPhone]}),
        }

        results = await messageSmsModel.insertLog(values, duplicateCheckFl);
    }

    return results
}


// 대기중인 SMS 발송
export async function sendSmsHistoryV2(logSno : number = 0): Promise<ResultRow> {
    const list = await messageSmsModel.selectLog(logSno);
    if (!list.length)
        return { result: 'success', message: '대기중인 히스토리가 없습니다.' }

    const result = { failure: 0, success: 0, reason: [] as any[] }
    for (const item  of list as MessagingSmsLogRow[]) {
        if (item.sno != null) {
            // 발송중으로 상태값 변경
            await messageSmsModel.changeStatusSending(item.sno)

            const request = item.request;
            for (const cellPhone of request.receiver) {
                if(cellPhone && item.content) {
                    try {
                        const res = await surem.sendSms(item.content, cellPhone)
                        if ((res as any).result === 'success')
                            result.success++
                        else {
                            result.failure++
                            result.reason.push(res)
                        }
                    } catch (e) {
                        result.failure++
                        result.reason.push(e)
                    }
                }
            }

            // 상태값 완료로 변경
            await messageSmsModel.changeStatusDone(item.sno, result)
        }
    }

    return { result: 'success', data : result }
}