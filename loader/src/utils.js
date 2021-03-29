const MULTIPLE_SPACE_PATTERN = /[\n\s]+/g;
const PUNCTUATION_PATTERN = /[.,;\-–—'"“”‘’!()/\\]+/g;
const ADDRESS_LINE_DELIMITER_PATTERN = /,|\n|\s-\s/g;

// Common abbreviations in addresses and their expanded, full English form.
// These are used to match similar addresses. For example:
//   For example: "600 Ocean Blvd" and "600 Ocean Boulevard"
// They're always used in lower-case text where punctuation has been removed.
const ADDRESS_EXPANSIONS = [
  [/ ave? /g, " avenue "],
  [/ dr /g, " drive "],
  [/ est(ate)? /g, " estates "],
  [/ expy /g, " expressway "],
  [/ fwy /g, " freeway "],
  [/ rd /g, " road "],
  [/ st /g, " street "],
  [/ blvd /g, " boulevard "],
  [/ ln /g, " lane "],
  [/ cir /g, " circle "],
  [/ ct /g, " court "],
  [/ cor /g, " corner "],
  [/ (cmn|common) /g, " commons "],
  [/ ctr /g, " center "],
  [/ n /g, " north "],
  [/ s /g, " south "],
  [/ e /g, " east "],
  [/ w /g, " west "],
];

module.exports = {
  /**
   * Simplify a text string (especially an address) as much as possible so that
   * it might match with a similar string from another source.
   * @param {string} text
   * @returns {string}
   */
  matchable(text) {
    return text
      .replace(PUNCTUATION_PATTERN, " ")
      .replace(MULTIPLE_SPACE_PATTERN, " ")
      .trim()
      .toLowerCase();
  },

  matchableAddress(text, line = null) {
    let lines = text.split(ADDRESS_LINE_DELIMITER_PATTERN);

    // If there are multiple lines and it looks like the first line is the name
    // of a place (rather than the street), drop the first line.
    if (lines.length > 1 && !/\d/.test(lines[0])) {
      lines = lines.slice(1);
    }

    if (line != null) {
      lines = lines.slice(line, line + 1);
    }

    let result = module.exports.matchable(lines.join(", "));
    for (const [pattern, expansion] of ADDRESS_EXPANSIONS) {
      result = result.replace(pattern, expansion);
    }

    return result;
  },

  /**
   * Template string tag that transforms a template string into a single line.
   * Line breaks and indentations are reduced to a single space character.
   * @param {Array<string>} strings String components of the template literal.
   * @param  {...any} replacements Interpolated replacements in the template.
   * @returns {string}
   *
   * @example
   * oneLine`This
   *   text is
   *   on multiple lines but
   *        it'll be reduced to
   * just one.
   * ` === `This text is on multiple lines but it'll be reduced to just one.`
   */
  oneLine(strings, ...replacements) {
    const removablePattern = /\n\s*/g;
    const length = replacements.length;
    return strings
      .map((text, index) => {
        let unbroken = text.replace(removablePattern, " ");
        unbroken += length > index ? String(replacements[index]) : "";
        return unbroken;
      })
      .join("")
      .trim();
  },

  /**
   * Remove an item matching a predicate function from an array and return it.
   * @param {Array} list Array to remove the item from.
   * @param {(any) => bool} predicate Function to identify an item to remove
   */
  popItem(list, predicate) {
    const index = list.findIndex(predicate);
    return index > -1 ? list.splice(index, 1)[0] : undefined;
  },

  /**
   * Capitalize the first letter of each word in a string.
   * @param {string} text
   * @returns {string}
   */
  titleCase(text) {
    return text
      .split(" ")
      .map(
        (chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase()
      )
      .join(" ");
  },

  /**
   * Get a promise that resolves after N milliseconds. This is useful for
   * suspending an async function for a brief period:
   * @param {int} milliseconds Time to wait in milliseconds.
   * @returns {Promise}
   *
   * @example
   * async function whatever() {
   *   doSomething();
   *   await wait(500);
   *   doSomethingElse();
   * }
   */
  wait(milliseconds) {
    return new Promise((resolve) =>
      setTimeout(() => resolve(milliseconds), milliseconds)
    );
  },

  /**
   * Log a warning to STDERR on the console.
   * @param {...any} infos
   */
  warn(...infos) {
    // TODO: replace with real logger, maybe with fancy colors and whatnot.
    console.warn("Warning:", ...infos);
  },

  randomInt(low, high) {
    return Math.floor(Math.random() * (high - low) + low);
  },
};
