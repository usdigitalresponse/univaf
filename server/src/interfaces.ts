export enum Availability {
  YES = "YES",
  NO = "NO",
  UNKNOWN = "UNKNOWN",
}

export enum LocationType {
  PHARMACY = "PHARMACY",
  MASS_VAX = "MASS_VAX",
  CLINIC = "CLINIC",
}

export interface Position {
  longitude: number;
  latitude: number;
}

export interface CapacityRecord {
  date: Date | string;
  available: Availability;
  available_count?: number;
  unavailable_count?: number;
  products?: Array<string>;
  dose?: string;
}

export interface SlotRecord {
  start: Date | string;
  end?: Date | string;
  available: Availability;
  available_count?: number;
  unavailable_count?: number;
  products?: Array<string>;
  dose?: string;
}

/**
 * Provider interface corresponds to a single provider
 *
 * TODO: replace this with the full definition
 */

export interface ProviderLocation {
  id: string;
  external_ids: ExternalIdList;
  provider: string;
  location_type: LocationType;
  name: string;
  address_lines: Array<string>;
  city: string;
  state: string;
  postal_code: string;
  county: string;
  position?: Position;
  info_phone: string;
  info_url: string;
  booking_phone: string;
  booking_url: string;
  eligibility: string;
  description: string;
  requires_waitlist: boolean;
  meta: object;
  is_public: boolean;
  internal_notes: string;
  created_at: Date;
  updated_at: Date;
  availability?: any;
}

export interface LocationAvailability {
  id: number;
  location_id: string;
  source: string;
  valid_at: Date;
  checked_at: Date;
  available: Availability;
  available_count?: number;
  products?: Array<string>;
  doses?: Array<string>;
  capacity?: Array<CapacityRecord>;
  slots?: Array<SlotRecord>;
  meta: object;
  is_public: boolean;
}

export interface AvailabilityInput {
  source: string;
  checked_at: Date | string;
  valid_at?: Date | string;
  available?: Availability;
  available_count?: number;
  products?: Array<string>;
  doses?: Array<string>;
  capacity?: Array<CapacityRecord>;
  slots?: Array<SlotRecord>;
  meta?: any;
  is_public?: boolean;
}

export type ExternalIdList = Array<[string, string]>;
