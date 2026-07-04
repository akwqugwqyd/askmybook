export const isAdmin = (userId: string): boolean => {
    const configured = (process.env.ADMIN_USER_IDS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    return configured.includes(userId)
}
