import dbConnection from "./db-connection";
import { AvailabilityInput } from "./interfaces";

interface AvailabilityLog extends AvailabilityInput {
  changed_at: Date | string;
}

// Re-use the main DB connection for logs, but use a new constant, so this can
// change to point to a separate data warehouse if needed.
export const availabilityDb = dbConnection;

export async function write(
  locationId: string,
  data: AvailabilityLog
): Promise<void> {
  await availabilityDb("availability_log").insert({
    ...data,
    location_id: locationId,
  });
}
