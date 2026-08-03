import cloudinary from "@/lib/cloudinary"

const expiresAt = () => Math.floor(Date.now() / 1000) + 600

export const signedDocumentUrl = (
    documentUrl: string,
    storagePublicId?: string,
): string => {
    if (!storagePublicId) return documentUrl

    // Raw uploads retain their extension in the public ID. Cloudinary's
    // authenticated download endpoint must receive that complete ID.
    if (/\.[a-z0-9]+$/i.test(storagePublicId)) {
        return cloudinary.utils.private_download_url(storagePublicId, "", {
            resource_type: "raw",
            type: "authenticated",
            expires_at: expiresAt(),
        })
    }

    // Compatibility for files created by the previous server-stream upload.
    return cloudinary.url(storagePublicId, {
        resource_type: "raw",
        type: "authenticated",
        sign_url: true,
        expires_at: expiresAt(),
    })
}
