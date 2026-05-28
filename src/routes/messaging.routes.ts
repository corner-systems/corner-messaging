// src/routes/propertyRegistry.routes.ts
import { Router } from 'express';
import requestContext from '../middlewares/request.context.middleware.js';
import * as messagingController from '../controllers/messaging.controller.js'

const router = Router();
// push history 발송
router.get('/sendPushHistory', requestContext({authorization: false}), messagingController.sendPushHistory)
// sms history 발송
router.get('/sendSmsHistory', requestContext({authorization: false}), messagingController.sendSmsHistory)
// 알림톡 history 발송
router.get('/sendAlimtalkHistory', requestContext({authorization: false}), messagingController.sendAlimtalkHistory)

export default router
