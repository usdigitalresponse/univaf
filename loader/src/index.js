const sources = {
  cvsApi: require("./sources/cvs/api"),
  cvsScraper: require("./sources/cvs/scraper"),
  cvsSmart: require("./sources/cvs/smart"),
  njvss: require("./sources/njvss"),
  riteAidApi: require("./sources/riteaid/api"),
  vaccinespotter: require("./sources/vaccinespotter"),
  "wa-doh": require("./sources/wa-doh"),
};

module.exports = { sources };
