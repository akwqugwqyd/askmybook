import HeroSection from '@/components/HeroSection'
import BookGrid from '@/components/BookGrid'

const Home = () => {
    return (
        <main className="min-h-screen bg-[#0D0C0A]">
            <HeroSection />
            <section className="px-6 py-10 max-w-6xl mx-auto">
                <p className="text-xs text-[#5A5048] uppercase tracking-widest mb-6">
                    My Books
                </p>
                <BookGrid />
            </section>
        </main>
    )
}

export default Home

