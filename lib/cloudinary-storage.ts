import cloudinary from "@/lib/cloudinary"

const expiresAt = () => Math.floor(Date.now() / 1000) + 600

export const signedDocumentUrl = (
    pdfUrl: string,
    storagePublicId?: string,
): string => {
    if (!storagePublicId) return pdfUrl

    // Direct raw uploads retain the .pdf extension in their public ID.
    // Cloudinary's authenticated download endpoint must receive that complete
    // public ID with an empty separate format value.
    if (storagePublicId.toLowerCase().endsWith(".pdf")) {
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
