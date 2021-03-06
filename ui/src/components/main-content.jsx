import React from "react";
// import "./main-content.css";
import LocationList from "./location-list";

// URL for UNIVAF API
const DATA_URL = process.env.DATA_URL || "http://localhost:3000";
// Maximum age at which to consider availability data accurate
const MAX_AVAILABILITY_AGE = 4 * 60 * 60 * 1000;
// Characters to ignore in search queries
const PUNCTUATION_PATTERN = /[.\-–—!@#$%^&*()\[\]'"“”‘’{}\\/;:<>,]/g;

export default class MainContent extends React.Component {
  constructor(props) {
    if (!props.filters?.state) {
      throw new Error("You must set a state filter for MainContent");
    }

    super(props);
    this.state = {
      // Filled in if data could not be loaded.
      error: null,
      // Indicates that there is not any data ready to display.
      ready: false,
      // Indicates that new data is being loaded.
      loading: false,
      // Provider locations in the current state.
      locations: [],
    };
  }

  componentDidMount() {
    this.fetchData();
    this.updateInterval = setInterval(() => this.fetchData(), 60 * 1000);
  }

  componentWillUnmount() {
    clearInterval(this.updateInterval);
  }

  componentDidUpdate(oldProps) {
    if (this.props.filters.state !== oldProps.filters.state) {
      // This new state should technically be in getDerivedStateFromProps(),
      // but ¯\_(ツ)_/¯
      this.setState({ ready: false, locations: [] });
      this.fetchData();
    }
  }

  render() {
    let content;
    if (this.state.error) {
      content = <p className="error-main">Error: {this.state.error.message}</p>;
    } else if (!this.state.ready) {
      content = <p className="loading-main">Loading…</p>;
    } else {
      const locations = this.filteredLocations();
      if (locations.length) {
        content = (
          <LocationList
            locations={locations}
            group={this.props.filters.groupByCounty}
          />
        );
      } else {
        content = <p className="notice-main">No matching locations.</p>;
      }
    }

    return content;
  }

  filteredLocations() {
    const filters = this.props.filters;
    const searchQuery = (filters.search || "")
      .toLowerCase()
      .replace(PUNCTUATION_PATTERN, " ");

    return this.state.locations.filter((location) => {
      if (filters.state && location.state !== filters.state) return false;
      if (filters.show) {
        const available =
          location?.availability?.available?.toLowerCase() || "unknown";
        if (available === "no") return false;
        if (filters.show === "available" && available !== "yes") return false;
      }
      if (searchQuery && !location.searchValue.includes(searchQuery)) {
        return false;
      }

      return true;
    });
  }

  getApiKey() {
    let params = new URLSearchParams(document.location.search.substring(1));
    return params.get("api_key");
  }

  async fetchData() {
    try {
      this.setState({ loading: true });
      let headers = {};
      let includePrivate = false;
      let apiKey = this.getApiKey();

      // If we're passed an API key, try and include the private locations
      if (apiKey) {
        headers = { "x-api-key": apiKey };
        includePrivate = true;
      }

      // TODO: wrap most of this (and the data cleaning) into an API client.
      const response = await fetch(
        `${DATA_URL}/locations?state=${this.props.filters.state}&include_private=${includePrivate}`,
        {
          headers: headers,
        }
      );
      let data = await response.json();
      if (data.error) {
        if (apiKey && response.status === 403) {
          throw new Error("Invalid API key");
        }
        throw new Error(data.error);
      }
      data = this.cleanData(data);

      const sortValues = {
        yes: 0,
        unknown: 1,
        no: 2,
      };
      data.sort(
        (a, b) =>
          sortValues[a.availability?.available ?? "unknown"] -
          sortValues[b.availability?.available ?? "unknown"]
      );

      this.setState({ locations: data, loading: false, ready: true });
    } catch (error) {
      console.error("Error fetching data:", error);
      this.setState({ error });
    }
  }

  cleanData(data) {
    const now = new Date();
    data.forEach((record) => {
      let text = [
        record.name,
        record.address_lines.join(" "),
        record.city,
        record.postal_code,
        record.county,
        record.provider,
        record.description,
      ]
        .filter((chunk) => !!chunk)
        .join(" ")
        .toLowerCase()
        .replace(PUNCTUATION_PATTERN, " ");
      record.searchValue = text;

      if (record.availability) {
        // TODO: this fix should happen in the API server.
        record.availability.available =
          record.availability.available.toLowerCase();

        record.availability.checked_at = new Date(
          record.availability.checked_at
        );
        record.availability.valid_at = new Date(record.availability.valid_at);

        // If a record is too old, consider it unknown.
        if (
          record.availability.available !== "unknown" &&
          now - record.availability.valid_at > MAX_AVAILABILITY_AGE
        ) {
          record.availability.available = "unknown";
        }
      }
    });
    return data;
  }
}
