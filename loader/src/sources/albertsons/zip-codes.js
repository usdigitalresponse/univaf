/**
 * Zip codes and radii that can be used to to query all Albertsons locations in
 * a state.
 *
 * These are designed for use scraping Albertsons's booking website. We haven't
 * been able to determine a maximum radius (it's at least 75 miles as of
 * 2023-05-04) or a maximum number of results (but it's over 100!), so the radii
 * in this data are limited to 50 miles (the most you can choose in the web UI).
 *
 * Unfortunately I haven't found a great automated way to do calculate these,
 * so the data here is pretty hand-tuned. I built them by plotting all
 * Albertsons locations along with each zip code in QGIS. Once you've plotted
 * some options, it can be helpful to check that you are getting the right
 * number of results by finding the expected count with:
 *
 *     cat stores-scraped.json | jq 'map(select(.address.region == "LA")) | length'
 *
 * And then run the scraper to make sure your zip codes find the same stores.
 *
 * Accurate as of May 2023. May need adjustment in the long-term future.
 *
 * @type {{[index: string]: {radius: number, zips: string[]}[]}}
 */
const zipCodesCoveringAlbertsons = {
  AK: [
    {
      radius: 50,
      zips: [
        "99577", // Eagle River
        "99603", // Homer
        "99619", // Kodiak
        "99664", // Seward
        "99669", // Soldotna
        "99686", // Valdez
        "99701", // Fairbanks
        "99801", // Juneau
        "99950", // Ketchikan
      ],
    },
  ],
  DC: [
    {
      radius: 15,
      zips: [
        "20570", // Washington, DC
      ],
    },
  ],
  DE: [
    {
      radius: 50,
      zips: [
        "19906", // Dover
      ],
    },
  ],
  IA: [
    {
      radius: 50,
      zips: [
        "52777", // Wheatland
      ],
    },
  ],
  IL: [
    {
      radius: 50,
      zips: [
        "60180", // Union
        "60950", // Manteno
        "61285", // Thomson
        "61701", // Bloomington
      ],
    },
  ],
  IN: [
    {
      radius: 50,
      zips: [
        "46347", // Kouts
      ],
    },
  ],
  LA: [
    {
      radius: 50,
      zips: [
        "70601", // Lake Charlese
        "70533", // Erath
        "70456", // Roseland
        "71327", // Cottonport
        "71067", // Princeton
        // Not needed to cover known stores, but just to cover entire state.
        // "70083", // Port Sulphur
        // "70129", // New Orleans
        // "70390", // Napoleonvill
        // "71468", // Provencal
        // "71241", // Farmerville
        // "71266", // Pioneer
        // "71368", // Sicily Island
      ],
    },
  ],
  MA: [
    {
      radius: 50,
      zips: [
        "02345", // Manomet
        "02456", // New Town
        "01097", // Woronoco
      ],
    },
  ],
  MD: [
    {
      radius: 50,
      zips: [
        "21236", // Nottingham
        "21801", // Salisbury
        "20640", // Indian Head
        // Not needed to cover known stores, but just to cover entire state.
        // "21750", // Hancock
      ],
    },
    // Not needed to cover known stores, but just to cover entire state.
    // {
    //   radius: 15,
    //   zips: [
    //     "21520", // Accident
    //   ],
    // },
  ],
  ME: [
    {
      radius: 50,
      zips: [
        "04082", // South Windham
        "04952", // Morrill
        "04415", // Brownville Junction
        // Not needed to cover known stores, but just to cover entire state.
        // "04970", // Rangeley
        // "04686", // Wesley
        // "04760", // Monticello
        // "04739", // Eagle Lake
      ],
    },
    // Not needed to cover known stores, but just to cover entire state.
    // {
    //   radius: 75,
    //   zips: [
    //     "04478", // Rockwood
    //   ],
    // },
  ],
  NH: [
    {
      radius: 50,
      zips: [
        "03303", // Concord
        "03583", // Jefferson
      ],
    },
  ],
  NJ: [
    {
      radius: 50,
      zips: [
        "08217", // Elwood
        "07067", // Colonia
      ],
    },
  ],
  NY: [
    {
      radius: 50,
      zips: [
        "10541", // Mahopac
      ],
    },
  ],
  PA: [
    {
      radius: 50,
      zips: [
        "19460", // Phoenixville
      ],
    },
  ],
  RI: [
    {
      radius: 30,
      zips: [
        "02921", // Cranston
      ],
    },
  ],
  VA: [
    {
      radius: 50,
      zips: [
        // Doesn't cover much of Virginia, but covers all the Albertsons!
        "20119", // Catlett
      ],
    },
  ],
  VT: [
    {
      radius: 50,
      zips: [
        "05676", // Waterbury
      ],
    },
  ],
};

module.exports = {
  zipCodesCoveringAlbertsons,
};
