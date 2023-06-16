# Data Schemas

UNIVAF data is organized into three tables: provider_locations (physical locations where vaccines are administered), external_ids (identifiers used for provider_locations in various external systems), and availability (characteristics of available appointments for provider_locations).

Wherever timestamps are used, they are represented as W3C-style ISO 8601 datetimes with time zones, e.g. `"2021-11-01T10:15:23Z"`. Datestamps are just the first 10 characters of a timestamp, e.g. `"2021-11-01"`.


## provider_locations

The provider_locations table lists physical locations where vaccines are or were administered, such as pharmacies, clinics, or mass vaccination sites. It contains information like name, address, phone number, etc.


### Fields

- **`id`** (string) A unique UUID representing the location.
- **`provider`** (string) Name of the entity that operates the location, if applicable. These were originally intended to be carefully modeled and maintained, but in practical use they are fairly freeform except when referring to retail pharmacies, e.g. “walgreens”.
- **`location_type`** (string) One of `“PHARMACY”`, `“MASS_VAX”`, `“CLINIC”`, or `“MOBILE_CLINIC”`
- **`name`** (string) Name of the location.
- **`address_lines`** (array of strings) Lines of the location’s street address.
- **`city`** (string) Name of the city the location is in.
- **`state`** (string) Two-letter postal abbreviation of the state.
- **`postal_code`** (string) ZIP code of the location. The format maybe be a standard US ZIP code or ZIP+4 code. In some early cases, leading zeroes may be missing (e.g. a value may be “4240” instead of “04240”). This is not the case in later records.
- **`county`** (string) The county the location is in, if known. _Warning: this field is not always accurate; if you need the location’s county, you may want to determine it based on zip code._
- **`position`** (object) The geographic coordinates of the location, if known. This is an object with `latitude` and `longitude` properties that are each floats.
- **`info_phone`** (string) A phone number where someone can get information about the location (not necessarily to book an appointment). This is a freeform string; its format varies widely.
- **`info_url`** (string) A URL for a webpage where someone can get information about the location (not necessarily to book an appointment).
- **`booking_phone`** (string) A phone number someone can call to book an appointment for vaccinations at this location. This is a freeform string; its format varies widely.
- **`booking_url`** (string) A URL for a webpage where someone can book an appointment for vaccinations at this location.
- **`description`** (string) Human-readable description of the location.
- **`requires_waitlist`** (boolean) Whether the location requires you to join a waitlist rather than book an appointment directly. This was relevant in 2021, but ceased to be a general practice later.
- **`minimum_age_months`** (integer) The minimum patient age in months at this location. May be null if a minimum age is not known. (For example, this will be 6 for a minimum age of 6 months, and 144 for a minimum age of 12 years.)  
  Pharmacists and doctors are authorized to administer vaccines to patients of various age ranges. This is different from the minimum age of a given vaccine. For example, a vaccine might be authorized for patients as young as 6 months, but the location administering it may only be authorized for patients as young as 36 months.
- **`meta`** (object) This is a freeform object with additional data about the location. It frequently contains things like timezone and operating hours, but there is a wide variety of data you can find here.
- **`is_public`** (boolean) Whether this location should be shown. This is most often used to indicate a location has been shut down or is no longer offering vaccinations and so shouldn’t be listed in appointment finder tools.
- **`internal_notes`** (string) Any operational notes about a given location.
- **`created_at`** (timestamp) Time the location record was created.
- **`updated_at`** (timestamp) Time the location record was last updated.


### Example Record

```js
{
  "id": "f33ac97d-6ab0-4219-8baa-b56337ed4dd4",
  "provider": "safeway",
  "location_type": "PHARMACY",
  "name": "Safeway Pharmacy #1647",
  "address_lines": [
    "5021 LAGUNA BLVD"
  ],
  "city": "Elk Grove",
  "state": "CA",
  "postal_code": "95758",
  "county": null,
  "position": {
    "longitude": -121.4466,
    "latitude": 38.424246
  },
  "info_phone": "916-691-3777",
  "info_url": "https://www.safeway.com/vaccinations/home",
  "booking_phone": null,
  "booking_url": "https://kordinator.mhealthcoach.net/vcl/1600111482909",
  "description": "Looking for a pharmacy near you in Elk Grove, CA? Our on-site pharmacy can administer Covid vaccinations, Pfizer, Moderna, and J&J Covid second booster shot and flu shots at no additional cost. Fill, refill or transfer prescriptions with us. We welcome scheduled or walk-in immunizations. Back to school vaccine immunizations and covid-19 PCR NAAT walk in test now available. We are located at 5021 Laguna Blvd.",
  "requires_waitlist": false,
  "meta": {
    "timezone": "America/Los_Angeles",
    "time_zone": "America/Los_Angeles",
    "friday_hours": "09:00AM - 08:00PM",
    "monday_hours": "09:00AM - 08:00PM",
    "sunday_hours": "10:00AM - 05:00PM",
    "tuesday_hours": "09:00AM - 08:00PM",
    "saturday_hours": "09:00AM - 05:00PM",
    "thursday_hours": "09:00AM - 08:00PM",
    "vaccinespotter": {
      "brand": "safeway",
      "brand_id": 5,
      "provider": "albertsons"
    },
    "cdc_minimum_age": {
      "years": "3",
      "months": "0"
    },
    "mhealth_address": "Safeway 1647 - 5021 Laguna Blvd., Elk Grove, CA, 95758",
    "wednesday_hours": "09:00AM - 08:00PM",
    "walkins_accepted": true,
    "albertsons_region": "NorCal_-_12_OPTIONAL",
    "insurance_accepted": true
  },
  "is_public": true,
  "internal_notes": null,
  "created_at": "2021-05-21T21:42:37.764Z",
  "updated_at": "2023-05-15T12:03:29.822Z",
  "minimum_age_months": 36
}
```


## external_ids

Every system typically has its own way (or a variety of ways) to refer to locations. In order to effectively cross-reference and de-duplicate locations, every provider_location record has multiple entries in the external_id table that represent a way of identifying the location in a given external system.

For example, the `"walgreens"` system is used for Walgreens store numbers, so Walgreens #11897 in Cherry Hill, NJ will have the external ID `{system: "walgreens", value: "11897"}`. Vaccines.gov uses UUIDs to refer to locations, so it also has the external ID `{system: "vaccines_gov", "f9bc5193-18e2-4fce-a199-8333efdb287f"}`.

In this table, every combination of `provider_location_id`, `system`, and `value` is unique. In _most_ systems, a given `(system, value)` combination is unique to a single location, but that isn’t always true. Specifically, values for the `"vtrcks"` and `"npi_usa"` systems can be used on multiple locations.


### Fields

- **`id`** (integer) A unique identifier for the record.
- **`provider_location_id`** (string) The ID of the record in provider_locations that this external ID belongs to.
- **`system`** (string) The external system this identifier belongs to.
- **`value`** (string) The actual identifier in that system.
- **`created_at`** (timestamp) Time this record was created.
- **`updated_at`** (timestamp) Redundant (records are never updated).


### Example Record

```js
{
  "id": "38514",
  "provider_location_id": "f33ac97d-6ab0-4219-8baa-b56337ed4dd4",
  "system": "safeway",
  "value": "1647",
  "created_at": "2021-05-24T22:20:28.290Z",
  "updated_at": "2021-05-24T22:20:28.290Z"
}
```


## availability

Availability records represent whether appointments were available at a given location, and, if known, how many appointments, at what times, for what vaccines, etc.

Records are unique by `(location_id, source)`. For many locations, we load data from multiple sources, so each source’s view of a location’s availability is stored separately. When the API serves up this data, it typically [merges each of the records for a given location](https://github.com/usdigitalresponse/univaf/blob/15a78d28609c19e787d99a7e93b456c778af48b5/server/src/db.ts#L482-L535) to create an overall picture (often different sources will have different information or levels of granularity).

Only `id`, `location_id`, `source`, the timestamps, and `available` are guaranteed to be present. Different sources provide widely differing levels of detail, and in many cases most of the information here is not available.


### Fields

- **`id`** (integer) A unique identifier for the record.

- **`location_id`** (string) The ID of the record in provider_locations that this availability belongs to.

- **`source`** (string) The name of the source from which this data was loaded.

- **`checked_at`** (timestamp) The time that availability was last checked by this source for this location.

- **`valid_at`** (timestamp) The most recent time at which the data in this record was known to be valid. Some sources include validity or freshness information, but for others this is the same as `checked_at`.

- **`changed_at`** (timestamp) The most recent time at which the material data in this record (i.e. all the non-timestamp fields) was actually changed.

- **`available`** (string) Whether appointments are known to be available. One of `"YES"`, `"NO"`, or `"UNKNOWN"`

- **`available_count`** (integer) How many appointments are available.

- **`products`** (array of strings) What types of vaccines are available. Possible values:

    - `"astra_zeneca"`
    - `"jj"`
    - `"moderna"`
    - `"moderna_ba4_ba5"`
    - `"moderna_age_6_11"`
    - `"moderna_ba4_ba5_age_6_11"`
    - `"moderna_age_0_5"`
    - `"moderna_ba4_ba5_age_0_5"`
    - `"novavax"`
    - `"pfizer"`
    - `"pfizer_ba4_ba5"`
    - `"pfizer_age_5_11"`
    - `"pfizer_ba4_ba5_age_5_11"`
    - `"pfizer_age_0_4"`
    - `"pfizer_ba4_ba5_age_0_4"`
    - `"sanofi"`

- **`doses`** (array of strings) Which vaccine doses are available. Rarely supported. Possible values:

    - `"all_doses"`
    - `"first_dose_only"`
    - `"second_dose_only"`

- **`capacity`** (array of objects) A day-by-day breakdown of appointment availability, products and doses. If `slots` is set, this will also be set. Each object may have the following properties:

    - **`date`** (datestamp) The date this capacity record represents.
    - **`available`** (string) Whether appointments are available on this date. One of `"YES"` or `"NO"`.
    - **`available_count`** (integer, optional) How many appointments are available.
    - **`unavailable_count`** (integer, optional) How many appointments are already booked.
    - **`products`** (array of strings, optional) What types of vaccines are available. Same possible values as the top-level products field.
    - **`dose`** (string, optional) Which dose this record is for. Same possible values as the top level doses field.

- **`slots`** (array of objects) A complete list of each available appointment slot. Each object may have the following properties:

    - **`start`** (timestamp) The time this appointment slot starts.
    - **`end`** (timestamp, optional) The time this appointment slot ends.
    - **`available`** (string) Whether appointments are available on this date. One of `"YES"` or `"NO"`.
    - **`available_count`** (integer, optional) How many appointments are available in this time slot.
    - **`unavailable_count`** (integer, optional) How many appointments in this time slot are already booked.
    - **`products`** (array of strings, optional) What types of vaccines are available. Same possible values as the top-level products field.
    - **`dose`** (string, optional) Which dose this record is for. Same possible values as the top level doses field.

- **`meta`** (object) A freeform object with extra data about the availability.

- **`is_public`** (boolean) Whether this record should be included in normal requests. Similar to the matching field on provider_locations, this is mostly used to indicate that a location or source has stopped operating.


### Example Record

```js
{
  "id": 105578,
  "source": "univaf-rite-aid-scraper",
  "location_id": "e7cdf651-8910-4c36-b68a-84fa134dc000",
  "valid_at": "2023-06-02T00:37:29.680Z",
  "checked_at": "2023-06-02T00:37:29.680Z",
  "changed_at": "2023-06-02T00:37:29.680Z",
  "available": "YES",
  "meta": null,
  "is_public": true,
  "available_count": 188,
  "products": [
    "pfizer_age_5_11",
    "moderna_ba4_ba5",
    "pfizer_ba4_ba5"
  ],
  "doses": null,
  "capacity": [
    {
      "date": "2023-06-02",
      "products": [
        "pfizer_age_5_11",
        "moderna_ba4_ba5",
        "pfizer_ba4_ba5"
      ],
      "available": "YES",
      "available_count": 23,
      "unavailable_count": 0
    },
    {
      "date": "2023-06-03",
      "products": [
        "pfizer_age_5_11",
        "moderna_ba4_ba5",
        "pfizer_ba4_ba5"
      ],
      "available": "YES",
      "available_count": 15,
      "unavailable_count": 0
    },
    // Trimmed for brevity...
  ],
  "slots": [
    {
      "start": "2023-06-02T09:00:00-08:00",
      "products": [
        "pfizer_age_5_11",
        "moderna_ba4_ba5",
        "pfizer_ba4_ba5"
      ],
      "available": "YES"
    },
    {
      "start": "2023-06-02T09:20:00-08:00",
      "products": [
        "pfizer_age_5_11",
        "moderna_ba4_ba5",
        "pfizer_ba4_ba5"
      ],
      "available": "YES"
    },
    {
      "start": "2023-06-02T09:40:00-08:00",
      "products": [
        "pfizer_age_5_11",
        "moderna_ba4_ba5",
        "pfizer_ba4_ba5"
      ],
      "available": "YES"
    },
    {
      "start": "2023-06-02T10:00:00-08:00",
      "products": [
        "pfizer_age_5_11",
        "moderna_ba4_ba5",
        "pfizer_ba4_ba5"
      ],
      "available": "YES"
    },
    // Trimmed for brevity...
  ]
}
```


## availability_log

These records represent every change to the [`availability` table](https://docs.google.com/document/d/1l0Q6VErhyKz5BL9BLvKTwP37WKZhce4Eloyy5oePiOE/edit#heading=h.6g9z7fdbqmlv). The schema is the same as that table, but there is no `id` field.

Additionally, updates that didn’t materially change the data only include changes to the relevant timestamps, and leave out most data fields (most updates don’t change anything, and this keeps files an order of magnitude smaller). That is:

- Updates where only `checked_at` changed only have values for `location_id`, `source`, and `checked_at`.
- Updates where only `checked_at` and `valid_at` changed only have values for `location_id`, `source`, `checked_at`, and `valid_at`.
- All other updates should include the new values for all fields.

For example, this is a condensed record with no changes:

```js
{
  "source": "univaf-cvs-smart",
  "location_id": "ed039161-ad1a-4c30-93fc-ee3151827e0f",
  "checked_at": "2023-05-20T00:04:08.230Z"
}
```

And later in the same log file, a complete record when changes were recorded:

```js
{
  "source": "univaf-cvs-smart",
  "location_id": "ed039161-ad1a-4c30-93fc-ee3151827e0f",
  "valid_at": "2023-05-20T00:15:44.374Z",
  "checked_at": "2023-05-20T00:19:09.498Z",
  "changed_at": "2023-05-20T00:15:44.374Z",
  "available": "YES",
  "is_public": true,
  "capacity": [
    {
      "date": "2023-05-19",
      "available": "YES"
    },
    {
      "date": "2023-05-20",
      "available": "YES"
    },
    {
      "date": "2023-05-21",
      "available": "YES"
    },
    {
      "date": "2023-05-22",
      "available": "YES"
    },
    {
      "date": "2023-05-23",
      "available": "YES"
    },
    {
      "date": "2023-05-24",
      "available": "YES"
    }
  ]
}
```
