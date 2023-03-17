/**
 * Zip codes in each state that can be queried for nearby Rite Aid locations
 * and which cover all possible results.
 */

/**
 * These zip codes act as the center point for a series of 100-mile radius
 * queries and cover the entire geographic area of each state.
 *
 * These two tools let you draw circles on a map, and can be helpful in plotting
 * things out if this list needs to be adjusted. Make sure to use a < 100 mi
 * radius since these maps are mercator and will have notable amounts of error.
 * We also don't know whether the actual queries are geographic or geometric, so
 * there could be additional error introduced there. Basically, make sure
 * there's overlap. :)
 * - https://www.mapdevelopers.com/draw-circle-tool.php
 * - https://www.calcmaps.com/map-radius/
 *
 * @type {{[index: string]: string[]}}
 */
const zipCodesCovering100Miles = {
  CA: [
    "95573",
    "96015",
    "95971",
    "95448",
    "95321",
    "93902",
    "93526",
    "93206",
    "92309",
    "93590",
    "91962",
    "92225",
  ],
  CO: ["81641", "80481", "80720", "81052", "81019", "81130", "81431"],
  CT: ["06126"],
  DE: ["19962"],
  ID: ["83801", "83539", "83638", "83467", "83446", "83624", "83349", "83245"],
  MA: ["01075", "02332"], // Only really need 75 mi radius
  MD: ["21722", "21613"],
  MI: ["49961", "49817", "49716", "48625", "48371", "49004"],
  NH: ["03293"],
  NJ: ["08562"],
  NV: [
    "89404",
    "89405",
    "89438",
    "89823",
    "89301",
    "89045",
    "89427",
    "89013",
    "89001",
    "89026",
  ],
  NY: ["14145", "13057", "12986", "12526", "11717"],
  OH: ["45814", "43160", "45724", "44650"],
  OR: ["97910", "97620", "97525", "97456", "97712", "97008", "97836", "97814"],
  PA: ["17814", "15860", "15549", "19330"],
  VA: ["24270", "24043", "23936", "23168", "22039"],
  VT: ["05077"],
  WA: ["98565", "98923", "99335", "99147", "98816", "98272", "98331", "99118"],
};

/**
 * Zip codes and radii that can be used to to query all Rite Aid locations in a
 * state and ensure that each query receives < 100 results. (These are designed
 * for use with an API that has no pagination, so the result of each query has
 * to fit within a 100-item limit.)
 *
 * Unfortunately I haven't found a great automated way to do this (especially
 * since the API they are designed for seems to do some funny stuff, and does
 * not just give you back the nearest 100 results in the radius), so these are
 * pretty hand-tuned. They don't always cover the entire geographic area of a
 * state, so as Rite Aid expands, they made need adjustment. (I built them by
 * plotting all Rite Aid and Bartell locations and then each zip code in QGIS
 * and making smaller radii in denser areas.)
 *
 * Accurate as of March 2023. May need adjustment in the long-term future.
 *
 * @type {{[index: string]: {radius: number, zips: string[]}[]}}
 */
const zipCodesCoveringAllRiteAids = {
  CA: [
    {
      radius: 100,
      zips: ["93546", "93555", "92225", "95503", "95482", "96013", "96143"],
    },
    {
      radius: 55,
      zips: ["93446", "93463", "93210", "93280", "93905", "92201", "95334"],
    },
    {
      radius: 25,
      zips: [
        "93534",
        "94585",
        "94925",
        "95023",
        "95062",
        "95119",
        "93940",
        "94061",
        "94523",
        "94550",
        "95616",
        "95207",
      ],
    },
    {
      radius: 10,
      zips: [
        "93065",
        "93060",
        "92154",
        "92223",
        "92373",
        "92377",
        "92019",
        "92008",
        "92025",
        "92028",
        "92065",
        "92082",
        "92116",
        "92130",
        "92694",
        "92807",
        "92845",
        "93010",
        "93001",
        "93023",
        "93030",
        "93015",
        "92404",
        "92505",
        "92530",
        "92557",
        "92571",
        "92545",
        "92584",
        "92592",
        "92612",
        "90241",
        "90501",
        "90034",
        "91761",
        "91901",
        "91792",
        "91030",
        "91040",
        "91302",
        "91325",
        "91350",
        "91360",
        "92128",
        "92345",
      ],
    },
  ],
  CT: [{ radius: 100, zips: ["06126"] }],
  DE: [{ radius: 100, zips: ["19962"] }],
  ID: [{ radius: 100, zips: ["83843", "83714", "83814"] }],
  MA: [{ radius: 85, zips: ["01075", "02332"] }],
  MD: [
    { radius: 55, zips: ["21202"] },
    { radius: 25, zips: ["21613", "21811", "21851"] },
  ],
  MI: [
    { radius: 100, zips: ["49770", "49103", "49431"] },
    {
      radius: 25,
      zips: [
        "48105",
        "48116",
        "48144",
        "48173",
        "48811",
        "48768",
        "48867",
        "48915",
        "48640",
        "48658",
        "48763",
        "49221",
        "49202",
        "48040",
        "48471",
      ],
    },
    {
      radius: 10,
      zips: [
        "48067",
        "48080",
        "48095",
        "48044",
        "48371",
        "48462",
        "48326",
        "48503",
        "48444",
        "48446",
      ],
    },
  ],
  NH: [{ radius: 100, zips: ["03293"] }],
  NJ: [
    {
      radius: 50,
      zips: [
        "07834",
        "07730",
        "08690",
        "07107",
        "07840",
        "08051",
        "08361",
        "08260",
        "08015",
        "08731",
      ],
    },
  ],
  NV: [
    {
      radius: 30,
      zips: ["89410"],
    },
  ],
  NY: [
    { radius: 100, zips: ["13662"] },
    { radius: 55, zips: ["13440", "12010", "14527"] },
    {
      radius: 25,
      zips: [
        "14173",
        "11746",
        "13820",
        "14006",
        "14020",
        "11941",
        "12401",
        "12553",
        "14757",
        "14779",
        "14131",
      ],
    },
    {
      radius: 10,
      zips: [
        "13903",
        "14225",
        "10509",
        "10989",
        "10530",
        "10301",
        "11416",
        "10458",
      ],
    },
  ],
  OH: [
    { radius: 55, zips: ["45750", "45690", "45833", "43907", "43050"] },
    {
      radius: 25,
      zips: [
        "44231",
        "44281",
        "44041",
        "44089",
        "44103",
        "44883",
        "45345",
        "45505",
        "44507",
        "43452",
        "43551",
      ],
    },
  ],
  OR: [
    {
      radius: 100,
      zips: [
        "97910",
        "97620",
        "97525",
        "97456",
        "97712",
        "97008",
        "97836",
        "97814",
      ],
    },
  ],
  PA: [
    {
      radius: 55,
      zips: ["17815", "17032", "18848", "16601", "15834", "16354"],
    },
    {
      radius: 25,
      zips: [
        "19320",
        "17201",
        "18436",
        "18701",
        "18073",
        "18360",
        "15237",
        "15314",
        "15425",
        "15626",
        "16226",
        "16037",
      ],
    },
    {
      radius: 10,
      zips: ["18940", "19064", "19141"],
    },
    {
      radius: 8,
      zips: ["19007"],
    },
  ],
  VA: [{ radius: 100, zips: ["23188", "24440"] }],
  VT: [{ radius: 100, zips: ["05077"] }],
  WA: [
    { radius: 100, zips: ["98841", "99201", "99354"] },
    { radius: 55, zips: ["98632", "98520", "98362"] },
    {
      radius: 15,
      zips: [
        "98022",
        "98075",
        "98110",
        "98166",
        "98204",
        "98221",
        "98225",
        "98230",
        "98249",
        "98252",
        "98272",
        "98277",
        "98284",
        "98292",
        "98335",
        "98373",
        "98516",
        "98597",
      ],
    },
  ],
};

module.exports = {
  zipCodesCovering100Miles,
  zipCodesCoveringAllRiteAids,
};
