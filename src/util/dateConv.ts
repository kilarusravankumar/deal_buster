
function ConvertToDate(unixTimeStamp: number): string {
  const date: Date = new Date(unixTimeStamp * 1000)
  return date.toLocaleDateString()
}

export default ConvertToDate;
