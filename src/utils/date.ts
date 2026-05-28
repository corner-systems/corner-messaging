// @ts-ignore
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

const KST = 'Asia/Seoul';

// 플러그인 초기화 1회 보장
let __inited = false;
function initDayjsOnce() {
    if (__inited) return;
    dayjs.extend(utc);
    dayjs.extend(timezone);
    dayjs.tz.setDefault(KST);
    __inited = true;
}

/**
 * 현재 시간을 Asia/Seoul(기본값) 타임존 기준 Dayjs 객체로 반환
 */
export function getCurrentTime(): Dayjs {
    initDayjsOnce();
    return dayjs.tz();
}

/**
 * 현재 시간을 지정된 형식으로 포맷하여 문자열 반환
 * @param frm - 포맷 문자열 (기본값: 'YYYY-MM-DD HH:mm:ss')
 */
export function getCurrentFormat(frm: string = 'YYYY-MM-DD HH:mm:ss'): string {
    return getCurrentTime().format(frm);
}
