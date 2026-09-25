import { observedAt } from "@/lib/archive";

export function ArchiveFooter() {
  return <footer className="archive-footer">
    <p><strong>Hunang</strong> / a Kastro Labs field study</p>
    <p>Anonymous rollup snapshot: {observedAt.replace("T", " ").slice(0, 16)} UTC</p>
    <a href="https://kastro.is">Kastro Labs ↗</a>
  </footer>;
}
