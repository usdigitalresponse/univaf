import Knex from "knex";
import { loadDbConfig } from "./config";
import { AvailabilityInput, LocationAvailability } from "./interfaces";

interface AvailabilityLog extends AvailabilityInput {
  changed_at: Date;
}

export const availabilityDb = Knex(loadDbConfig()); // for now, store with the rest of our data

export async function write(locationId: string, data: AvailabilityLog) {
  await availabilityDb("availability_log").insert({
    ...data,
    location_id: locationId,
  });
}
