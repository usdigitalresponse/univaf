const got = require("got");
const config = require("./config");

const MULTIPLE_SPACE_PATTERN = /[\n\s]+/g;
const PUNCTUATION_PATTERN = /[.,;\-–—'"“”‘’`!()/\\]+/g;
const POSSESSIVE_PATTERN = /['’]s /g;
const ADDRESS_LINE_DELIMITER_PATTERN = /,|\n|\s-\s/g;

// Common abbreviations in addresses and their expanded, full English form.
// These are used to match similar addresses. For example:
//   For example: "600 Ocean Hwy" and "600 Ocean Highway"
// They're always used in lower-case text where punctuation has been removed.
// In some cases, the replacements *remove* the abbreviation entirely to enable
// better loose matching (usually for road types, like "road" vs. "street").
const ADDRESS_EXPANSIONS = [
  [/ i /g, " interstate "],
  [/ i-(\d+) /g, " interstate $1 "],
  [/ expy /g, " expressway "],
  [/ fwy /g, " freeway "],
  [/ hwy /g, " highway "],
  [/ (u s|us) /g, " "], // Frequently in "U.S. Highway / US Highway"
  [/ (s r|sr|st rt|state route|state road) /g, " route "],
  [/ rt /g, " route "],
  [/ (tpke?|pike) /g, " turnpike "],
  [/ ft /g, " fort "],
  [/ mt /g, " mount "],
  [/ mtn /g, " mountain "],
  [/ (is|isl|island) /g, " "],
  [/ n /g, " north "],
  [/ s /g, " south "],
  [/ e /g, " east "],
  [/ w /g, " west "],
  [/ nw /g, " northwest "],
  [/ sw /g, " southwest "],
  [/ ne /g, " northeast "],
  [/ se /g, " southeast "],
  [/ ave? /g, " "],
  [/ avenue? /g, " "],
  [/ dr /g, " "],
  [/ drive /g, " "],
  [/ rd /g, " "],
  [/ road /g, " "],
  [/ st /g, " "],
  [/ street /g, " "],
  [/ saint /g, " "], // Unfortunately, this gets mixed in with st for street.
  [/ blvd /g, " "],
  [/ boulevard /g, " "],
  [/ ln /g, " "],
  [/ lane /g, " "],
  [/ cir /g, " "],
  [/ circle /g, " "],
  [/ ct /g, " "],
  [/ court /g, " "],
  [/ cor /g, " "],
  [/ corner /g, " "],
  [/ (cmn|common|commons) /g, " "],
  [/ ctr /g, " "],
  [/ center /g, " "],
  [/ pl /g, " "],
  [/ place /g, " "],
  [/ plz /g, " "],
  [/ plaza /g, " "],
  [/ pkw?y /g, " "],
  [/ parkway /g, " "],
  [/ cswy /g, " "],
  [/ causeway /g, " "],
  [/ byp /g, " "],
  [/ bypass /g, " "],
  [/ mall /g, " "],
  [/ (xing|crssng) /g, " "],
  [/ crossing /g, " "],
  [/ sq /g, " "],
  [/ square /g, " "],
  [/ trl? /g, " "],
  [/ trail /g, " "],
  [/ (twp|twsp|townsh(ip)?) /g, " "],
  [/ est(ate)? /g, " estates "],
  [/ vlg /g, " "],
  [/ village /g, " "],
  [/ (ste|suite|unit|apt|apartment) #?(\d+) /g, " $1 "],
  [/ #?(\d+) /g, " $1 "],
  [/ (&|and) /g, " "],
];

const USER_AGENTS = [
  "Mozilla/5.0 CK={} (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko 	Internet Explorer 11 	Web Browser 	Computer 	Very common",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36 	Chrome 74 	Web Browser 	Computer 	Very common",
  "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36 	Chrome 72 	Web Browser 	Computer 	Very common",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Safari/537.36 	Chrome 74 	Web Browser 	Computer 	Very common",
  "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1; .NET CLR 1.1.4322) 	Internet Explorer 6 	Web Browser 	Computer 	Very common",
  "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1) 	Internet Explorer 6 	Web Browser 	Computer 	Very common",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.113 Safari/537.36 	Chrome 60 	Web Browser 	Computer 	Very common",
  "Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko 	Internet Explorer 11 	Web Browser 	Computer 	Very common",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/17.17134",
];

module.exports = {
  USER_AGENTS,

  /**
   * Simplify a text string (especially an address) as much as possible so that
   * it might match with a similar string from another source.
   * @param {string} text
   * @returns {string}
   */
  matchable(text) {
    return text
      .toLowerCase()
      .replace(POSSESSIVE_PATTERN, " ")
      .replace(PUNCTUATION_PATTERN, " ")
      .replace(MULTIPLE_SPACE_PATTERN, " ")
      .trim();
  },

  matchableAddress(text, line = null) {
    let lines = Array.isArray(text)
      ? text
      : text.split(ADDRESS_LINE_DELIMITER_PATTERN);

    // If there are multiple lines and it looks like the first line is the name
    // of a place (rather than the street), drop the first line.
    if (lines.length > 1 && !/\d/.test(lines[0])) {
      lines = lines.slice(1);
    }

    if (line != null) {
      lines = lines.slice(line, line + 1);
    }

    let result = module.exports.matchable(lines.join(" "));
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

  /**
   * Get a random integer between a `low` value (inclusive) and a `high` value
   * (exclusive).
   * @param {number} low Lowest possible value
   * @param {number} high Highest possible value
   * @returns number
   */
  randomInt(low, high) {
    return Math.floor(Math.random() * (high - low) + low);
  },

  /**
   * Get a random User-Agent string.
   *
   * Some sites use User-Agent (in combination with other things like IP
   * address or cookies) to detect bots or single clients that are making lots
   * of requests (like us!) and ban them. Switching user agents on each request
   * or every few requests can help reduce the likelihood of getting blocked.
   *
   * (Often we need to use additional measures, too, like running from multiple
   * IPs or using proxies.)
   * @returns string
   */
  randomUserAgent() {
    return USER_AGENTS[module.exports.randomInt(0, USER_AGENTS.length)];
  },

  /**
   * Split `text` at most once by `delim`.
   * @param {string} text
   * @param {string} delim
   * @returns {Array<string>}
   */
  splitOnce(text, delim) {
    const i = text.indexOf(delim);
    if (i < 0) {
      return [text];
    } else {
      return [text.substring(0, i), text.substring(i + delim.length)];
    }
  },

  /**
   * Parse a Newline-Delimited JSON (NDJSON) document.
   * @param {string} text
   * @returns {Array<any>}
   */
  parseJsonLines(text) {
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
  },

  /**
   * A pre-configured Got instance with appropriate headers, etc.
   * @type {import("got").GotRequestFunction}
   */
  httpClient: got.extend({
    headers: { "User-Agent": config.userAgent },
  }),

  /**
   * Remove key/value pairs from an object using a filter function. Effectively
   * the same as `Array.filter()`, but for Objects.
   * @param {Object} source Object to filter entries from.
   * @param {([string, any]) => boolean} predicate Filter function. Takes an
   *        an array with an entry key and value as the only argument.
   * @returns {Object}
   */
  filterObject(source, predicate) {
    return Object.fromEntries(Object.entries(source).filter(predicate));
  },
};
