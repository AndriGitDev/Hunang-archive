import { archive, integer, utcDay } from "@/lib/archive";

export function ArchiveChart() {
  const max = Math.max(...archive.daily.map((day) => day.count));
  return <div className="archive-chart" role="img" aria-label={`Daily login attempts from ${utcDay(archive.daily[0].bucketStart)} to ${utcDay(archive.daily.at(-1)!.bucketStart)}. Peak: ${integer(max)} attempts in one day.`}>
    {archive.daily.map((day) => <div className="archive-chart-column" key={day.bucketStart} title={`${utcDay(day.bucketStart)}: ${integer(day.count)} attempts`}>
      <span style={{ height: `${Math.max(2, day.count / max * 100)}%` }} />
    </div>)}
  </div>;
}
