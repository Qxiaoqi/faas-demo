import path from "node:path"
import fs from "node:fs"
import { exec, ChildProcess } from "child_process"
import waitOn from "wait-on"
import { logger } from "./logger"

let autoProcessId = 0

const promiseMap = new Map<string, Promise<any>>()

export function ensureApplication(_appId: string | number) {
  const appId = _appId.toString()
  const promise = promiseMap.get(appId)

  // 这里是防止多次请求导致 同一个 app 进来创建多个子进程
  if (promise) {
    return promise
  }

  const result = _ensureApplication(appId)
  promiseMap.set(appId, result)
  result.finally(() => promiseMap.delete(appId))

  return result
}

// {<appId>: <processId>}
const appProcessMap = new Map<string, string>()
// {<processId> : <appId>}
const processAppMap = new Map<string, string>()

async function _ensureApplication(appId: string) {
  if (appProcessMap.has(appId)) {
    return appProcessMap.get(appId)!
  }

  const processId = await getIdleProcess()

  appProcessMap.set(appId, processId)
  processAppMap.set(processId, appId)
  logger.info(`Application "${appId}" is running at process "${processId}"`)

  return processId
}

// 闲置进程队列
const idleProcesses: string[] = []

export async function getIdleProcess() {
  if (idleProcesses.length) {
    const id = idleProcesses.pop()!
    logger.info(`use pre-created idle process id=${id}`)
    return id
  }

  const processId = generateProcessId()
  logger.info(`no idle process, create a new one id=${processId}`)
  await createProcess(processId)

  // if there is no idle process, create it in advance
  createIdleProcess()

  return processId
}

function generateProcessId() {
  return `process-${(autoProcessId++).toString(16)}`
}

export function getProcessDir(processId: string) {
  return path.resolve(process.cwd(), ".workspace", processId)
}

export async function createIdleProcess() {
  const processId = generateProcessId()
  await createProcess(processId)
  idleProcesses.push(processId)
}

export async function createProcess(processId: string) {
  const processDir = getProcessDir(processId)
  await fs.promises.mkdir(processDir, { recursive: true })

  try {
    await fs.promises.access(path.resolve(processDir, "runtime.sock"))
    return
  } catch (e) {}

  logger.info(`Starting process "${processId}"`)

  const child = exec(`node ${path.resolve(__dirname, "start.js")}`, {
    cwd: processDir,
    env: {
      ...process.env,
      FAAS_PROCESS_ID: processId,
    },
  })

  if (process.env.NODE_ENV !== "production") {
    child.stdout?.pipe(process.stdout)
    child.stderr?.pipe(process.stderr)
  }

  logger.info(
    `waiting for process ${processId} server to start at ${processDir}`
  )

  // 服务启动需要时间，因此这里会等到服务启动完成之后再进行后面的逻辑
  await waitOn({
    resources: [`http://unix:${processDir}/runtime.sock:/__health_check`],
    timeout: 5000,
  })

  logger.info(`process ${processId} server started`)

  // 定期检查目标 server 是否存活
  const interval = setInterval(async () => {
    // liveness check
    const alive = await checkProcess(processId, child)
    if (!alive) {
      logger.error(`Application "${processId}" doesn't response, killed`)
      clearInterval(interval)
    }
  }, 10000)
}

export async function checkProcess(processId: string, child: ChildProcess) {
  const processDir = getProcessDir(processId)

  try {
    // ready check
    await waitOn({
      delay: 1000,
      simultaneous: 1,
      resources: [`http://unix:${processDir}/runtime.sock:/__health_check`],
      timeout: 5000,
    })
    return true
  } catch (e) {
    try {
      child.kill(9)
      await fs.promises.rm(path.resolve(processDir, "runtime.sock"), {
        force: true,
      })
      await fs.promises.rm(path.resolve(processDir, "runtime.pid"), {
        force: true,
      })
    } catch (e) {
      logger.stack(e)
    } finally {
      const appId = processAppMap.get(processId)
      processAppMap.delete(processId)
      appProcessMap.delete(appId!)
      return false
    }
  }
}
