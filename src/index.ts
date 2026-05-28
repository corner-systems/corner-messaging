// 반드시 최상단에서 선언해야 함
import express from 'express'
import cors from 'cors'
import type {Request, Response, NextFunction} from 'express'
import timeout from 'connect-timeout'
import {config} from './config/env.js'
import rootRouter from './routes/root.routes.js'
import testRouter from './routes/test.routes.js'    // james : 20250826 : 테스트용 라우터 추가
import messagingRouter from './routes/messaging.routes.js'    // james : 20250826 : 메시지 관련 라우터 추가
import {errorHandler} from './middlewares/errorHandler.js'

const app = express()

app.use(
  cors({
    origin: ['https://admin.corneropen.com', 'https://api.corneropen.com', 'https://api2.corneropen.com'],
    credentials: true,
  }),
);

app.set('trust proxy', true);

// 요청 타임아웃: 15초
app.use(timeout('30s'))
app.use(express.json())

// 라우트 마운트
app.use('/', rootRouter)
app.use('/messaging', messagingRouter)
// james : 20250826 : 테스트용 라우터 추가
app.use('/test', testRouter)

// 404
app.use((req: Request, res: Response) => {
    res.status(404).json({error: 'Not Found'})
})

// 에러 핸들러
app.use((err: unknown, req: Request, res: Response, next: NextFunction) =>
    errorHandler(err, req, res, next),
)

app.listen(config.port, () => {
    console.log(`✅ Server running at http://localhost:${config.port}`)
})
