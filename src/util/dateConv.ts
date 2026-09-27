// A missing timestamp is 0 (or absent) rather than a date — agent-supplied deals
// carry no release date at all. Rendering that as the epoch would read as a real
// 1970 release, so it becomes a dash instead.
function ConvertToDate(unixTimeStamp: number): string {
  if (!unixTimeStamp || !Number.isFinite(unixTimeStamp)) return "—"
  const date: Date = new Date(unixTimeStamp * 1000)
  return date.toLocaleDateString()
}

export default ConvertToDate;
