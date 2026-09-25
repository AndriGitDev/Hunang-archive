import type { Metadata } from "next";
import { ArchiveReport } from "@/components/ArchiveReport";
import "../archive.css";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default function Page() {
  return <ArchiveReport />;
}
