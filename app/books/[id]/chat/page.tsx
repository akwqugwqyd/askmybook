import { redirect } from "next/navigation"

export default async function LegacyDocumentChatPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    redirect(`/chat?documents=${encodeURIComponent(id)}`)
}
