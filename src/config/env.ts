// config/env.ts
import 'dotenv/config'

const dev = {
    aws: {
        region: process.env.DEV_AWS_REGION ?? '',
        accessKeyId: process.env.DEV_AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.DEV_AWS_SECRET_ACCESS_KEY ?? '',
        bucket: {cornerai: process.env.DEV_AWS_BUCKET_CORNERAI ?? ''},
    },
}

const real = {
    aws: {
        region: process.env.REAL_AWS_REGION ?? '',
        accessKeyId: process.env.REAL_AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.REAL_AWS_SECRET_ACCESS_KEY ?? '',
        bucket: {cornerai: process.env.REAL_AWS_BUCKET_CORNERAI ?? ''},
    },
}

export const config = {
    port: Number(process.env.PORT ?? 61002),
    env: process.env.DEV_MODE === 'true' ? 'dev' : 'real',
    db: {
        host: process.env.DB_HOST ?? '',
        user: process.env.DB_USER ?? '',
        password: process.env.DB_PASSWORD ?? '',
        database: process.env.DB_NAME ?? '',
        connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
    },
    aws: process.env.DEV_MODE === 'true' ? real.aws : real.aws,
} as const
