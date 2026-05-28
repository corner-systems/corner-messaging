// src/routes/user.routes.ts
import {Router} from 'express'
import * as testController from '../controllers/test.controller.js'
import requestContext from '../middlewares/request.context.middleware.js'
const router = Router()

// james : 20250826 : 알림톡 발송 테스트용
router.get('/sendAlimtalk', requestContext({authorization: false}), testController.sendAlimtalk)
// james : 20250826 : 푸시 발송 테스트용
router.get('/sendPush', requestContext({authorization: false}), testController.sendPush)
// james : 20250826 : SMS 발송 테스트용
router.get('/sendSms', requestContext({authorization: false}), testController.sendSms)

export default router
