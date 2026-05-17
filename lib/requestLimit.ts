import User from "@/database/models/user.model"
import dbConnect from "@/database/mongoose"
import { logger } from "@/lib/logger"

const FREE_TIER_REQUESTS = 3
const RESET_PERIOD_HOURS = 24

export async function checkRequestLimit(userId: string) {
  try {
    await dbConnect()

    const user = await User.findOne({ userId })

    if (!user) {
      // Create new user if doesn't exist
      const newUser = await User.create({
        userId,
        requestCount: 1,
        lastRequestReset: new Date(),
      })
      return { allowed: true, remaining: FREE_TIER_REQUESTS - 1 }
    }

    // Check if reset period has passed
    const now = new Date()
    const timeDiff = now.getTime() - user.lastRequestReset.getTime()
    const hoursDiff = timeDiff / (1000 * 60 * 60)

    if (hoursDiff >= RESET_PERIOD_HOURS) {
      // Reset request count
      user.requestCount = 1
      user.lastRequestReset = new Date()
      await user.save()
      return { allowed: true, remaining: FREE_TIER_REQUESTS - 1, reset: true }
    }

    // Check free tier limit
    if (user.requestCount < FREE_TIER_REQUESTS) {
      user.requestCount += 1
      await user.save()
      return {
        allowed: true,
        remaining: FREE_TIER_REQUESTS - user.requestCount,
      }
    }

    // Limit exceeded
    return {
      allowed: false,
      remaining: 0,
      limit: FREE_TIER_REQUESTS,
    }
  } catch (error) {
    logger.error("Request limit check failed:", error)
    // Allow request if check fails
    return { allowed: true }
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
