import express from "express"
import { logger } from "./logger"

export function createServer(): ReturnType<typeof express> {
  const app = express()

  app.get("/__health_check", (req, res) => {
    res.status(200).send("ok")
  })

  app.all("/:appId/:functionName", handler)

  async function handler(req: express.Request, res: express.Response) {
    logger.info("runtime handler")
    res.status(200).send(req.params)
  }

  return app
}
