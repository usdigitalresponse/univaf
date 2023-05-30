const { Duration } = require("luxon");
const metrics = require("./metrics");
const { Logger } = require("./logging");

/** @typedef {import("luxon").DateTime} DateTime */

/**
 * @typedef {Object} AgeStatistics
 * @property {string} source
 * @property {number[]} samples
 * @property {number} min
 * @property {number} max
 * @property {number} [average]
 * @property {number} [median]
 */

const DEFAULT_STALE_THRESHOLD = Duration.fromObject({ days: 1 }).toMillis();

const logger = new Logger("stale");

class StaleChecker {
  /** @type {Map<string, AgeStatistics>} */
  #bySource = new Map();

  #finished = false;

  /**
   * StaleChecker tracks statistics about the age/staleness of location records
   * found by the loader.
   * @param {Object} options
   * @param {Date|DateTime|number} [options.relativeTo] When to calculate age
   *        relative to.
   * @param {number} [options.threshold] Consider records older than this many
   *        milliseconds to be stale.
   */
  constructor({
    relativeTo = new Date(),
    threshold = DEFAULT_STALE_THRESHOLD,
  } = {}) {
    /** @type {Date} */
    this.relativeTo = relativeTo.toJSDate?.() ?? new Date(relativeTo);
    /** @type {number} */
    this.threshold = threshold;
  }

  /**
   * Get an {@link AgeStatistics} object for the given source.
   * @param {string} source
   * @returns {AgeStatistics}
   */
  getStatisticsForSource(source) {
    if (!this.#bySource.has(source)) {
      this.#bySource.set(source, {
        source,
        min: Infinity,
        max: -Infinity,
        samples: [],
      });
    }
    return this.#bySource.get(source);
  }

  /**
   * Aggregate statistics for a record and return its age in milliseconds.
   * @param {any} record
   * @returns {number}
   */
  checkRecord(record) {
    if (!record.availability) return null;

    const stats = this.getStatisticsForSource(record.availability.source);
    const age = StaleChecker.calculateAge(this.relativeTo, record);
    if (age == null) return null;

    this.#finished = false;
    stats.samples.push(age);
    if (stats.min > age) stats.min = age;
    if (stats.max < age) stats.max = age;

    return age;
  }

  /**
   * Aggregate statistics for a record and return the record if it is fresh or
   * `null` if the record is stale.
   * @param {any} record
   * @returns {any|null}
   */
  filterRecord(record) {
    const age = this.checkRecord(record);
    return age > this.threshold ? null : record;
  }

  /**
   * Get data age statistics. Yields an {@link AgeStatistics} object for each
   * source.
   * @param {Object} [options]
   * @param {boolean} [options.includeUnkown] Yield statistics for sources where
   *        the age is unknown.
   * @yields {Required<AgeStatistics>}
   * @returns {Iterable<Required<AgeStatistics>>}
   */
  *listStatistics({ includeUnknown = false } = {}) {
    this.finish();

    for (const data of this.#bySource.values()) {
      if (includeUnknown || data.samples.length > 0) {
        yield data;
      }
    }
  }

  /**
   * Print a summary of any sources with stale data. Will also send a warning
   * to any configured error tracking system, e.g. Sentry.
   */
  printSummary() {
    const formatMillis = (s) =>
      Duration.fromMillis(Math.ceil(s / 1000) * 1000)
        .rescale()
        .toHuman();

    for (const stats of this.listStatistics({ includeUnknown: true })) {
      if (stats.samples.length === 0) {
        logger.warn(`${stats.source} has no age information for locations.`);
      } else if (stats.max > this.threshold) {
        logger.warn(`${stats.source} has stale data!`, {
          min: formatMillis(stats.min),
          max: formatMillis(stats.max),
          average: formatMillis(stats.average),
          median: formatMillis(stats.median),
        });
      }
    }
  }

  /**
   * Send metrics to Datadog or whatever metrics system is configured.
   * @param {string} prefix Prefix the metric name with this. Metrics are:
   *        `<prefix>.age_seconds.<min|max|avg|median>`
   */
  sendMetrics(prefix) {
    for (const stats of this.listStatistics()) {
      const tags = [`source:${stats.source}`];
      const name = [prefix, "age_seconds"].join(".");
      metrics.gauge(`${name}.min`, stats.min / 1000, tags);
      metrics.gauge(`${name}.max`, stats.max / 1000, tags);
      metrics.gauge(`${name}.avg`, stats.average / 1000, tags);
      metrics.gauge(`${name}.median`, stats.median / 1000, tags);
    }
  }

  /**
   * Calculate summary statistics (average, median). Generally you shouldn't
   * call this directly; use `listStatistics()` instead.
   */
  finish() {
    if (this.#finished) return;

    for (const stats of this.#bySource.values()) {
      if (stats.samples.length !== 0) {
        const sorted = stats.samples.sort((a, b) => a - b);
        stats.average =
          sorted.reduce((sum, sample) => sum + sample, 0) / sorted.length;
        stats.median =
          sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[(sorted.length - 1) / 2];
      }
    }

    this.#finished = true;
  }

  /**
   * Calculate the age of a record in milliseconds.
   * @param {Date|DateTime|number} relativeTo Calculate age relative to this.
   *        Can be a JS Date, Luxon DateTime, or a number of milliseconds.
   * @param {any} record A location record output by any source.
   * @returns {number}
   */
  static calculateAge(relativeTo, record) {
    const relative = relativeTo.toMillis?.() ?? relativeTo;
    const data = record.availability;
    if (!data) return null;

    let validAge, slotsAge;
    if (data.valid_at) {
      validAge = relative - new Date(data.valid_at);
    }
    // In each of these, we bail out entirely if there is an empty
    // slots/capcity array. That indicates there ought to have been slot data
    // that might contradict the declared valid_at time, and valid_at can't be
    // trusted by itself.
    if (data.slots && data.slots) {
      if (data.slots.length === 0) {
        return null;
      } else {
        slotsAge = relative - new Date(data.slots.at(-1).start);
      }
    } else if (data.capacity && data.capacity) {
      if (data.capacity.length === 0) {
        return null;
      } else {
        slotsAge = relative - new Date(data.capacity.at(-1).date);
      }
    }

    if (!validAge && !slotsAge) return null;

    return Math.max(0, ...[validAge, slotsAge].filter(Boolean));
  }
}

module.exports = {
  DEFAULT_STALE_THRESHOLD,
  StaleChecker,
};
