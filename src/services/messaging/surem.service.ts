// src/utils/messaging/suremAlimTalk.ts
import axios from 'axios'
import {formatPhoneNumberWithCountryCode, normalizePhoneNumber} from "../../utils/common.js"
import type {MessagingAlimtalkLogRow} from "../../types/db/index.js";
import {getCurrentFormat} from "../../utils/date.js";

export async function getToken(): Promise<any> {
    try {
        const response: any = await axios.post(
            process.env.SUREM_API_URL + `/auth/token`,
            {
                userCode: process.env.SUREM_USERCODE,
                secretKey: process.env.SUREM_SECRET_KEY,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 8000, // 필요시 timeout 설정
            }
        );

        if(response?.data?.code != 'A0000' || !response?.data) {
            return {result: 'failure', message: '토큰 생성 실패하였습니다', response : response}
        }
        return {result : 'success', accessToken : response?.data?.data.accessToken}
    } catch (error: any) {
        return {result : 'failure', message : '토큰 생성 실패하였습니다.', error : error}
    }
}


// 알림톡 발송 등록
export async function sendAlimTalkV2(item : MessagingAlimtalkLogRow, receiver: string): Promise<ResultRow> {
    const resToken = await getToken();
    if(resToken.result != 'success')
        return resToken;

    const accessToken = resToken.accessToken;

    let senderKey = '';
    if (item.profile === 'corner') {
        senderKey = process.env.SUREM_SENDER_KEY_CORNER ?? '';
    } else if (item.profile === 'cornerspace') {
        senderKey = process.env.SUREM_SENDER_KEY_CORNERSPACE ?? '';
    }
    const to = formatPhoneNumberWithCountryCode(receiver);

    const data = {
        bizType: item.bizType,
        senderKey: senderKey,
        to: to,
        reqPhone: process.env.SUREM_REQPHONE ?? '',
        templateCode: item.template_code ?? '',
        reSend : 'y',
        messageId: `${item.sno}${Math.floor(Math.random() * 1000)
            .toString()
            .padStart(3, '0')}`,
        text : item.text,
        attachment: item.attachment
    }

    try {
        // 5) 발송
        const response = await axios.post<any>(
            `${process.env.SUREM_API_URL}/send/alimtalk`,
            data,
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                timeout: 8000,
            }
        );

        // 6) 응답 검사: 반드시 response.data로 접근
        if (response?.data?.code !== 'A0000') {
            return {
                result: 'failure',
                message: response?.data?.message ?? '알림톡 발송에 실패했습니다.',
                response: response.data,
            };
        }

        return { result: 'success', receiver : receiver};
    } catch (err: any) {
        // 네트워크/타임아웃/예외 처리
        return {
            result: 'failure',
            message: err?.message ?? '알림톡 발송 중 오류가 발생했습니다.',
            response: err?.response?.data ?? err,
        };
    }
}


// SMS 발송 등록
export async function sendSms(text : string, receiver: string): Promise<ResultRow> {
    const resToken = await getToken();

    if(resToken.result != 'success')
        return resToken;

    const accessToken = resToken.accessToken;
    const to = normalizePhoneNumber(receiver);
    const data = {
        to: to,
        text : text,
        reqPhone: process.env.SUREM_REQPHONE
    }

    // ✅ SMS / MMS 자동 판별
    const isMms = Buffer.byteLength(text, 'utf8') > 84
    const url = isMms
        ? `${process.env.SUREM_API_URL}/send/mms`
        : `${process.env.SUREM_API_URL}/send/sms`

    try {
        const response = await axios.post<any>(
            url,
            data,
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                timeout: 8000,
            }
        );

        if (response?.data?.code !== 'A0000') {
            return {
                result: 'failure',
                message: response?.data?.message ?? '문자 발송에 실패했습니다.',
                response: response.data,
            };
        }

        return { result: 'success', receiver : receiver};
    } catch (err: any) {
        // 네트워크/타임아웃/예외 처리
        return {
            result: 'failure',
            message: err?.message ?? '문자 발송 중 오류가 발생했습니다.',
            response: err?.response?.data ?? err,
        };
    }
}