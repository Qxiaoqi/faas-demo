import fs from "node:fs"
import path from "node:path"
import { createServer } from "./runtime"

// const cwd = process.env.WORKSPACE_DIR!
const cwd = process.cwd()

export async function startServer() {
  if (!cwd) {
    throw new Error("WORKSPACE_DIR environment variable is not set")
  }

  console.info(`Starting server at ${process.cwd()}`)
  const server = createServer()

  await fs.promises.writeFile("runtime.pid", process.pid.toString())
  await fs.promises.rm("runtime.sock", { force: true })

  console.info(`listening ${process.cwd()}/runtime.sock`)

  server.listen("runtime.sock")
}

process.on("exit", cleanup)
process.on("SIGINT", cleanup)
process.on("SIGUSR1", cleanup)
process.on("SIGUSR2", cleanup)
process.on("uncaughtException", cleanup)
process.on("unhandledRejection", cleanup)

process.stdin.on("data", (data) => {
  console.log(data)
  const message: any = JSON.stringify(data.toString("utf-8"))
  process.env.FAAS_APP_ID = message.appId
})

function cleanup(...args: any[]) {
  console.error(...args)
  fs.rmSync("runtime.pid", { force: true })
  fs.rmSync("runtime.sock", { force: true })
  process.exit(1)
}

startServer()
