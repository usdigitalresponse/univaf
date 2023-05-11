const { Duration } = require("luxon");

/**
 * @typedef {Object} AgeStatistics
 * @property {string} source
 * @property {number[]} samples
 * @property {number} min
 * @property {number} max
 * @property {number} [average]
 * @property {number} [median]
 */

const DEFAULT_STALE_THRESHOLD = 24 * 60 * 60 * 1000;

class StaleChecker {
  /** @type {Map<string, AgeStatistics>} */
  bySource = new Map();
  #finished = false;

  constructor({
    relativeTime = new Date(),
    threshold = DEFAULT_STALE_THRESHOLD,
  } = {}) {
    this.relativeTime = relativeTime;
    this.threshold = threshold;
  }

  getDataForSource(source) {
    if (!this.bySource.has(source)) {
      this.bySource.set(source, {
        source,
        min: Infinity,
        max: -Infinity,
        samples: [],
      });
    }
    return this.bySource.get(source);
  }

  checkRecord(record) {
    if (!record.availability) return null;

    const stats = this.getDataForSource(record.availability.source);
    const age = StaleChecker.calculateDataAge(this.relativeTime, record);
    if (age == null) return null;

    this.#finished = false;
    stats.samples.push(age);
    if (stats.min > age) stats.min = age;
    if (stats.max < age) stats.max = age;

    return age;
  }

  filterRecord(record) {
    const age = this.checkRecord(record);
    return age > this.threshold ? null : record;
  }

  /**
   * @yields {Required<AgeStatistics>}
   * @returns {Iterable<Required<AgeStatistics>>}
   */
  *listStatistics() {
    this.finish();

    for (const data of this.bySource.values()) {
      if (data.samples.length > 0) {
        yield data;
      }
    }
  }

  printSummary() {
    this.finish();

    const formatMillis = (s) =>
      Duration.fromMillis(Math.ceil(s / 1000) * 1000)
        .rescale()
        .toHuman();

    for (const stats of this.bySource.values()) {
      if (stats.samples.length === 0) {
        console.error(`No age information for locations in ${stats.source}.`);
      } else if (stats.max > this.threshold) {
        console.error(`${stats.source} has stale data!`);
        console.error(`  Minimum age: ${formatMillis(stats.min)}`);
        console.error(`  Maximum age: ${formatMillis(stats.max)}`);
        console.error(`  Average age: ${formatMillis(stats.average)}`);
        console.error(`  Median age:  ${formatMillis(stats.median)}`);
      }
    }
  }

  finish() {
    if (this.#finished) return;

    for (const stats of this.bySource.values()) {
      if (stats.samples.length !== 0) {
        const sorted = stats.samples.sort();
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

  static calculateDataAge(relativeTime, record) {
    const data = record.availability;
    if (!data) return null;

    let validAge, slotsAge;
    if (data.valid_at) {
      validAge = relativeTime - new Date(data.valid_at);
    }
    // In each of these, we bail out entirely if there is an empty
    // slots/capcity array. That indicates there ought to have been slot data
    // that might contradict the declared valid_at time, and valid_at can't be
    // trusted by itself.
    if (data.slots && data.slots) {
      if (data.slots.length === 0) {
        return null;
      } else {
        slotsAge = relativeTime - new Date(data.slots.at(-1).start);
      }
    } else if (data.capacity && data.capacity) {
      if (data.capacity.length === 0) {
        return null;
      } else {
        slotsAge = relativeTime - new Date(data.capacity.at(-1).date);
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
