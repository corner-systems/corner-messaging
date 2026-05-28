// utils.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as crypto from 'crypto'

/** 회사명에서 불필요한 법인/기호 등을 제거하여 반환 */
export function cleanCompanyName(name: string): string {
    const removeWords = ['주식회사', '유한회사', '비영리법인', '(주)', '(c)', '(C)', '㈜']
    let cleanedName = name
    removeWords.forEach(word => {
        cleanedName = cleanedName.replace(new RegExp(word, 'g'), '')
    })
    cleanedName = cleanedName.trim()
    if (cleanedName.length < 2) return name
    return cleanedName
}

/** 숫자를 3자리 단위로 콤마(,) 구분하여 문자열로 반환 */
export function number_format(num: number): string {
    const integerPart = Math.floor(num)
    return integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** AES 암호화 키를 32바이트로 맞추기 위해 패딩 처리 */
function padEncryptionKey(key: string): string {
    const targetLength = 32
    if (key.length >= targetLength) return key.slice(0, targetLength)
    return (
        key +
        'abcdefg'
            .repeat(Math.ceil((targetLength - key.length) / 7))
            .slice(0, targetLength - key.length)
    )
}

/** AES-256-CBC 방식으로 문자열을 암호화하여 'IV:암호문' 형태로 반환 */
export function AESEncrypt(encryptionKey: string, text: string): string {
    const padded = padEncryptionKey(encryptionKey)
    const keyBuf = Buffer.from(padded, 'utf8')
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuf, iv)
    let encrypted = cipher.update(text, 'utf8', 'base64')
    encrypted += cipher.final('base64')
    return `${iv.toString('base64')}:${encrypted}`
}

/** 'IV:암호문' 형태의 문자열을 AES-256-CBC 방식으로 복호화 */
export function AESDecrypt(encryptionKey: string, encryptedText: string): string {
    const padded = padEncryptionKey(encryptionKey)
    const keyBuf = Buffer.from(padded, 'utf8')
    const [ivBase64, encryptedData] = encryptedText.split(':')
    if (!ivBase64 || !encryptedData) {
        throw new Error('잘못된 암호문 형식입니다. (IV:CipherText)')
    }
    const iv = Buffer.from(ivBase64, 'base64')
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuf, iv)
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
}

/** 템플릿 문자열에서 #{key} 형태의 변수를 changeData 값으로 치환 */
export function replaceTemplateVariables(
    template: any | null,
    changeData: Record<string, unknown>,
): string {
    if (template == null) return ''
    if (typeof template !== 'string') throw new Error('유효하지 않은 템플릿 문자열입니다.')
    if (!changeData || typeof changeData !== 'object')
        throw new Error('유효하지 않은 치환 데이터입니다.')
    return template.replace(/#\{(.*?)\}/g, (_match, key: string) =>
        Object.prototype.hasOwnProperty.call(changeData, key) && changeData[key] !== undefined
            ? String(changeData[key])
            : `#{${key}}`,
    )
}

/** 휴대폰 번호에서 공백/하이픈을 제거하고 국내 형식(010...)으로 변환 */
export function normalizePhoneNumber(phoneNumber: string): string {
    let cleaned = phoneNumber.replace(/[\s-]/g, '')
    if (cleaned.startsWith('+82')) {
        cleaned = '0' + cleaned.slice(3)
    } else if (cleaned.startsWith('82')) {
        cleaned = '0' + cleaned.slice(2)
    }
    if (cleaned.startsWith('010')) {
        return cleaned
    }
    return phoneNumber
}

/** 국내 휴대폰 번호를 카카오 알림톡 발송용 국가코드(82-) 형태로 변환 */
export function formatPhoneNumberWithCountryCode(phoneNumber: string): string {
    const cleanedNumber = normalizePhoneNumber(phoneNumber).replace(/\D/g, '')
    if (cleanedNumber.length !== 11) {
        throw new Error('올바른 11자리 전화번호를 입력하세요.')
    }
    const countryCode = '82'
    const areaCode = cleanedNumber.slice(1, 3)
    const firstPart = cleanedNumber.slice(3, 7)
    const secondPart = cleanedNumber.slice(7)
    return `${countryCode}-${areaCode}-${firstPart}-${secondPart}`
}

/** 금액을 억/만원 단위로 나누어 반환 */
export function separateFormatPrice(price: number): {
    billion: number | null
    million: number
} {
    if (price < 10000) {
        return {billion: null, million: 0}
    }
    const billion = price >= 100000000 ? Math.floor(price / 100000000) : null
    const million = Math.floor((price % 100000000) / 10000)
    return {billion, million}
}

/** 금액을 'n억 n만원' 형식으로 변환 */
export function formatPrice(price: number): string {
    const {billion, million} = separateFormatPrice(price)
    let result = ''
    if (billion !== null) result += `${billion}억`
    if (million !== null && million > 0) {
        if (result) result += ' '
        result += `${million}만원`
    } else if (result) {
        result += '원'
    }
    return result
}

/** 날짜 문자열을 'M월 D일 hh:mm AM/PM' 형식으로 변환 */
export function formatDate(dateString: string): string {
    const months = [
        '1월',
        '2월',
        '3월',
        '4월',
        '5월',
        '6월',
        '7월',
        '8월',
        '9월',
        '10월',
        '11월',
        '12월',
    ]
    const meridian = ['AM', 'PM']
    const date = new Date(dateString.replace(/-/g, '/'))
    const month = months[date.getMonth()]
    const day = date.getDate()

    let hours = date.getHours()
    const minutes = date.getMinutes()
    const isPM = hours >= 12

    hours = hours % 12
    if (hours === 0) hours = 12

    const formattedMinutes = minutes < 10 ? `0${minutes}` : String(minutes)
    const period = isPM ? meridian[1] : meridian[0]

    return `${month} ${day}일 ${hours}:${formattedMinutes} ${period}`
}

/** 날짜 문자열을 'YYYY.MM.DD' 형식으로 변환 */
export function formatDateYYYYMMDD(dateString: string): string {
    const date = new Date(dateString.replace(/-/g, '/'))
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}.${month}.${day}`
}

/** 주소 문자열에서 괄호 안의 내용을 제거 */
export function removeParenthesesContent(address: string): string {
    return address.replace(/\s*\(.*?\)\s*/g, ' ').trim()
}

/** 현재 날짜를 'YYYYMMDD' 형식으로 반환 */
export function getFormattedDate(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}${month}${day}`
}

/** HTML 태그를 제거하고, 이스케이프된 <, > 문자를 복원 */
export function stripHtmlTags(str?: string): string {
    if (!str) return ''
    return str
        .replace(/<[^>]*>/g, '')
        .replace(/\\u003C/g, '<')
        .replace(/\\u003E/g, '>')
}
