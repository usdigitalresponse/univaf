/**
 * Parse a Newline-Delimited JSON (NDJSON) document.
 * @param {string} text
 * @returns {Array<any>}
 */
function parseJsonLines(text) {
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

module.exports = { parseJsonLines };
