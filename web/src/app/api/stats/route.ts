import { totals } from "@/lib/archive";

export const dynamic = "force-static";

/** Legacy endpoint retained for old links; its values are a dated snapshot. */
export function GET() {
  return Response.json(
    { totals, archived: true },
    {
      headers: {
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
