export default async function DocumentPreviewPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    return (
        <main className="h-[calc(100vh-65px)] bg-[#0d0c0a] p-3">
            <iframe
                title="Document preview"
                src={`/api/books/${encodeURIComponent(id)}/preview`}
                className="h-full w-full rounded-xl border border-[#2c2721] bg-white"
            />
        </main>
    )
}
