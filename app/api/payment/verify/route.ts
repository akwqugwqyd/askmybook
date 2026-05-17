import { NextRequest, NextResponse } from "next/server"

export async function GET(_req: NextRequest) {
  // Payment system is currently disabled
  // To enable Stripe integration, set up your Stripe account and environment variables
  return NextResponse.json(
    { error: "Payment system is currently disabled" },
    { status: 503 }
  )
}
