/**
 * Zip codes in each state that can be queried with a 100 mile radius and cover
 * the whole state.
 *
 * These two tools let you draw circles on a map, and can be helpful in plotting
 * things out if this list needs to be adjusted. Make sure to use a < 100 mi
 * radius since these maps are mercator and will have notable amounts of error.
 * We also don't know whether the actual queries are geographic or geometric, so
 * there could be additional error introduced there. Basically, make sure
 * there's overlap. :)
 * - https://www.mapdevelopers.com/draw-circle-tool.php
 * - https://www.calcmaps.com/map-radius/
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

module.exports = {
  zipCodesCovering100Miles,
};
