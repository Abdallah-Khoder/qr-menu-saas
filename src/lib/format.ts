/** Date and time in Beirut time, Latin digits, e.g. "15 نوفمبر 2026، 15:04". */
export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat('ar-u-nu-latn', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Beirut',
  }).format(new Date(value));
}
