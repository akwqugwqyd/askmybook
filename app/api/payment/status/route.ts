import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getUserRequestStatus } from "@/lib/requestLimit"
import { logger } from "@/lib/logger"

export async function GET(_req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const status = await getUserRequestStatus(userId)

    return NextResponse.json({
      success: true,
      ...status,
    })
  } catch (error) {
    logger.error("Status check error:", error)
    return NextResponse.json(
      { error: "Failed to check status" },
      { status: 500 }
    )
  }
}
