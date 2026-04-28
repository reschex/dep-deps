export function parseComplexityFromMessage(message: string): number | undefined {
  const m = /complexity of (\d+)/i.exec(message);
  return m ? parseInt(m[1], 10) : undefined;
}
