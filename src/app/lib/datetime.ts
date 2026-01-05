export function formatDateTimePH(input: Date | string | number): string {
  const date = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}


