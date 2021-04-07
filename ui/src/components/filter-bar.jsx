import React from "react";
import "./filter-bar.css";
import states from "../states";

const uspsStates = states.filter((state) => state.usps);

export default function FilterBar({ filter, onChange }) {
  filter = {
    state: "",
    search: "",
    show: "",
    groupByCounty: false,
    ...filter,
  };

  const onChangeState = (event) => {
    filter.state = event.target.value;
    if (onChange) onChange(filter);
  };

  const onChangeSearch = (event) => {
    filter.search = event.target.value;
    if (onChange) onChange(filter);
  };

  const onChangeShow = (event) => {
    filter.show = event.target.value;
    if (onChange) onChange(filter);
  };

  const onChangeGroup = (event) => {
    filter.groupByCounty = event.target.checked;
    if (onChange) onChange(filter);
  };

  return (
    <div className="filter-bar">
      <form>
        <label className="filter--state">
          <span className="label-text">State:</span>{" "}
          <select value={filter.state} onChange={onChangeState}>
            {uspsStates.map((state) => (
              <option key={state.usps} value={state.usps}>
                {state.name}
              </option>
            ))}
          </select>
        </label>

        <label className="filter--show">
          <span className="label-text">Show:</span>{" "}
          <select value={filter.show} onChange={onChangeShow}>
            <option value="">All</option>
            <option value="available">Available Only</option>
            <option value="available_unknown">Available and Possible</option>
          </select>
        </label>

        <label className="filter--search">
          <span className="label-text">Search:</span>{" "}
          <input type="text" value={filter.search} onChange={onChangeSearch} />
        </label>

        <label className="filter--group-county">
          <input
            type="checkbox"
            checked={filter.groupByCounty}
            onChange={onChangeGroup}
          />{" "}
          <span className="label-text">Group by County</span>
        </label>
      </form>
    </div>
  );
}
