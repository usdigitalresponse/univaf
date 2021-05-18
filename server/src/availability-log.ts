import Knex from "knex";
import { loadDbConfig } from "./config";
import { AvailabilityInput } from "./interfaces";

export const availabilityDb = Knex(loadDbConfig()); // for now, store with the rest of our data

export async function write(locationId: string, data: AvailabilityInput) {
  await availabilityDb("availability_log").insert({
    ...data,
    location_id: locationId,
  });
}
