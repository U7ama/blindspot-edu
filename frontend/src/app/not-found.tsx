import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#09090b] text-white p-6">
      <h1 className="text-3xl font-bold tracking-tight mb-2">404 - Page Not Found</h1>
      <p className="text-sm text-neutral-400 mb-6">The requested lecture or resource does not exist.</p>
      <Link
        href="/"
        className="px-4 py-2 rounded-xl bg-[#701a24] hover:bg-[#881337] text-xs font-semibold tracking-tight transition-colors text-white"
      >
        Return to Home
      </Link>
    </main>
  );
}
