export const pad = (n: number) => n.toString().padStart(2, "0");

export const padDate = (time: Date) =>
  `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;

export function getToday() {
  return padDate(new Date());
}
