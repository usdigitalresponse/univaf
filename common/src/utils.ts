/**
 * Parse a Newline-Delimited JSON (NDJSON) document.
 */
export function parseJsonLines(text: string): any[] {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        // Escape any unescaped tab characters. This fixes an issue with
        // improperly encoded JSON from some sources.
        line = line.replace(/\t/g, "\\t");
        return JSON.parse(line);
      } catch (error) {
        throw new SyntaxError(`Error parsing line ${index + 1}: ${line}`);
      }
    });
}
