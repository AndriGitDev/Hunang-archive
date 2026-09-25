import Link from "next/link";
import { KastroStar } from "@/components/KastroStar";

export function ArchiveHeader({ active }: { active: "report" | "results" }) {
  return <header className="archive-header">
    <Link href="/" className="archive-brand"><KastroStar size={18} color="#161616" /> hunang<span className="archive-brand-dot">.</span></Link>
    <nav aria-label="Main navigation">
      <Link href="/" aria-current={active === "report" ? "page" : undefined}>The report</Link>
      <Link href="/results" aria-current={active === "results" ? "page" : undefined}>Explore results</Link>
      <a href="https://github.com/AndriGitDev/Hunang">Source code ↗</a>
    </nav>
  </header>;
}
