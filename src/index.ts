import path from "node:path"
import express from "express"
import { createProxyMiddleware } from "http-proxy-middleware"
import { logger } from "./logger"
import { ensureApplication, getProcessDir } from "./application"

import { helloCode } from "./mock/code"

const app = express()
const port = 3000

app.use(
  "/:appId/:functionName",
  async (req, res, next) => {
    // 假设这里从数据库查出来了 compiled code
    // const compiledCode = helloCode
    logger.info("req")
    next()
  },
  createProxyMiddleware({
    router: async (req) => {
      const { appId } = req.params

      // 根据 appid 代理到不同的 UNIX socket
      const processId = await ensureApplication(appId)

      return {
        socketPath: path.resolve(getProcessDir(processId), "runtime.sock"),
      } as any
    },
  })
)

app.listen(port, () => {
  logger.info(`Example app listening on port ${port}`)
})
