export default async function DocumentPreviewPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    return (
        <main className="app-frame h-[calc(100vh-65px)] p-3">
            <iframe
                title="Document preview"
                src={`/api/books/${encodeURIComponent(id)}/preview`}
                className="h-full w-full rounded-xl border border-[#b7e6ff]/20 bg-white shadow-2xl shadow-black/20"
            />
        </main>
    )
}
