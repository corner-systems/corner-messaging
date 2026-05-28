// src/utils/messaging/fcm.ts
import { initializeApp, cert, getApps, getApp, type App } from 'firebase-admin/app';
import { getMessaging as _getMessaging, type Message, type Messaging } from 'firebase-admin/messaging';
import * as fs from 'fs';
import * as path from 'path';

let _app: App | null = null;
let _messaging: Messaging | null = null;

function sanitizeQuoted(value: string): string {
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    return value;
}

function readServiceAccountFrom() {
    // 🔧 여기서 src/data/serviceAccountKey.json 을 직접 바라보도록 수정
    const saPath = path.join(process.cwd(), 'src', 'data', 'serviceAccountKey.json');
    const raw = fs.readFileSync(saPath, 'utf8');
    return JSON.parse(raw);
}

function ensureAdminInitialized(): App {
    if (_app) return _app;
    if (getApps().length > 0) {
        _app = getApp();
        return _app;
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        _app = initializeApp();
        return _app;
    }

    const serviceAccount = readServiceAccountFrom();
    _app = initializeApp({
        credential: cert(serviceAccount),
    });
    return _app;
}

function getMessagingSafe(): Messaging {
    if (_messaging) return _messaging;
    const app = ensureAdminInitialized();
    _messaging = _getMessaging(app);
    return _messaging;
}

export interface SendOptions {
    title?: string;
    body?: string;
    url?: string | null;
    imageUrl?: string | null;
    dataOnly?: boolean;
}

export async function sendNotification(token: string, opts: SendOptions = {}): Promise<ResultRow> {
    const { title = '', body = '', url, imageUrl, dataOnly = false } = opts;

    const data: Record<string, string> = {};
    if (url != null) data.url = sanitizeQuoted(String(url));

    const msg: Message = {
        token,
        data,
        ...(dataOnly
            ? {
                android: { priority: 'high' },
                apns: {
                    headers: { 'apns-priority': '5' },
                    payload: { aps: { contentAvailable: true } },
                },
            }
            : {
                notification: { title, body },
                android: {
                    priority: 'high',
                    ...(imageUrl ? { notification: { imageUrl } } : {}),
                },
                apns: {
                    headers: { 'apns-priority': '10' },
                    payload: { aps: { mutableContent: !!imageUrl } },
                    // ...(imageUrl ? { fcmOptions: { image: imageUrl } } : {}),
                },
            }),
    };

    try {
        const id = await getMessagingSafe().send(msg);
        return { result: 'success', id };
    } catch (error) {
        const reason = error instanceof Error ? `${error.name}: ${error.message}` : error;
        return { result: 'failure', token, reason };
    }
}
