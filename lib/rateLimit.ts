interface RateLimitStore {
  [key: string]: { count: number; resetTime: number }
}

const store: RateLimitStore = {}

export function rateLimit(identifier: string, limit: number = 100, windowMs: number = 60000) {
  const now = Date.now()
  const key = identifier
  
  if (!store[key] || store[key].resetTime < now) {
    store[key] = { count: 1, resetTime: now + windowMs }
    return { success: true }
  }
  
  if (store[key].count < limit) {
    store[key].count++
    return { success: true }
  }
  
  return { 
    success: false, 
    retryAfter: Math.ceil((store[key].resetTime - now) / 1000)
  }
}
