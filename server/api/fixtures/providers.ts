import { Provider, Availability } from "../src/interfaces";

const providers: Provider[] = [
  {
    id: "st-johns",
    name: "St. John's",
    latitude: 30.0,
    longitude: -30.0,
    street1: "1 Jamestown Pl",
    street2: "",
    city: "San Francisco",
    county: "San Francisco",
    zip: "94114",
    state: "CA",
    availability: Availability.NO,
    lastChecked: new Date(),
  },
];

export default providers;
