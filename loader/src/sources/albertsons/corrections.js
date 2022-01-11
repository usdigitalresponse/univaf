/**
 * Manual corrections for misformatted/bad source data. The keys are the `id`
 * property for the location, and the value is any properties that should be
 * overridden.
 */
module.exports.corrections = {
  1641420736546: {
    address: "Jewel-Osco 3441 - 2940 N Ashland Ave, Chicago, IL, 60657",
  },
  1641925863911: {
    address: "Albertsons 564 - 451 NE 181st Ave, Portland, OR, 97230",
  },
  1641421349223: {
    address: "Jewel-Osco 3429 - 8730 W Dempster St, Niles, IL, 60714",
  },

  // Some Safeways have their pediatric vaccines listed as "Peds" instead of
  // "Safeway". Not sure it's safe to always assume Safeway is the right fix,
  // though, so we are doing manual corrections for each one.
  1635962942932: {
    address: "Safeway 2624 - 3602 W. 144th Ave., Broomfield, CO, 80023",
  },
  1635956505599: {
    address: "Safeway 1614 - 560 Corona Street, Denver, CO, 80218",
  },
};
