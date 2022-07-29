import { createDbClient } from "./db-client";
import { AvailabilityInput } from "./interfaces";

interface AvailabilityLog extends AvailabilityInput {
  changed_at: Date | string;
}

// For now, we store these logs alongside with the rest of our data.
export const availabilityDb = createDbClient("Availability");

export async function write(
  locationId: string,
  data: AvailabilityLog
): Promise<void> {
  await availabilityDb("availability_log").insert({
    ...data,
    location_id: locationId,
  });
}
