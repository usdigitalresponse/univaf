const sources = {
  albertsons: require("./sources/albertsons"),
  cdcApi: require("./sources/cdc/api"),
  cvsApi: require("./sources/cvs/api"),
  cvsScraper: require("./sources/cvs/scraper"),
  cvsSmart: require("./sources/cvs/smart"),
  heb: require("./sources/heb"),
  hyvee: require("./sources/hyvee"),
  krogerSmart: require("./sources/kroger"),
  njvss: require("./sources/njvss"),
  prepmod: require("./sources/prepmod"),
  riteAidApi: require("./sources/riteaid/api"),
  riteAidScraper: require("./sources/riteaid/scraper"),
  vaccinespotter: require("./sources/vaccinespotter"),
  vtsGeo: require("./sources/vts/geo"),
  waDoh: require("./sources/wa-doh"),
  walgreensSmart: require("./sources/walgreens"),
};

module.exports = { sources };
