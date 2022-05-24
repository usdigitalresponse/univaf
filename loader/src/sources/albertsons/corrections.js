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
  1642014209365: {
    address: "Jewel-Osco 4057 - 10203 W Grand Ave, Franklin Park, IL, 60131",
    description:
      "Ages 5-11 Instore Pediatric COVID Vaccination Event. This is held within Jewel-Osco.",
  },
  1641421916487: {
    address:
      "Jewel-Osco 3461 - 1860 S. Arlington Heights Rd., Arlington Heights, IL, 60005",
    description:
      "Ages 5-11 Instore Pediatric COVID Vaccination Event. This is held within Jewel-Osco.",
  },
  1636035919071: {
    address: "Safeway #4002 - 5727 Burke Ctr, Burke, VA, 22015",
  },
  1636072576751: {
    address: "Vons 2071 - 2250 Otay Lakes, Chula Vista, CA, 91915",
  },
  1636040926832: {
    address:
      "Pavilions 2233 - 7 Peninsula Center, Rolling Hills Estates, CA, 90274",
  },
  1640017202147: {
    address:
      "Covina Valley USD at The Hanes Center Field - 252 W Puente St 2nd Floor, Covina, CA, 91723",
  },
  1636072844592: {
    address: "Albertsons 758 - 543 Sweetwater Rd, Spring Valley, CA, 91977",
  },
  1636040974661: {
    address: "Albertsons 598 - 2000 E. 17th St., Santa Ana, CA, 92705",
  },
  1639432080601: {
    address:
      "Safeway 1466 - 1121 North Circle Dr., Colorado Springs, CO, 80909",
  },
  1635957678982: {
    address: "Albertsons 168 - 405 South 8th, Payette, ID, 83661",
  },
  1636041009830: {
    address:
      "Pavilions 2217 - 22451 Antonio Parkway, Rancho S Margarita, CA, 92688",
  },
  1635549531160: {
    address: "Pavilions 2206 - 16450 Beach Blvd, Westminster, CA, 92683",
  },
  1635549499002: {
    address: "Vons 3519 - 4550 Atlantic Ave, Long Beach, CA, 90807",
  },
  1635549466460: {
    address: "Albertsons 108 - 1735 Artesia Blvd., Gardena, CA, 90248",
  },
  1640969604226: {
    address: "Vons 1638 - 4226 Woodruff Avenue, Lakewood, CA, 90713",
  },
  1635964207815: {
    address: "Vons 2784 - 515 W Washington St, San Diego, CA, 92103",
  },
  1640025694701: {
    address: "Albertsons 331 - 927 S. China Lake Blvd., Ridgecrest, CA, 93555",
  },
  1636075700051: {
    address: "Vons 2724 - 3439 Via Montebello, Carlsbad, CA, 92009",
  },
  1639634436428: {
    address: "Vons 1797 - 4627 Carmel Mountain Road, San Diego, CA, 92130",
  },
  1639635348134: {
    address: "Vons 1797 - 4627 Carmel Mountain Road, San Diego, CA, 92130",
  },
  1639635038013: {
    address: "Vons 1797 - 4627 Carmel Mountain Road, San Diego, CA, 92130",
  },
  1638995474243: {
    address:
      "Vibrant Minds Charter School - 412 W. Carl Karcher Way, Anaheim, CA, 92801",
  },
  1617256794999: {
    address: "Albertsons 4231 - 215 N Carrier Pkwy, Grand Prairie, TX, 75050",
  },
  1643078690834: {
    address:
      "Rocketship Public School - 4250 Massachusetts Ave SE, Washington, DC, 20019",
  },
  1644444776878: {
    address: "Jewel-Osco #58 - 2855 W 95th Street, Naperville, IL, 60564",
  },
  1646340822687: {
    address: "Jewel-Osco #1190 - 13460 S. Route 59, Plainfield, IL, 60544",
  },
  1653357862707: {
    address: "Safeway #1490 - 2300 16th Street, San Francisco, CA, 94103",
  },

  // These two are the adult and pediatric versions of a single location, but
  // one is labeled in the raw data as "Albertsons Pharmacy 4706" and the
  // other is "Sav-On Pharmacy #4706" (we've verified they are really the same.)
  1646603430085: {
    address:
      "Sav-On Pharmacy #4706 - 30530 Rancho California Rd., Temecula, CA, 92591",
  },
  1600119436879: {
    address:
      "Sav-On Pharmacy #4706 - 30530 Rancho California Rd., Temecula, CA, 92591",
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
