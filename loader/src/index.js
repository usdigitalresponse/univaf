const sources = {
  cvsApi: require("./sources/cvs/api"),
  cvsScraper: require("./sources/cvs/scraper"),
  njvss: require("./sources/njvss"),
  riteAidApi: require("./sources/riteaid/api"),
  vaccinespotter: require("./sources/vaccinespotter"),
};

module.exports = { sources };
