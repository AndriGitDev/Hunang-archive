import type { Metadata } from "next";
import { ArchiveResults } from "@/components/ArchiveResults";
import "../../archive.css";

export const metadata: Metadata = {
  title: "Hunang results | Kastro Labs",
  description: "Explore the anonymous results of the Hunang SSH and Telnet honeypot field study.",
  alternates: { canonical: "/results" },
};

export default function ResultsPage() { return <ArchiveResults />; }
