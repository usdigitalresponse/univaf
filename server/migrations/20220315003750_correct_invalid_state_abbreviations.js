/**
 * Update the `state` field to always be a correct USPS state abbreviation.
 * We have some bad values that need cleaning up. All the existing bad values
 * are full state names.
 *
 * (Exception: there are some non-public locations with NULL states, but they
 * have lots of bad values and aren't worth repairing.)
 */

const states = [
  ["Alabama", "AL"],
  ["Alaska", "AK"],
  ["Arizona", "AZ"],
  ["Arkansas", "AR"],
  ["California", "CA"],
  ["Colorado", "CO"],
  ["Connecticut", "CT"],
  ["Delaware", "DE"],
  ["District of Columbia", "DC"],
  ["Florida", "FL"],
  ["Georgia", "GA"],
  ["Hawaii", "HI"],
  ["Idaho", "ID"],
  ["Illinois", "IL"],
  ["Indiana", "IN"],
  ["Iowa", "IA"],
  ["Kansas", "KS"],
  ["Kentucky", "KY"],
  ["Louisiana", "LA"],
  ["Maine", "ME"],
  ["Maryland", "MD"],
  ["Massachusetts", "MA"],
  ["Michigan", "MI"],
  ["Minnesota", "MN"],
  ["Mississippi", "MS"],
  ["Missouri", "MO"],
  ["Montana", "MT"],
  ["Nebraska", "NE"],
  ["Nevada", "NV"],
  ["New Hampshire", "NH"],
  ["New Jersey", "NJ"],
  ["New Mexico", "NM"],
  ["New York", "NY"],
  ["North Carolina", "NC"],
  ["North Dakota", "ND"],
  ["Ohio", "OH"],
  ["Oklahoma", "OK"],
  ["Oregon", "OR"],
  ["Pennsylvania", "PA"],
  ["Rhode Island", "RI"],
  ["South Carolina", "SC"],
  ["South Dakota", "SD"],
  ["Tennessee", "TN"],
  ["Texas", "TX"],
  ["Utah", "UT"],
  ["Vermont", "VT"],
  ["Virginia", "VA"],
  ["Washington", "WA"],
  ["West Virginia", "WV"],
  ["Wisconsin", "WI"],
  ["Wyoming", "WY"],
  ["American Samoa", "AS"],
  ["Guam", "GU"],
  ["Northern Mariana Islands", "MP"],
  ["Puerto Rico", "PR"],
  ["U.S. Virgin Islands", "VI"],
  ["U.S. Minor Outlying Islands", "FM"],
  ["Marshall Islands", "MH"],
  ["Palau", "PW"],
  ["U.S. Armed Forces \u2013 Americas[d]", "AA"],
  ["U.S. Armed Forces \u2013 Europe[e]", "AE"],
  ["U.S. Armed Forces \u2013 Pacific[f]", "AP"],
  ["Northern Mariana Islands", "CM"],
  ["Panama Canal Zone", "CZ"],
  ["Nebraska", "NB"],
  ["Philippine Islands", "PI"],
  ["Trust Territory of the Pacific Islands", "TT"],
];

exports.up = async function (knex) {
  let count = 0;
  for (const [badText, goodText] of states) {
    count += await knex("provider_locations")
      .where("state", "ILIKE", badText)
      .update({ state: goodText });
  }

  console.log("Updated", count, "bad state abbreviations.");
};

exports.down = async function () {
  console.log(
    "20220315003750_correct_invalid_state_abbreviations: No migrated rows changed."
  );
};
