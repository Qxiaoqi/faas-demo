import { createLogger } from "@infra-node-kit/logger/standalone"

export const logger = createLogger({
  disableFile: process.env.NODE_ENV !== "production",
})
