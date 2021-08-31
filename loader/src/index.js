const sources = {
  cdcApi: require("./sources/cdc/api"),
  cvsApi: require("./sources/cvs/api"),
  cvsScraper: require("./sources/cvs/scraper"),
  cvsSmart: require("./sources/cvs/smart"),
  njvss: require("./sources/njvss"),
  prepmod: require("./sources/prepmod"),
  riteAidApi: require("./sources/riteaid/api"),
  vaccinespotter: require("./sources/vaccinespotter"),
  waDoh: require("./sources/wa-doh"),
  vtsGeo: require("./sources/vts/geo"),
};

module.exports = { sources };
