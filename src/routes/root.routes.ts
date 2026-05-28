import {Router} from 'express'

const router = Router()

// GET /
router.get('/', (_req, res) => {
    res.json({result : true , message : 'Corner API'})
})

export default router
