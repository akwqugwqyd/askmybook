import User from "@/database/models/user.model"
import dbConnect from "@/database/mongoose"
import { logger } from "@/lib/logger"

const FREE_TIER_REQUESTS = Number(process.env.AI_DAILY_REQUEST_LIMIT || 10)
const RESET_PERIOD_HOURS = 24

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object"
  && error !== null
  && "code" in error
  && (error as { code?: unknown }).code === 11000

export async function checkRequestLimit(userId: string) {
  try {
    await dbConnect()

    const now = new Date()
    const resetBefore = new Date(now.getTime() - RESET_PERIOD_HOURS * 60 * 60 * 1000)
    const reset = await User.updateOne(
      { userId, lastRequestReset: { $lt: resetBefore } },
      { $set: { requestCount: 0, lastRequestReset: now } },
    )

    let updated = await User.findOneAndUpdate(
      { userId, requestCount: { $lt: FREE_TIER_REQUESTS } },
      { $inc: { requestCount: 1 } },
      { returnDocument: "after" },
    )

    if (!updated) {
      try {
        updated = await User.create({
          userId,
          requestCount: 1,
          lastRequestReset: now,
        })
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error
        updated = await User.findOneAndUpdate(
          { userId, requestCount: { $lt: FREE_TIER_REQUESTS } },
          { $inc: { requestCount: 1 } },
          { returnDocument: "after" },
        )
      }
    }

    if (updated) {
      return {
        allowed: true,
        remaining: Math.max(0, FREE_TIER_REQUESTS - updated.requestCount),
        reset: reset.modifiedCount > 0,
      }
    }

    return {
      allowed: false,
      remaining: 0,
      limit: FREE_TIER_REQUESTS,
    }
  } catch (error) {
    logger.error("Request limit check failed:", error)
    // Fail closed: an unavailable limiter must not create unbounded AI spend.
    return { allowed: false, remaining: 0, limit: FREE_TIER_REQUESTS }
  }
}

export async function getUserRequestStatus(userId: string) {
  try {
    await dbConnect()

    const user = await User.findOne({ userId })

    if (!user) {
      return {
        requestCount: 0,
        remaining: FREE_TIER_REQUESTS,
        limit: FREE_TIER_REQUESTS,
      }
    }

    const now = new Date()
    const timeDiff = now.getTime() - user.lastRequestReset.getTime()
    const hoursDiff = timeDiff / (1000 * 60 * 60)

    if (hoursDiff >= RESET_PERIOD_HOURS) {
      return {
        requestCount: 0,
        remaining: FREE_TIER_REQUESTS,
        limit: FREE_TIER_REQUESTS,
        resetIn: 0,
      }
    }

    return {
      requestCount: user.requestCount,
      remaining: Math.max(0, FREE_TIER_REQUESTS - user.requestCount),
      limit: FREE_TIER_REQUESTS,
      resetIn: RESET_PERIOD_HOURS - hoursDiff,
    }
  } catch (error) {
    logger.error("Get request status failed:", error)
    return {
      requestCount: 0,
      remaining: FREE_TIER_REQUESTS,
      limit: FREE_TIER_REQUESTS,
    }
  }
}
