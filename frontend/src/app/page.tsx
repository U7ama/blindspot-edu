import Link from "next/link";
import Shell, { button, secondary, panel } from "@/components/adaptive/Shell";
export default function Home() {
  return (
    <Shell>
      <main className="mx-auto max-w-7xl px-5 py-16 sm:py-24">
        <div className="max-w-3xl">
          <p className="mb-6 text-xs font-mono uppercase tracking-[.25em] text-rose-300">
            A lecture is only the beginning
          </p>
          <h1 className="text-5xl font-semibold tracking-tight leading-[1.08] sm:text-7xl">
            Learn what your lecture{" "}
            <span className="text-stone-500">assumed you knew.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-stone-400">
            Find possible missing prerequisites. Check what you already know.
            Get a focused explanation, try a new question, and return to the
            lecture—with the original evidence beside you.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link className={button} href="/workspace">
              Open the learning workspace →
            </Link>
            <a className={secondary} href="#how-it-works">
              See the learning flow
            </a>
          </div>
          <p className="mt-4 text-xs text-stone-500">
            Public samples need no registration. Recording uploads are limited
            to invited pilot participants.
          </p>
        </div>
        <section id="how-it-works" className="mt-20 grid gap-4 md:grid-cols-3">
          {[
            [
              "01",
              "Find the missing step",
              "See which ideas were explained, assumed, or covered later in the recording.",
            ],
            [
              "02",
              "Learn only what you need",
              "A short check helps you choose whether to review a prerequisite or keep going.",
            ],
            [
              "03",
              "Return with evidence",
              "Try a different question, resume your lesson, and inspect the original excerpt.",
            ],
          ].map(([n, title, text]) => (
            <article key={n} className={panel}>
              <p className="text-xs font-mono text-rose-300">{n}</p>
              <h2 className="mt-5 text-xl font-medium">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-stone-400">{text}</p>
            </article>
          ))}
        </section>
        <section className="mt-14 border-l-2 border-[#701a24] pl-6">
          <h2 className="text-xl font-medium">Teaching with receipts</h2>
          <p className="mt-3 max-w-2xl leading-7 text-stone-400">
            A lecture timestamp can show where an idea was mentioned. It cannot
            prove an explanation the lecturer never gave. Blindspot labels
            supplementary teaching separately so you can tell the difference.
          </p>
        </section>
      </main>
    </Shell>
  );
}
