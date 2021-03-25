enum Availability {
  YES = "YES",
  NO = "NO",
  UNKNOWN = "UNKNOWN",
}

/**
 * Provider interface corresponds to a single provider
 *
 * TODO: replace this with the full definition
 */

interface Provider {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  street1: string;
  street2: string;
  city: string;
  county: string;
  zip: string;
  state: string;
  availability: Availability;
  lastChecked: Date;
}

export { Provider, Availability };
