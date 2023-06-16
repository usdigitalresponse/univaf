# Sources and IDs

## Sources

UNIVAF availability records are organized by source, indicating where the data comes from (some locations have multiple records, one for each source that includes them). The available sources are:

- `cdc`: Data from the CDC’s open data portal.

- `univaf-albertsons`: Data about Albertsons-owned stores (e.g. Albertsons, Lucky, Safeway, etc.) from [MHealth Coach](https://mhealthcoach.com/), the system Albertsons used for booking COVID vaccines in 2021 and 2022.

- `univaf-albertsons-scraper`: Data about Albertsons-owned stores scraped from Albertsons's own appointment booking system. Only used for COVID in 2023 and later.

- `univaf-cvs-api`: Data about CVS pharmacies loaded from CVS's private API. Used primarily in 2021 before CVS shipped their public, standards-based API (see `univaf-cvs-smart` below).

- `univaf-cvs-smart`: Data about CVS pharmacies loaded from CVS's public SMART Scheduling Links API.

- `univaf-heb`: Data scraped from H-E-B’s booking website.

- `univaf-hyvee`: Data scraped from Hy-Vee’s booking website.

- `univaf-kroger-smart`: Data about Kroger and Kroger-owned stores loaded from Kroger’s public SMART Scheduling Links API.

- `univaf-njvss`: Data about a variety of locations in New Jersey (including state-sponsored mass vaccination centers) from the official state booking system.

- `univaf-prepmod`: Data loaded from various instances of Prepmod, a vaccine booking system primarily used by public health departments. This mainly covers mobile and public health clinics in Alaska and Washington state.

- `univaf-rite-aid-api`: Data about Rite Aid pharamacies loaded from Rite Aid's private API.

- `univaf-rite-aid-scraper`: Data scraped from Rite Aid's booking website. Records are loaded less frequently than other Rite Aid sources, but tend to have more detail.

- `univaf-rite-aid-smart`: Data about Rite Aid pharamacies loaded from Rite Aid's public SMART Scheduling Links API.

- `univaf-vaccinespotter`: Data about all sorts of locations from [Vaccine Spotter](https://vaccinespotter.org/).

- `univaf-wa-doh`: Data loaded from the Washington State Department of Health’s COVID vaccine location system, which is similar to UNIVAF. It only provides information for locations in Washington state, *except* for Costco stores, where it covers the entire United States. UNIVAF primarily just loads Costco data from here.

- `univaf-walgreens-smart`: Data about Walgreens pharmacies loaded from Walgreens’s public SMART Scheduling Links API.

- `vaccinespotter`: Data from an earlier iteration of Vaccine Spotter.


### Albertsons (`univaf-albertsons`, `univaf-albertsons-scraper`)

[Albertsons](https://www.albertsonscompanies.com/) is the parent company for a number of major grocery store and pharmacy chains. Albertsons-related sources provide data for the following stores:

- ACME
- Albertsons/Albertsons Market
- Amigos
- Carrs
- Haggen
- Jewel-Osco
- Lucky
- Market Street
- Pak ’n Save
- Pavilions
- Randalls/Randalls Pharmacy
- Safeway
- Shaw’s
- Tom Thumb
- United Supermarkets
- Vons

In 2021 and 2022, Albertsons used a third-party booking system for COVID vaccinations called MHealth Coach that did not provide day-by-day counts of appointment availability or specific appointment slot times; only that slots are generally available and for what vaccine product. Data from this system is labeled with the `univaf-albertsons` source.

In 2023, Albertsons switched COVID vaccinations to their in-house booking system. Data from this system is labeled with the `univaf-albertsons-scraper` source.


### H-E-B (`univaf-heb`)

[H-E-B](https://www.heb.com) is a grocery and pharmacy chain in Texas. The `univaf-heb` source scrapes their booking website’s API for data about vaccine products and availability. It does not gather available appointment counts by day (`capacity`) or individual appointment slots (`slots`).


### HyVee (`univaf-hyvee`)

[HyVee](https://www.hy-vee.com/corporate) is a large employee-co-op grocery chain in the midwest. The `univaf-hyvee` source scrapes their booking website’s API for data about vaccine products and availability. It does not gather available appointment counts by day (`capacity`) or individual appointment slots (`slots`).


### PrepMod (`univaf-prepmod`)

PrepMod is a clinic management tool in use by many public health departments and built by [Maryland Partnership for Prevention](https://www.immunizemaryland.org). It is designed around one-off *events*, so there are some caveats with how we map clinic events to physical locations in this API. In particular:

- A location’s top-level `booking_url` property is generally the best link for somebody who wants to book a vaccination. It links to a search results page with criteria that match the location. However, there are some caveats here:
    - Most locations have multiple listings — most PrepMod “clincs” are single-day events, so a given location may have one listing for each day, or sometimes one for each day & vaccine type combination (it depends on how the public health department sets things up).
    - It may also list *other* locations that aren’t exact matches. PrepMod searches are based on the centroid of a zip code, and so may include additional similarly named clinics nearby. (This is most often a problem for mobile clinics, where multiple nearby locations share the same name, e.g. “Pop-up Clinic - Anchorage Health Department.”)
- A location’s `info_url` property links to a listing of all the clinics managed by a given PrepMod server, and may include *many* different locations.
- Each slot in an availability record's `slots` array has a relatively unique `booking_url` that lets you book that exact slot. However, the list of vaccines available may include more than are actually offered for that slot. PrepMod's API unfortunately doesn't provide fine-grained enough info to explain which vaccines are available for which slot.


### Centers for Disease Control (`cdc`, `univaf-cdc`)

**The Centers for Disease Control (CDC) publishes open data about vaccine stock, not appointments.** We include it because it provides valuable other details, like which vaccine products are available or what the operating hours are at a given location, that other sources do not. In general, you should only use it in combination with other sources. For more about this, see “appointments vs. stock” in the tips and notes section.

Stock information from the CDC is also extremely rough — many locations report this information by hand at the end of a day, or every few days, so it is not always completely up to date. The CDC also includes two separate indicators of vaccine stock that often conflict (whether vaccines are in stock, and roughly how long that stock is expected to last). We currently take an optimistic approach here, and report availability if either indicator shows some stock.


### CVS (`univaf-cvs-scraper`, `univaf-cvs-api`, `univaf-cvs-smart`)

[CVS](https://www.cvs.com) is a national retail pharmacy chain that performed a large number of COVID vaccinations. There are 3 sources that loaded data from CVS's booking systems:

- `univaf-cvs-scraper` was built before official agreements with CVS, but was never used in production. It scrapes CVS's booking website.
- `univaf-cvs-api` uses CVS's private API. You must have an API key to use it. It was used primarily in 2021 before CVS shipped their public, standards-based API (see `univaf-cvs-smart` below).
- `univaf-cvs-smart` loads data from CVS's standardized SMART Scheduling Links API, which is publicly available.


### Kroger

[Kroger](https://www.thekrogerco.com) is the parent company for a number of major grocery store and pharmacy chains. Kroger-related sources provide data for the following stores:

- Baker's Pharmacy
- Copps Pharmacy
- Dillons Pharmacy
- Food 4 Less
- Foods Co
- Fred Meyer
- Fry's
- Gerbes
- Harris Teeter
- JayC
- King Soopers
- Kroger
- Mariano's
- Metro Market
- Pay-less
- Pick 'n Save
- QFC Pharmacy
- Ralphs
- Smith's
- City Market Pharmacy
- The Little Clinic

Kroger provides day-by-day `capacity` data, but not `slots` level data. In mid-2022, they shut off their public API with no notice to partners, and neither UNIVAF nor vaccines.gov has appointment data after that date (there is *stock* data from the CDC for these stores, though).


### Rite Aid (`univaf-rite-aid-api`, `univaf-rite-aid-scraper`, `univaf-rite-aid-smart`)

[CVS](https://www.riteaid.com) is a national retail pharmacy chain that performed a large number of COVID vaccinations. Rite Aid also owns [Bartell Drugs](https://www.bartelldrugs.com) and some Rite Aid sources also provide information for those stores.

There are 3 sources that loaded data from Rite Aid's systems:

- `univaf-rite-aid-api` uses Rite Aid's private API and requires an API key. It was built in early 2021 before Rite Aid shipped their public, standards-based API (see `univaf-rite-aid-smart` below) and has been in use for all of UNIVAF's operational lifetime. It provides day-by-day counts (`capacity`), but not individual appointment times (`slots`).
- `univaf-rite-aid-scraper` was built to work around issues with Rite Aid's private API during a period of low reliability. It provides both day-by-day counts (`capacity`) and individual appointment times (`slots`).
- `univaf-rite-aid-smart` loads data from Rite Aid's standardized SMART Scheduling Links API, which is publicly available. It provides day-by-day counts (`capacity`), but not individual appointment times (`slots`). It also does not provide information about which vaccine types (`products`) are available.


### Walgreens (`univaf-walgreens-smart`)

[Walgreens](https://www.walgreens.com) is a national retail pharmacy chain that performed a large number of COVID vaccinations. It publishes data using the standardized SMART Scheduling Links API, and indicates whether appointments were available on a day-by-day basis (`capacity`) but not a count of appointments on those days. It does not provide individual appointment details (`slots`).


### Washington State Department of Health (`univaf-wa-doh`)

A public-private partnership with the Washington State Department of Health developed a similar system to UNIVAF that focuses on just Washington. UNIVAF sources only data about Costco stores from this system, which covered all Costco stores in the United States and its territories in 2021 and 2022 (other providers in this system are limited to Washington State — the broader Costco support was the result of an agreement between Costco, the state of Washington, the state of New Jersey, and USDR). In 2023, this source ceased publishing Costco data outside Washington state.


### NJVSS (`univaf-njvss`)

The [New Jersey Vaccine Scheduling System (NJVSS)](https://covidvaccine.nj.gov/) is the state of New Jersey's official booking system, and was used for mass vaccination centers, public health clinics, and an assortment other retail locations (it does not cover all vaccination locations in the state).


### Vaccine Spotter (`vaccinespotter`)

[Vaccine Spotter](https://shutdown.vaccinespotter.org/) was a community-based project to provide vaccine availability started in early 2021. It overlapped significantly with UNIVAF's scope, and the two projects worked together for while (UNIVAF focused on sources Vaccine Spotter didn’t have and vice versa).

Vaccine Spotter shut down in late 2021, at which time UNIVAF incorporated its data sources directly. They show up as some of the other `univaf-*` sources.


## External IDs

External IDs track the identifiers used for a given location in other external systems (e.g. Walgreens’s booking system or the CDC’s vaccine tracking system). These are stored in the `external_ids` table and represent a combination set of `(location_id, system, value)`, where `location_id` is the UNIVAF ID for the location, `system` identifies an external system, and `value` is the ID in that system.

The vast majority of locations UNIVAF tracks are retail pharmacies, so most external ID systems are store numbers (e.g. Safeway Pharmacy #1647 has an external ID record with `{system: "safeway", value: "1647"}`).

In most cases, a given location has only one value per system. However, sometimes a location may have multiple `(system, value)` pairs with the same system if the external system breaks the location down into separate sub-resources. For example, *Prepmod* tracks appointments by event, where there are multiple events at a given location. That means a single location may have multiple external IDs using the `prepmod-myhealth.alaska.gov-clinic` system. For example:

```js
{ system: "prepmod-myhealth.alaska.gov-location", value: "0c5e56b111c8601c18c97b965db9867f", location_id: "bc402be2-547d-4a4c-b3fb-2a14782c3ee2" }
{ system: "prepmod-myhealth.alaska.gov-clinic", value: "1954", location_id: "bc402be2-547d-4a4c-b3fb-2a14782c3ee2" }
{ system: "prepmod-myhealth.alaska.gov-clinic", value: "4423", location_id: "bc402be2-547d-4a4c-b3fb-2a14782c3ee2" }
```

In most cases, a given `(system, value)` pair uniquely identifies a location. However, some systems are not guaranteed to be unique, and are stored as external IDs for historical reasons (usually, we thought they were unique when we first added them). These systems are marked with **“Not Unique!”** below.

### Systems

- `acme`
- `albertsons`
- `albertsons_acme`
- `albertsons_albertsons`
- `albertsons_albertsons_corporate`
- `albertsons_albertsons_market`
- `albertsons_amigos`
- `albertsons_carrs`
- `albertsons_community_clinic`
- `albertsons_haggen`
- `albertsons_jewelosco`
- `albertsons_luckys`
- `albertsons_market`
- `albertsons_market_street`
- `albertsons_pak_n_save`
- `albertsons_pavilions`
- `albertsons_randalls`
- `albertsons_randalls_pharmacy`
- `albertsons_safeway`
- `albertsons_sav_on`
- `albertsons_shaws`
- `albertsons_star_market`
- `albertsons_store_number`
- `albertsons_tom_thumb`
- `albertsons_united`
- `albertsons_v2`
- `albertsons_vons`
- `alliancerx_walgreens_prime`
- `amigos`
- `appointment_plus`
- `ava_drug_powered_by_walgreens`
- `bartell`
- `baxter_drug_powered_by_walgreens`
- `broadwater_drugs_powered_by_walgreens`
- `carrs`
- `carthage_discount_drug_powered_by_walgreens`
- `centura_driveup_event`
- `cm_a_walgreens_pharmacy`
- `comassvax`
- `community_a_walgreens_pharmacy`
- `community_clinic`
- `costco`
- `cox_drug_a_walgreens_rx`
- `cvs`
- `denver_ball_arena`
- `dominguez_a_walgreens_rx`
- `ellisville_drug_powered_by_walgreens`
- `ferguson_drug_powered_by_walgreens`
- `forbes_pharmacy_powered_by_walgreens`
- `fresco_y_mas`
- `genoa_healthcare`
- `haggen`
- `hannaford`
- `harveys`
- `health_mart`
- `health_mart_health_mart`
- `health_mart_price_chopper`
- `heb`
- `hyvee`
- `hyvee_store`
- `jewelosco`
- `jim_myers_a_walgreens_pharmacy`
- `kens_discount_a_walgreens_rx`
- `kroger`
- `kroger_bakers`
- `kroger_citymarket`
- `kroger_copps`
- `kroger_covid`
- `kroger_dillons`
- `kroger_fred`
- `kroger_frys`
- `kroger_gerbes`
- `kroger_hart`
- `kroger_jayc`
- `kroger_kingsoopers`
- `kroger_marianos`
- `kroger_metro_market`
- `kroger_payless`
- `kroger_pick_n_save`
- `kroger_qfc`
- `kroger_ralphs`
- `kroger_smiths`
- `kroger_the_little_clinic`
- `kta_super_stores`
- `linn_drug_powered_by_walgreens`
- `luckys`
- `mansfield_drug_powered_by_walgreens`
- `market_street`
- `meijer`
- `murphy_drug_powered_by_walgreens`
- `njiis_covid`: Identfiers from the State of New Jersey’s Immunization Information System (IIS).
- `njvss_res_id`: Identifiers from the State of New Jersey’s vaccine appointment system (NJVSS).
- `npi_usa`: **Not Unique!** [National Provider Identifier](https://www.cms.gov/Regulations-and-Guidance/Administrative-Simplification/NationalProvIdentStand). These identifiers cover individual clinicians, such as the pharmacist(s) at a given Walgreens location. These may be shared across multiple locations if a clinician serves at multiple locations.
- `pak_n_save`
- `parkway_drugs_a_walgreens_rx`
- `pavilions`
- `pharmaca`
- `pioneer_a_walgreens_pharmacy`
- `prepmod-myhealth.alaska.gov-clinic`
- `prepmod-myhealth.alaska.gov-location`
- `prepmod-prepmod.doh.wa.gov-clinic`
- `prepmod-prepmod.doh.wa.gov-location`
- `price_chopper`
- `price_chopper_market_32`
- `price_chopper_market_bistro`
- `publix`
- `randalls`
- `randalls_pharmacy`
- `rite_aid`
- `safeway`
- `sams_club`
- `sams_club_sams_club`
- `sav_on`
- `seymour_pharmacy_powered_by_walgreens`
- `shaws`
- `shoprite`
- `southeastern_grocers_fresco_y_mas`
- `southeastern_grocers_harveys`
- `southeastern_grocers_winn_dixie`
- `star_market`
- `stop_and_shop`
- `strauser_drug_powered_by_walgreens`
- `thrifty_white`
- `tom_thumb`
- `united`
- `univaf_v0`: A location's ID in the original UNIVAF ID format. Early on, UNIVAF used a different ID format that turned out not to work well. Locations now have an `id` property that is a UUID, but if a location existed earlier with an old-style ID, that ID will be recorded as an external ID in the `univaf_v0` system.
- `univaf_v1`: If other location records were merged into this location, those locations’ `id` properties will be recorded as external IDs in the `univaf_v1` system.
- `vaccines_gov`: Identifiers from [Vaccines.gov](https://vaccines.gov/).
- `vaccinespotter`: [Vaccine Spotter](https://vaccinespotter.org/).
- `vons`: [Vons Pharmacy](https://www.vons.com/) store number.
- `vtrcks`: **Not Unique!** A [VTrckS](https://www.cdc.gov/vaccines/programs/vtrcks/index.html) PIN associated with this location. The CDC's VTrckS system is used for managing and tracking the distribution of vaccines and identifies locations where vaccines are *delivered to*, not necessarily where they are administered. For most retail pharmacies, those are the same thing. But for large hospital systems or public health clinics (and especially mobile clinics), several locations (UNIVAF locations are meant to be places vaccines are administered) may share a single VTrckS pin for the office where vaccines are stored before being carried to clinic sites.
- `wa_doh`: Identifiers from the Washington State Department of Health.
- `waldron_drug_powered_by_walgreens`
- `walgreens`
- `walgreens_duane_reade`
- `walgreens_rite_aid`
- `walgreens_smart`
- `walgreens_specialty_pharmacy`
- `walgreens_specialty_pharmacy_of_puerto_rico`
- `walmart`
- `walmart_walmart`
- `wegmans`
- `weis`
- `weis_weis`
- `winn_dixie`
