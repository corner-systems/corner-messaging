import type {Request, Response, RequestHandler} from 'express'
import * as messageService from "../services/message.service.js";
import type {MessageRequestData, MessageRequestSmsData} from "../types/db/index.js";
import {sendSmsHistoryV2} from "../services/message.service.js";

// james : 20250826 : 알림톡 발송 테스트용
export const sendAlimtalk: RequestHandler = async (req: Request, res: Response) => {
    try {
        const changeValue = {고객명: '박재운', 주소: '테스트 222', sno : 2137};

        // 발송 요청 정보
        const messageData : MessageRequestData = {
            messageCode: 'price_1st_can',
            reqType: 'property_sale',
            reqNo: 2137,
            reqIdx: 0,
            userNo: 2470,
            changeValue: changeValue
        }
        const resMsg = await messageService.insertAlimtalkV2(messageData, false);

        // 즉시 발송 처리
        if(resMsg?.result == 'success') {
            if(resMsg.logSno) {
                const resData = await messageService.sendAlimtalkHistoryV2(resMsg.logSno)
                return res.status(200).json(resData)
            }
        }

        return res.status(200).json(resMsg)
    } catch (err) {
        return res.status(200).json({result: 'error', message: 'Internal Server Error'})
    }
}

// james : 20250826 : push 발송 테스트
export const sendPush: RequestHandler = async (req: Request, res: Response) => {
    try {
        const changeValue = {고객명: '박재운', 주소: '테스트 222', sno : 2137};

        // 발송 요청 정보
        const messageData : MessageRequestData = {
            messageCode: 'price_1st',
            reqType: 'property_sale',
            reqNo: 2137,
            reqIdx: 0,
            userNo: 1904,
            changeValue: changeValue
        }
        const resMsg = await messageService.insertPushV2(messageData, false);

        // 즉시 발송 처리
        if(resMsg?.result == 'success') {
            if(resMsg.logSno) {
                const resData = await messageService.sendPushHistoryV2(resMsg.logSno)
                return res.status(200).json(resData)
            }
        }

        return res.status(200).json(resMsg)
    } catch (err) {
        return res.status(200).json({result: 'error', message: 'Internal Server Error'})
    }
}

// james : 20250826 : sms 발송 테스트
export const sendSms: RequestHandler = async (req: Request, res: Response) => {
    try {
        const resData = await messageService.sendSmsHistoryV2(0)
        // 발송 요청 정보
        const messageData : MessageRequestSmsData = {
            reqType: '테스트용',
            reqNo: 2137,
            reqIdx: 0,
            userNo: 2470,
            title : '제목',
            content : '내용',
        }
        const resMsg = await messageService.insertSMSV2(messageData, false);
        // 즉시 발송 처리
        if(resMsg?.result == 'success') {
            if(resMsg.logSno) {
                const resData = await messageService.sendSmsHistoryV2(resMsg.logSno)
                return res.status(200).json(resData)
            }
        }

        return res.status(200).json(resData)
    } catch (err) {
        return res.status(200).json({result: 'error', message: 'Internal Server Error'})
    }
}
























