// src/controllers/app.controller.ts
import type {Request, Response, RequestHandler} from 'express'
import * as messageService from "../services/message.service.js";

// james : 20250827 : push history 발송
export const sendPushHistory: RequestHandler = async (req: Request, res: Response) => {
    const param = (req.query ?? {}) as any;
    const sno = param?.sno ?? 0;

    try {
        const resData = await messageService.sendPushHistoryV2(sno)
        return res.status(200).json(resData)
    } catch (err) {
        return res.status(200).json({result: 'error', message: 'Internal Server Error'})
    }
}

// james : 20250827 : SMS history 발송
export const sendSmsHistory: RequestHandler = async (req: Request, res: Response) => {
    const param = (req.query ?? {}) as any;
    const sno = param?.sno ?? 0;

    try {
        const resData = await messageService.sendSmsHistoryV2(sno)
        return res.status(200).json(resData)
    } catch (err) {
        return res.status(200).json({result: 'error', message: 'Internal Server Error'})
    }
}

// james : 20250827 : 알림톡 history 발송
export const sendAlimtalkHistory: RequestHandler = async (req: Request, res: Response) => {
    const param = (req.query ?? {}) as any;
    const sno = param?.sno ?? 0;

    try {
        const resData = await messageService.sendAlimtalkHistoryV2(sno)
        return res.status(200).json(resData)
    } catch (err) {
        return res.status(200).json({result: 'error', message: 'Internal Server Error'})
    }
}
