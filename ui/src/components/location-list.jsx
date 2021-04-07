import LocationInfo from "./location-info";
import React from "react";
import "./location-list.css";

function groupByCounty(locations) {
  const byCounty = {};
  for (const location of locations) {
    const county = location.county || "";
    if (!byCounty[county]) byCounty[county] = [];

    byCounty[county].push(location);
  }

  const counties = Object.keys(byCounty).sort();
  if (counties[0] === "") {
    counties.splice(0, 1);
    counties.push("");
  }

  return counties.map((name) => ({ name, locations: byCounty[name] }));
}

export default function LocationList({ locations, group = false }) {
  let items;
  if (group) {
    items = groupByCounty(locations).map(({ name, locations }) => (
      <LocationListGroup key={name} name={name || "Unknown County"}>
        {locations.map((location) => (
          <LocationInfo key={location.id} location={location} />
        ))}
      </LocationListGroup>
    ));
  } else {
    items = locations.map((location) => (
      <LocationInfo key={location.id} location={location} />
    ));
  }

  return <div className="location-list">{items}</div>;
}

function LocationListGroup({ name, children }) {
  return (
    <section className="location-list-group">
      <h2 className="location-list-group--header">{name}</h2>
      {children}
    </section>
  );
}
