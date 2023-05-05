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
 * Albertsons locations along with each zip code in QGIS.
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
  NJ: [
    {
      radius: 50,
      zips: [
        "08217", // Elwood
        "07067", // Colonia
      ],
    },
  ],
};

module.exports = {
  zipCodesCoveringAlbertsons,
};
