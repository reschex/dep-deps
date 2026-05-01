export function countdown(n: number): void {
  if (n > 0) countdown(n - 1);
}
