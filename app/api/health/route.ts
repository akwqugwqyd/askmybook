import { NextResponse } from "next/server"
import dbConnect from "@/database/mongoose"
import { logger } from "@/lib/logger"
import { validateEnv } from "@/lib/env"

export async function GET() {
  try {
    validateEnv()
    await dbConnect()
    
    logger.info("Health check passed")
    
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "connected",
      uptime: process.uptime(),
    })
  } catch (error) {
    logger.error("Health check failed", error)
    
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        database: "disconnected",
      },
      { status: 500 }
    )
  }
}
