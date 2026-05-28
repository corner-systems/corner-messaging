// src/utils/koreanUtils.ts
const initialConsonants = [
    'ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
] as const;

const medialVowels = [
    'ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ',
] as const;

const finalConsonants = [
    '','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
] as const;

const HANGUL_BASE = 0xac00; // '가'
const HANGUL_LAST = 0xd7a3; // '힣'
const CHO_UNIT = 588;       // 21 * 28
const JUNG_UNIT = 28;

function isHangulSyllable(codePoint: number): boolean {
    return codePoint >= HANGUL_BASE && codePoint <= HANGUL_LAST;
}

// 인덱싱 시 undefined를 방지하기 위한 안전 접근자
function pick<T>(arr: readonly T[], idx: number, fallback: T): T {
    return arr[idx] ?? fallback;
}

/**
 * 한글 음절을 초성/중성/종성으로 분해해 이어붙입니다.
 * 예) "강" -> "ㄱㅏㅇ"
 */
export function splitKoreanKeyword(keyword: string): string {
    if (!keyword) return '';

    const out: string[] = [];

    for (const ch of keyword) {
        const cp = ch.codePointAt(0);
        if (cp === undefined) continue; // 안전 가드

        const code = cp - HANGUL_BASE;

        if (isHangulSyllable(cp)) {
            const choIdx = Math.floor(code / CHO_UNIT);
            const jungIdx = Math.floor((code % CHO_UNIT) / JUNG_UNIT);
            const jongIdx = code % JUNG_UNIT;

            const cho  = pick(initialConsonants, choIdx, '');
            const jung = pick(medialVowels, jungIdx, '');
            const jong = pick(finalConsonants, jongIdx, '');

            out.push(cho, jung, jong);
        } else {
            out.push(ch);
        }
    }

    return out.join('');
}
