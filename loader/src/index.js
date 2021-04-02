const sources = {
  cvsApi: require("./sources/cvs/api"),
  cvsScraper: require("./sources/cvs/scraper"),
  njvss: require("./sources/njvss"),
  vaccinespotter: require("./sources/vaccinespotter"),
};

module.exports = { sources };
