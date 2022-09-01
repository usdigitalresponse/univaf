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
        return JSON.parse(line);
      } catch (error) {
        throw new SyntaxError(`Error parsing line ${index + 1}: ${line}`);
      }
    });
}

module.exports = { parseJsonLines };
