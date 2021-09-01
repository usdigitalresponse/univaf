const prepmodHostsByState = {
  AK: {
    state: "https://myhealth.alaska.gov",
  },
  CA: {
    state: "https://www.caprepmod.org",
    "Fresno County": "http://www.stayhealthyfresno.com",
  },
  CO: {
    state: "https://www.comassvax.org",
  },
  IA: {
    "Polk County": "https://www.immunizepolk.com",
    "Scott County": "https://immunize.scottcountyiowa.gov",
  },
  ID: {
    state: "https://www.idahoprepmod.com",
  },
  MA: {
    state: "https://clinics.maimmunizations.org",
  },
  MD: {
    state: "https://www.marylandvax.org",
  },
  MN: {
    state: "https://prepmod.health.state.mn.us",
    "Anoka County": "https://acappt.co.anoka.mn.us",
    "Dakota County": "https://phappt.co.dakota.mn.us",
  },
  MT: {
    state: "https://www.mtreadyclinic.org",
  },
  ND: {
    state: "https://www.ndvax.org",
  },
  PA: {
    state: "https://vaccinations.health.pa.gov",
    Philadelphia: "https://philadelphia.cdn.prod.prepmodapp.com",
  },
  RI: {
    state: "https://www.vaccinateri.org",
  },
  VA: {
    state: "https://vaccineappointments.virginia.gov",
    "Virginia Healthcare Association": "https://www.vavax.org",
  },
  WA: {
    state: "https://prepmod.doh.wa.gov",
  },
  WY: {
    state: "https://www.wyoapptportal.org",
  },

  // Not actually public health --------------------------

  // Multi-state Private healthcare company
  Concentra: { _: "https://production.aevp-vaccinate.com" },

  // Mille Lacs Health System (Minnesota hospital group)
  "Mille-Lacs": { _: "http://schedulemycovidvaccine.mlhealth.org" },

  // Hampton University (in Virginia)
  "Hampton-University": { _: "https://hampton-va.cdn.prod.prepmodapp.com" },

  // Prairie View A&M University (in Texas)
  "Prairie-View": { _: "https://pvam.cdn.prod.prepmodapp.com" },
};

module.exports = { prepmodHostsByState };
