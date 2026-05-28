// src/utils/s3/upload.ts
import * as fs from 'fs'
import * as path from 'path'
import { PutObjectCommand, S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'
import { config } from '../../config/env.js'

// multer 파일 타입 보완
// @ts-ignore
type LocalMulterFile = Express.Multer.File & { path?: string; buffer?: Buffer }

export async function uploadImagesToS3(
    files: Array<LocalMulterFile | undefined | null>,
    folder: string = 'tmp',
): Promise<FileDataType[]> {
    const s3 = new S3Client({
        region: config.aws?.region,
        credentials: {
            accessKeyId: config.aws?.accessKeyId,
            secretAccessKey: config.aws?.secretAccessKey,
        },
    })

    const bucketConf = config.aws?.bucket
    let bucketName = ''
    let baseUrl = ''

    if (bucketConf && typeof bucketConf === 'object') {
        const [bkt, url] = Object.entries(bucketConf)[0] ?? []
        bucketName = bkt ?? ''
        baseUrl = (url ?? '').replace(/\/$/, '')
    } else {
        throw new Error('S3 bucket 설정이 올바르지 않습니다.')
    }

    const uploaded: FileDataType[] = []

    for (const file of files) {
        if (!file) continue

        const extension = path.extname(file.originalname).toLowerCase().replace('.', '')
        const uuid = uuidv4()
        const key = `user_upload/${folder}/${uuid}.${extension}`

        const body =
            file.buffer && file.buffer.length > 0
                ? file.buffer
                : file.path
                    ? fs.createReadStream(file.path)
                    : null

        if (!body) continue

        try {
            await s3.send(
                new PutObjectCommand({
                    Bucket: bucketName,
                    Key: key,
                    Body: body,
                    ContentType: file.mimetype,
                }),
            )

            uploaded.push({
                url: `${baseUrl}/${key}`,
                name: file.originalname,
                type: file.mimetype,
                size: file.size,
                regDt: new Date().toISOString(),
            })
        } finally {
            if (file.path) {
                try {
                    fs.unlinkSync(file.path)
                } catch {
                    /* noop */
                }
            }
        }
    }

    return uploaded
}

/* ===================== 추가: 다운로드용 프리사인드 URL 생성 ===================== */

/** PHP rawurlencode 대응 (RFC 5987 filename*=UTF-8'' 인코딩용) */
function encodeRFC5987(value: string): string {
    return encodeURIComponent(value)
        .replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/%20/g, '%20')
}

/** 구성된 baseUrl(들) 또는 고정 S3 도메인이 앞에 붙은 전체 URL에서 Key만 추출 */
function toObjectKey(pathOrUrl: string): string {
    let key = pathOrUrl

    // 1) env에 설정된 baseUrl들을 모두 제거
    const bucketConf = config.aws?.bucket
    if (bucketConf && typeof bucketConf === 'object') {
        for (const [, url] of Object.entries(bucketConf)) {
            if (!url) continue
            const normalized = String(url).replace(/\/$/, '')
            if (key.startsWith(normalized + '/')) {
                key = key.slice(normalized.length + 1)
            }
        }
    }

    // 2) 과거 하드코딩된 S3 도메인 제거(호환용)
    const legacyBase = 'https://cornerai.s3.ap-northeast-2.amazonaws.com/'
    if (key.startsWith(legacyBase)) {
        key = key.slice(legacyBase.length)
    }

    // 3) s3://bucket/key 형태 허용
    if (key.startsWith('s3://')) {
        const without = key.replace(/^s3:\/\//, '')
        const firstSlash = without.indexOf('/')
        if (firstSlash >= 0) {
            key = without.slice(firstSlash + 1)
        } else {
            key = '' // 버킷만 있는 경우 → 빈 키
        }
    }

    // 4) 이미 https://<bucket>.s3.<region>.amazonaws.com/key 형태인 경우 처리
    const m = key.match(/^https?:\/\/[^/]+\/(.+)$/)
    if (m && m[1]) {
        key = m[1]
    }

    return key
}

/**
 * PHP:
 *   downloadFile($bucket, $path, $filename) → s3_download(…)
 *   - baseUrl 제거 → 기본 버킷 결정 → Content-Disposition 지정 → +10분 서명 URL
 *
 * @param bucket 명시 안 하면 env의 첫 번째 버킷 사용
 * @param pathOrUrl baseUrl/정식 S3 URL/키 모두 허용
 * @param filename 다운로드 시 노출될 파일명
 * @returns 10분짜리 프리사인드 URL
 */
export async function getSignedDownloadUrl(
    bucket: string | undefined,
    pathOrUrl: string,
    filename: string,
): Promise<string> {
    const bucketConf = config.aws?.bucket
    let defaultBucket = ''

    if (bucketConf && typeof bucketConf === 'object') {
        const [bkt] = Object.keys(bucketConf)
        defaultBucket = bkt ?? ''
    }
    const bucketName = bucket && bucket.length > 0 ? bucket : defaultBucket
    if (!bucketName) throw new Error('S3 bucket 이름을 찾을 수 없습니다.')

    const s3 = new S3Client({
        region: config.aws?.region,
        credentials: {
            accessKeyId: config.aws?.accessKeyId,
            secretAccessKey: config.aws?.secretAccessKey,
        },
    })

    const key = toObjectKey(pathOrUrl)
    if (!key) throw new Error('S3 Object Key가 비어 있습니다.')

    const encoded = encodeRFC5987(filename)
    const contentDisposition = `attachment; filename*=UTF-8''${encoded}`

    const cmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
        ResponseContentDisposition: contentDisposition,
    })

    // +10분
    const url = await getSignedUrl(s3, cmd, { expiresIn: 60 * 10 })
    return url
}
