# Tips and Notes

## ID Changes and Location Merges

Early in UNIVAF’s development, a different format was used for location IDs. When the IDs were changed, all locations were given an external ID where the `system="univaf_v0"` and the value is the original ID.

In some cases, provider location records have been deleted because they were merged with another record (some external systems contained duplicates, and in some cases different external systems reference the same location by a different identifier, all of which we later corrected). In these cases, a location will have multiple entries in the `external_ids` table with `system="univaf_v1"`, where each value references the ID of a location that was merged into that record and deleted.


## Appointments vs. Stock

UNIVAF does its best to provide reliable information about vaccine *appointment* availability. That’s different from many official sources (such as the CDC), which mainly provide information about what vaccines are *in stock* at a given location. One reason we built UNIVAF is that stock turns out not to relate to whether *appointments* are bookable at all.

For example, we’ve seen all of the following approaches at various clinics:

- A location may be out of stock, but still be booking future appointments under the assumption that vaccine shipments will arrive on time.
- Alternatively, a location may stop booking appointments as soon as they run out of stock because they are not confident about future shipments.
- A location may have stock, but all of it is spoken for in appointments that have already been booked, so they are not accepting new apointments.

As of late summer 2021, demand is lower than supply at *most* locations, so having vaccines in stock more often indicates appointments are available. This is still not *always* true, though.


## Examples

In 2021, USDR used this data to look into overall appointment availability and equity in different areas. This is an example report for the state of New Jersey: <https://raw.githack.com/usdigitalresponse/appointment-data-insights/main/reports/state_NJ.html>

And the source code is available here: <https://github.com/usdigitalresponse/appointment-data-insights>
