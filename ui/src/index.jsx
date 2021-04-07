import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import FilterBar from "./components/filter-bar";
import MainContent from "./components/main-content";

// Prefix for data in local/session storage
const STORAGE_PREFIX = "appointment-availability";

class AppointmentFinder extends React.Component {
  constructor(props) {
    super(props);
    this.state = { filters: {}, ...this.loadState() };
    this.state.filters.state ||= "NJ";
    this.didChangeFilters = this.didChangeFilters.bind(this);
  }

  didChangeFilters(filters) {
    this.setState({ filters }, () => {
      this.saveState();
    });
  }

  render() {
    return (
      <>
        <FilterBar
          filter={this.state.filters}
          onChange={this.didChangeFilters}
        />
        <MainContent filters={this.state.filters} />
      </>
    );
  }

  saveState() {
    if (window.sessionStorage) {
      try {
        sessionStorage.setItem(
          `${STORAGE_PREFIX}:filters`,
          JSON.stringify(this.state.filters)
        );
      } catch (error) {}
    }
  }

  loadState() {
    if (window.sessionStorage) {
      try {
        const rawData = sessionStorage.getItem(`${STORAGE_PREFIX}:filters`);
        return { filters: JSON.parse(rawData) || {} };
      } catch (error) {}
    }

    return null;
  }
}

ReactDOM.render(
  <AppointmentFinder />,
  document.getElementById("appointment-finder-root")
);
