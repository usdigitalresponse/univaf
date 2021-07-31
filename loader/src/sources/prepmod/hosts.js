const prepmodHostsByState = {
  AK: {
    _: "https://myhealth.alaska.gov",
  },
  CA: {
    _: "https://www.caprepmod.org",
    "Fresno County": "http://www.stayhealthyfresno.com",
  },
  CO: {
    _: "https://www.comassvax.org",
  },
  IA: {
    "Polk County": "https://www.immunizepolk.com",
    "Scott County": "https://immunize.scottcountyiowa.gov",
  },
  ID: {
    _: "https://www.idahoprepmod.com",
  },
  MA: {
    _: "https://clinics.maimmunizations.org",
  },
  MD: {
    _: "https://www.marylandvax.org",
  },
  MN: {
    _: "https://prepmod.health.state.mn.us",
    "Anoka County": "https://acappt.co.anoka.mn.us",
    "Dakota County": "https://phappt.co.dakota.mn.us",
  },
  MT: {
    _: "https://www.mtreadyclinic.org",
  },
  ND: {
    _: "https://www.ndvax.org",
  },
  PA: {
    _: "https://vaccinations.health.pa.gov",
    Philadelphia: "https://philadelphia.cdn.prod.prepmodapp.com",
  },
  RI: {
    _: "https://www.vaccinateri.org",
  },
  VA: {
    _: "https://vaccineappointments.virginia.gov",
    "Virginia Healthcare Association": "https://www.vavax.org",
  },
  WA: {
    _: "https://prepmod.doh.wa.gov",
  },
  WY: {
    _: "https://www.wyoapptportal.org",
  },

  // Not actually public health --------------------------

  // Multi-state Private healthcare company
  Concentra: {
    _: "https://production.aevp-vaccinate.com",
  },

  // MN hospital group
  "Mille Lacs Health System": {
    _: "http://schedulemycovidvaccine.mlhealth.org",
  },

  // VA university
  "Hampton University": {
    _: "https://hampton-va.cdn.prod.prepmodapp.com",
  },

  // TX university
  "Prairie View A&M University": {
    _: "https://pvam.cdn.prod.prepmodapp.com",
  },
};

module.exports = prepmodHostsByState;
