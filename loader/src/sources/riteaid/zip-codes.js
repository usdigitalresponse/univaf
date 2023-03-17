/**
 * Zip codes in each state that can be queried with a 100 mile radius and cover
 * the whole state.
 *
 * These two tools let you draw circles on a map, and can be helpful in plotting
 * things out if this list needs to be adjusted. Make sure to use a < 100 mi
 * radius since these maps are mercator and will have notable amounts of error.
 * We also don't know whether the actual queries are geographic or geometric, so
 * there could be additional error introduced there. Basically, make sure
 * there's overlap. :)
 * - https://www.mapdevelopers.com/draw-circle-tool.php
 * - https://www.calcmaps.com/map-radius/
 *
 * @type {{[index: string]: string[]}}
 */
const zipCodesCovering100Miles = {
  CA: [
    "95573",
    "96015",
    "95971",
    "95448",
    "95321",
    "93902",
    "93526",
    "93206",
    "92309",
    "93590",
    "91962",
    "92225",
  ],
  CO: ["81641", "80481", "80720", "81052", "81019", "81130", "81431"],
  CT: ["06126"],
  DE: ["19962"],
  ID: ["83801", "83539", "83638", "83467", "83446", "83624", "83349", "83245"],
  MA: ["01075", "02332"], // Only really need 75 mi radius
  MD: ["21722", "21613"],
  MI: ["49961", "49817", "49716", "48625", "48371", "49004"],
  NH: ["03293"],
  NJ: ["08562"],
  NV: [
    "89404",
    "89405",
    "89438",
    "89823",
    "89301",
    "89045",
    "89427",
    "89013",
    "89001",
    "89026",
  ],
  NY: ["14145", "13057", "12986", "12526", "11717"],
  OH: ["45814", "43160", "45724", "44650"],
  OR: ["97910", "97620", "97525", "97456", "97712", "97008", "97836", "97814"],
  PA: ["17814", "15860", "15549", "19330"],
  VA: ["24270", "24043", "23936", "23168", "22039"],
  VT: ["05077"],
  WA: ["98565", "98923", "99335", "99147", "98816", "98272", "98331", "99118"],
};

/** @type {{[index: string]: {radius: number, zips: string[]}[]}} */
const zipCodesCoveringDynamicAreas = {
  CA: [
    {
      radius: 100,
      zips: ["93546", "93555", "92225", "95503", "95482", "96013", "96143"],
    },
    {
      radius: 55,
      zips: ["93446", "93463", "93210", "93280", "93905", "92201", "95334"],
    },
    {
      radius: 25,
      zips: [
        "93534",
        "94585",
        "94925",
        "95023",
        "95062",
        "95119",
        "93940",
        "94061",
        "94523",
        "94550",
        "95616",
        "95207",
      ],
    },
    {
      radius: 10,
      zips: [
        "93065",
        "93060",
        "92154",
        "92223",
        "92373",
        "92377",
        "92019",
        "92008",
        "92025",
        "92028",
        "92065",
        "92082",
        "92116",
        "92130",
        "92694",
        "92807",
        "92845",
        "93010",
        "93001",
        "93023",
        "93030",
        "93015",
        "92404",
        "92505",
        "92530",
        "92557",
        "92571",
        "92545",
        "92584",
        "92592",
        "92612",
        "90241",
        "90501",
        "90034",
        "91761",
        "91901",
        "91792",
        "91030",
        "91040",
        "91302",
        "91325",
        "91350",
        "91360",
        "92128",
        "92345",
      ],
    },
  ],
  CT: [{ radius: 100, zips: ["06126"] }],
  DE: [{ radius: 100, zips: ["19962"] }],
  ID: [{ radius: 100, zips: ["83843", "83714", "83814"] }],
  MA: [{ radius: 85, zips: ["01075", "02332"] }],
  // FIXME: Needs real values. Should result in ~40 stores.
  MD: [{ radius: 100, zips: ["21722", "21613"] }],
  MI: [
    { radius: 100, zips: ["49770", "49103", "49431"] },
    {
      radius: 25,
      zips: [
        "48105",
        "48116",
        "48144",
        "48173",
        "48811",
        "48768",
        "48867",
        "48915",
        "48640",
        "48658",
        "48763",
        "49221",
        "49202",
        "48040",
        "48471",
      ],
    },
    {
      radius: 10,
      zips: [
        "48067",
        "48080",
        "48095",
        "48044",
        "48371",
        "48462",
        "48326",
        "48503",
        "48444",
        "48446",
      ],
    },
  ],
  NH: [{ radius: 100, zips: ["03293"] }],
  NJ: [
    {
      radius: 50,
      zips: [
        "07834",
        "07730",
        "08690",
        "07107",
        "07840",
        "08051",
        "08361",
        "08260",
        "08015",
        "08731",
      ],
    },
  ],
  NV: [
    {
      radius: 30,
      zips: ["89410"],
    },
  ],
  // FIXME: Needs real values. Should result in ~271 stores.
  NY: [{ radius: 100, zips: ["14145", "13057", "12986", "12526", "11717"] }],
  // FIXME: Needs real values. Should result in ~195 stores.
  OH: [{ radius: 100, zips: ["45814", "43160", "45724", "44650"] }],
  OR: [
    {
      radius: 100,
      zips: [
        "97910",
        "97620",
        "97525",
        "97456",
        "97712",
        "97008",
        "97836",
        "97814",
      ],
    },
  ],
  // FIXME: Needs real values. Should result in ~487 stores.
  PA: [{ radius: 100, zips: ["17814", "15860", "15549", "19330"] }],
  // FIXME: Needs real values. Should result in ~64 stores.
  // Radius garners too many results in some locations.
  VA: [{ radius: 100, zips: ["24270", "24043", "23936", "23168", "22039"] }],
  VT: [{ radius: 100, zips: ["05077"] }],
  WA: [
    { radius: 100, zips: ["98841", "99201", "99354"] },
    { radius: 55, zips: ["98632", "98520", "98362"] },
    {
      radius: 15,
      zips: [
        "98022",
        "98075",
        "98110",
        "98166",
        "98204",
        "98221",
        "98225",
        "98230",
        "98249",
        "98252",
        "98272",
        "98277",
        "98284",
        "98292",
        "98335",
        "98373",
        "98516",
        "98597",
      ],
    },
  ],
};

/* @type {{[index: string]: string[]}} */
const allZipCodesByState = {
  NY: [
    "10001",
    "10002",
    "10003",
    "10009",
    "10011",
    "10014",
    "10016",
    "10017",
    "10019",
    "10023",
    "10025",
    "10026",
    "10027",
    "10029",
    "10031",
    "10032",
    "10033",
    "10034",
    "10035",
    "10038",
    "10075",
    "10128",
    "10281",
    "10301",
    "10312",
    "10314",
    "10452",
    "10453",
    "10454",
    "10457",
    "10458",
    "10459",
    "10461",
    "10462",
    "10463",
    "10466",
    "10469",
    "10472",
    "10473",
    "10475",
    "10502",
    "10509",
    "10512",
    "10530",
    "10541",
    "10550",
    "10566",
    "10705",
    "10941",
    "10989",
    "11001",
    "11010",
    "11021",
    "11050",
    "11103",
    "11104",
    "11106",
    "11201",
    "11203",
    "11204",
    "11209",
    "11210",
    "11212",
    "11214",
    "11215",
    "11219",
    "11220",
    "11222",
    "11223",
    "11224",
    "11225",
    "11226",
    "11229",
    "11231",
    "11233",
    "11234",
    "11235",
    "11236",
    "11354",
    "11361",
    "11366",
    "11367",
    "11368",
    "11372",
    "11374",
    "11375",
    "11377",
    "11385",
    "11411",
    "11416",
    "11419",
    "11421",
    "11422",
    "11429",
    "11434",
    "11507",
    "11542",
    "11552",
    "11554",
    "11561",
    "11563",
    "11570",
    "11572",
    "11580",
    "11590",
    "11596",
    "11703",
    "11706",
    "11710",
    "11714",
    "11717",
    "11725",
    "11726",
    "11731",
    "11743",
    "11746",
    "11754",
    "11756",
    "11757",
    "11762",
    "11763",
    "11764",
    "11766",
    "11768",
    "11771",
    "11772",
    "11776",
    "11779",
    "11782",
    "11784",
    "11787",
    "11795",
    "11941",
    "11946",
    "11953",
    "11967",
    "11968",
    "12010",
    "12065",
    "12078",
    "12180",
    "12203",
    "12205",
    "12401",
    "12508",
    "12533",
    "12538",
    "12549",
    "12550",
    "12553",
    "12590",
    "12601",
    "12603",
    "12801",
    "12866",
    "13021",
    "13027",
    "13031",
    "13039",
    "13045",
    "13206",
    "13208",
    "13212",
    "13413",
    "13440",
    "13492",
    "13502",
    "13662",
    "13760",
    "13820",
    "13903",
    "14001",
    "14004",
    "14006",
    "14011",
    "14020",
    "14031",
    "14043",
    "14047",
    "14048",
    "14052",
    "14057",
    "14063",
    "14068",
    "14070",
    "14072",
    "14075",
    "14086",
    "14092",
    "14094",
    "14120",
    "14127",
    "14131",
    "14136",
    "14141",
    "14150",
    "14173",
    "14174",
    "14201",
    "14202",
    "14206",
    "14207",
    "14209",
    "14210",
    "14211",
    "14212",
    "14213",
    "14214",
    "14215",
    "14217",
    "14218",
    "14220",
    "14221",
    "14222",
    "14223",
    "14224",
    "14225",
    "14226",
    "14227",
    "14301",
    "14304",
    "14305",
    "14424",
    "14450",
    "14456",
    "14482",
    "14513",
    "14514",
    "14527",
    "14609",
    "14617",
    "14621",
    "14625",
    "14701",
    "14757",
    "14760",
    "14779",
    "14810",
    "14830",
    "14845",
    "14901",
    "14904",
  ],
  PA: [
    "15001",
    "15003",
    "15009",
    "15010",
    "15012",
    "15017",
    "15021",
    "15022",
    "15024",
    "15025",
    "15027",
    "15037",
    "15044",
    "15045",
    "15059",
    "15062",
    "15063",
    "15065",
    "15066",
    "15068",
    "15074",
    "15089",
    "15090",
    "15101",
    "15102",
    "15106",
    "15108",
    "15116",
    "15120",
    "15122",
    "15126",
    "15129",
    "15131",
    "15132",
    "15136",
    "15139",
    "15143",
    "15146",
    "15201",
    "15202",
    "15203",
    "15205",
    "15206",
    "15207",
    "15210",
    "15211",
    "15212",
    "15213",
    "15216",
    "15217",
    "15220",
    "15221",
    "15222",
    "15223",
    "15224",
    "15229",
    "15232",
    "15233",
    "15234",
    "15235",
    "15236",
    "15237",
    "15238",
    "15239",
    "15243",
    "15301",
    "15314",
    "15317",
    "15370",
    "15401",
    "15419",
    "15425",
    "15442",
    "15537",
    "15601",
    "15613",
    "15626",
    "15627",
    "15632",
    "15642",
    "15644",
    "15650",
    "15666",
    "15683",
    "15701",
    "15714",
    "15717",
    "15767",
    "15801",
    "15834",
    "15853",
    "15857",
    "15901",
    "15902",
    "15904",
    "15905",
    "15931",
    "15943",
    "15946",
    "15963",
    "16001",
    "16037",
    "16046",
    "16057",
    "16066",
    "16101",
    "16105",
    "16117",
    "16121",
    "16125",
    "16127",
    "16137",
    "16142",
    "16146",
    "16148",
    "16150",
    "16201",
    "16226",
    "16242",
    "16301",
    "16316",
    "16323",
    "16335",
    "16354",
    "16407",
    "16417",
    "16428",
    "16438",
    "16501",
    "16502",
    "16504",
    "16505",
    "16507",
    "16508",
    "16509",
    "16510",
    "16601",
    "16602",
    "16630",
    "16648",
    "16652",
    "16673",
    "16686",
    "16735",
    "16743",
    "16801",
    "16803",
    "16823",
    "16830",
    "16901",
    "16915",
    "17011",
    "17013",
    "17019",
    "17020",
    "17025",
    "17032",
    "17033",
    "17042",
    "17043",
    "17050",
    "17055",
    "17057",
    "17066",
    "17070",
    "17074",
    "17078",
    "17090",
    "17101",
    "17104",
    "17109",
    "17110",
    "17111",
    "17113",
    "17201",
    "17222",
    "17225",
    "17257",
    "17268",
    "17315",
    "17319",
    "17325",
    "17331",
    "17345",
    "17350",
    "17356",
    "17361",
    "17362",
    "17363",
    "17401",
    "17402",
    "17403",
    "17404",
    "17512",
    "17566",
    "17584",
    "17602",
    "17603",
    "17701",
    "17754",
    "17815",
    "17872",
    "17901",
    "17921",
    "17931",
    "17948",
    "17954",
    "17976",
    "18013",
    "18015",
    "18017",
    "18018",
    "18042",
    "18045",
    "18049",
    "18051",
    "18052",
    "18055",
    "18064",
    "18067",
    "18071",
    "18073",
    "18088",
    "18101",
    "18102",
    "18103",
    "18104",
    "18106",
    "18201",
    "18232",
    "18235",
    "18252",
    "18301",
    "18302",
    "18322",
    "18344",
    "18360",
    "18403",
    "18407",
    "18411",
    "18431",
    "18436",
    "18444",
    "18447",
    "18466",
    "18503",
    "18504",
    "18505",
    "18508",
    "18512",
    "18518",
    "18603",
    "18634",
    "18640",
    "18643",
    "18657",
    "18661",
    "18701",
    "18702",
    "18704",
    "18705",
    "18707",
    "18708",
    "18709",
    "18801",
    "18840",
    "18848",
    "18901",
    "18902",
    "18938",
    "18940",
    "18944",
    "18947",
    "18951",
    "18954",
    "18964",
    "18974",
    "18976",
    "19001",
    "19002",
    "19003",
    "19006",
    "19007",
    "19008",
    "19010",
    "19013",
    "19014",
    "19018",
    "19025",
    "19026",
    "19027",
    "19030",
    "19036",
    "19047",
    "19050",
    "19053",
    "19054",
    "19057",
    "19061",
    "19063",
    "19064",
    "19067",
    "19072",
    "19073",
    "19076",
    "19082",
    "19083",
    "19087",
    "19096",
    "19103",
    "19104",
    "19106",
    "19107",
    "19111",
    "19114",
    "19115",
    "19116",
    "19118",
    "19120",
    "19121",
    "19122",
    "19123",
    "19124",
    "19125",
    "19126",
    "19128",
    "19129",
    "19130",
    "19131",
    "19132",
    "19133",
    "19134",
    "19135",
    "19137",
    "19138",
    "19139",
    "19140",
    "19141",
    "19142",
    "19143",
    "19144",
    "19145",
    "19146",
    "19147",
    "19148",
    "19149",
    "19150",
    "19151",
    "19152",
    "19153",
    "19154",
    "19320",
    "19335",
    "19341",
    "19348",
    "19363",
    "19380",
    "19382",
    "19401",
    "19403",
    "19406",
    "19428",
    "19438",
    "19446",
    "19454",
    "19460",
    "19464",
    "19465",
    "19468",
    "19518",
    "19526",
    "19530",
    "19543",
    "19567",
    "19601",
    "19602",
    "19605",
    "19606",
    "19607",
    "19608",
    "19610",
    "19611",
  ],
  DE: [
    "19701",
    "19702",
    "19703",
    "19709",
    "19711",
    "19713",
    "19720",
    "19801",
    "19802",
    "19804",
    "19808",
    "19810",
    "19901",
    "19934",
    "19947",
    "19952",
    "19956",
    "19958",
    "19963",
    "19966",
    "19967",
    "19971",
    "19973",
    "19975",
    "19977",
  ],
  MD: [
    "21015",
    "21040",
    "21043",
    "21050",
    "21060",
    "21061",
    "21078",
    "21117",
    "21133",
    "21146",
    "21157",
    "21202",
    "21208",
    "21209",
    "21212",
    "21215",
    "21216",
    "21224",
    "21225",
    "21227",
    "21228",
    "21236",
    "21237",
    "21601",
    "21613",
    "21619",
    "21784",
    "21801",
    "21804",
    "21811",
    "21842",
    "21851",
    "21853",
    "21875",
    "21921",
  ],
  VA: [
    "23061",
    "23072",
    "23185",
    "23188",
    "23220",
    "23224",
    "23236",
    "23314",
    "23320",
    "23322",
    "23323",
    "23324",
    "23430",
    "23434",
    "23435",
    "23451",
    "23452",
    "23453",
    "23454",
    "23455",
    "23456",
    "23462",
    "23464",
    "23503",
    "23505",
    "23509",
    "23517",
    "23518",
    "23601",
    "23602",
    "23662",
    "23663",
    "23666",
    "23669",
    "23692",
    "23701",
    "23703",
    "23803",
    "23831",
    "23834",
    "23851",
    "23860",
    "23868",
    "24430",
    "24440",
  ],
  OH: [
    "43019",
    "43050",
    "43302",
    "43311",
    "43326",
    "43338",
    "43348",
    "43351",
    "43402",
    "43410",
    "43420",
    "43430",
    "43449",
    "43452",
    "43460",
    "43502",
    "43506",
    "43512",
    "43528",
    "43537",
    "43545",
    "43551",
    "43558",
    "43560",
    "43566",
    "43567",
    "43605",
    "43606",
    "43608",
    "43609",
    "43611",
    "43612",
    "43613",
    "43614",
    "43615",
    "43616",
    "43617",
    "43623",
    "43701",
    "43725",
    "43793",
    "43812",
    "43907",
    "43920",
    "43968",
    "44001",
    "44004",
    "44024",
    "44030",
    "44035",
    "44041",
    "44044",
    "44047",
    "44052",
    "44054",
    "44055",
    "44057",
    "44060",
    "44062",
    "44070",
    "44077",
    "44089",
    "44090",
    "44094",
    "44095",
    "44102",
    "44103",
    "44106",
    "44107",
    "44108",
    "44109",
    "44111",
    "44119",
    "44122",
    "44124",
    "44134",
    "44136",
    "44137",
    "44142",
    "44145",
    "44147",
    "44203",
    "44212",
    "44221",
    "44231",
    "44256",
    "44270",
    "44278",
    "44281",
    "44312",
    "44319",
    "44333",
    "44408",
    "44410",
    "44413",
    "44420",
    "44425",
    "44432",
    "44444",
    "44460",
    "44483",
    "44484",
    "44485",
    "44502",
    "44505",
    "44507",
    "44509",
    "44511",
    "44512",
    "44514",
    "44515",
    "44601",
    "44614",
    "44615",
    "44641",
    "44646",
    "44647",
    "44657",
    "44663",
    "44667",
    "44683",
    "44685",
    "44688",
    "44691",
    "44702",
    "44704",
    "44707",
    "44708",
    "44709",
    "44714",
    "44718",
    "44720",
    "44721",
    "44805",
    "44827",
    "44830",
    "44833",
    "44857",
    "44870",
    "44875",
    "44883",
    "44890",
    "44904",
    "44905",
    "44907",
    "45044",
    "45123",
    "45133",
    "45309",
    "45322",
    "45323",
    "45344",
    "45345",
    "45377",
    "45385",
    "45403",
    "45405",
    "45406",
    "45410",
    "45414",
    "45420",
    "45429",
    "45431",
    "45458",
    "45504",
    "45505",
    "45690",
    "45694",
    "45714",
    "45750",
    "45769",
    "45780",
    "45801",
    "45804",
    "45805",
    "45806",
    "45810",
    "45833",
    "45840",
    "45875",
    "45879",
    "45885",
  ],
  MI: [
    "48001",
    "48003",
    "48009",
    "48015",
    "48017",
    "48021",
    "48035",
    "48040",
    "48042",
    "48043",
    "48044",
    "48045",
    "48047",
    "48048",
    "48051",
    "48060",
    "48062",
    "48066",
    "48067",
    "48070",
    "48072",
    "48080",
    "48081",
    "48083",
    "48084",
    "48091",
    "48092",
    "48093",
    "48094",
    "48095",
    "48098",
    "48101",
    "48103",
    "48105",
    "48108",
    "48111",
    "48116",
    "48122",
    "48124",
    "48126",
    "48134",
    "48135",
    "48144",
    "48150",
    "48152",
    "48169",
    "48170",
    "48173",
    "48178",
    "48180",
    "48183",
    "48184",
    "48188",
    "48192",
    "48193",
    "48198",
    "48201",
    "48207",
    "48209",
    "48215",
    "48220",
    "48221",
    "48223",
    "48224",
    "48234",
    "48236",
    "48237",
    "48238",
    "48301",
    "48304",
    "48306",
    "48309",
    "48312",
    "48313",
    "48314",
    "48316",
    "48320",
    "48322",
    "48326",
    "48327",
    "48328",
    "48329",
    "48334",
    "48335",
    "48336",
    "48340",
    "48341",
    "48342",
    "48346",
    "48348",
    "48356",
    "48371",
    "48375",
    "48377",
    "48381",
    "48382",
    "48393",
    "48420",
    "48423",
    "48429",
    "48430",
    "48433",
    "48439",
    "48442",
    "48444",
    "48446",
    "48451",
    "48453",
    "48455",
    "48458",
    "48462",
    "48463",
    "48471",
    "48473",
    "48503",
    "48504",
    "48506",
    "48507",
    "48509",
    "48529",
    "48532",
    "48601",
    "48602",
    "48603",
    "48604",
    "48612",
    "48622",
    "48624",
    "48625",
    "48629",
    "48640",
    "48647",
    "48653",
    "48656",
    "48658",
    "48661",
    "48706",
    "48708",
    "48722",
    "48723",
    "48732",
    "48734",
    "48750",
    "48763",
    "48768",
    "48801",
    "48809",
    "48811",
    "48820",
    "48823",
    "48827",
    "48837",
    "48838",
    "48840",
    "48842",
    "48843",
    "48846",
    "48847",
    "48854",
    "48858",
    "48864",
    "48867",
    "48872",
    "48875",
    "48879",
    "48910",
    "48912",
    "48915",
    "48917",
    "49001",
    "49010",
    "49014",
    "49015",
    "49017",
    "49024",
    "49031",
    "49036",
    "49037",
    "49038",
    "49047",
    "49057",
    "49068",
    "49091",
    "49093",
    "49103",
    "49106",
    "49107",
    "49120",
    "49201",
    "49202",
    "49203",
    "49221",
    "49242",
    "49307",
    "49316",
    "49319",
    "49327",
    "49331",
    "49341",
    "49345",
    "49404",
    "49412",
    "49423",
    "49428",
    "49431",
    "49441",
    "49445",
    "49456",
    "49461",
    "49504",
    "49506",
    "49508",
    "49546",
    "49548",
    "49601",
    "49646",
    "49660",
    "49677",
    "49684",
    "49686",
    "49707",
    "49720",
    "49727",
    "49735",
    "49756",
    "49770",
    "49779",
    "49783",
  ],
  ID: [
    "83501",
    "83605",
    "83638",
    "83642",
    "83702",
    "83705",
    "83706",
    "83713",
    "83714",
    "83814",
    "83835",
    "83843",
  ],
  NV: ["89410"],
  CA: [
    "90001",
    "90004",
    "90006",
    "90013",
    "90015",
    "90017",
    "90019",
    "90020",
    "90024",
    "90026",
    "90027",
    "90028",
    "90029",
    "90031",
    "90034",
    "90036",
    "90037",
    "90038",
    "90042",
    "90043",
    "90046",
    "90059",
    "90064",
    "90065",
    "90066",
    "90201",
    "90210",
    "90221",
    "90222",
    "90230",
    "90232",
    "90241",
    "90245",
    "90247",
    "90262",
    "90270",
    "90274",
    "90277",
    "90278",
    "90280",
    "90291",
    "90303",
    "90403",
    "90405",
    "90501",
    "90502",
    "90505",
    "90601",
    "90602",
    "90621",
    "90630",
    "90631",
    "90638",
    "90640",
    "90650",
    "90660",
    "90706",
    "90713",
    "90723",
    "90731",
    "90732",
    "90740",
    "90744",
    "90802",
    "90803",
    "90804",
    "90807",
    "90815",
    "91001",
    "91010",
    "91011",
    "91030",
    "91040",
    "91104",
    "91106",
    "91107",
    "91203",
    "91206",
    "91214",
    "91301",
    "91302",
    "91307",
    "91311",
    "91325",
    "91331",
    "91340",
    "91342",
    "91344",
    "91345",
    "91350",
    "91354",
    "91360",
    "91362",
    "91364",
    "91387",
    "91402",
    "91405",
    "91406",
    "91423",
    "91505",
    "91604",
    "91606",
    "91607",
    "91701",
    "91702",
    "91709",
    "91710",
    "91724",
    "91730",
    "91745",
    "91746",
    "91748",
    "91750",
    "91754",
    "91761",
    "91762",
    "91764",
    "91766",
    "91770",
    "91780",
    "91792",
    "91801",
    "91901",
    "91902",
    "91910",
    "91915",
    "91945",
    "91977",
    "92008",
    "92011",
    "92019",
    "92020",
    "92024",
    "92025",
    "92028",
    "92040",
    "92054",
    "92056",
    "92065",
    "92082",
    "92084",
    "92101",
    "92103",
    "92105",
    "92107",
    "92109",
    "92111",
    "92115",
    "92116",
    "92117",
    "92118",
    "92119",
    "92120",
    "92122",
    "92124",
    "92126",
    "92128",
    "92129",
    "92130",
    "92154",
    "92201",
    "92211",
    "92220",
    "92223",
    "92225",
    "92227",
    "92231",
    "92234",
    "92236",
    "92240",
    "92243",
    "92260",
    "92262",
    "92277",
    "92284",
    "92307",
    "92308",
    "92311",
    "92317",
    "92324",
    "92335",
    "92336",
    "92337",
    "92345",
    "92354",
    "92363",
    "92371",
    "92373",
    "92377",
    "92392",
    "92394",
    "92395",
    "92399",
    "92404",
    "92407",
    "92503",
    "92504",
    "92505",
    "92506",
    "92507",
    "92509",
    "92530",
    "92544",
    "92545",
    "92553",
    "92557",
    "92571",
    "92583",
    "92584",
    "92586",
    "92591",
    "92592",
    "92595",
    "92596",
    "92606",
    "92612",
    "92618",
    "92625",
    "92626",
    "92627",
    "92629",
    "92637",
    "92649",
    "92660",
    "92672",
    "92675",
    "92677",
    "92683",
    "92688",
    "92694",
    "92701",
    "92704",
    "92708",
    "92780",
    "92782",
    "92801",
    "92804",
    "92807",
    "92821",
    "92833",
    "92840",
    "92843",
    "92845",
    "92860",
    "92867",
    "92882",
    "92886",
    "93001",
    "93003",
    "93010",
    "93013",
    "93015",
    "93021",
    "93023",
    "93030",
    "93041",
    "93060",
    "93063",
    "93065",
    "93101",
    "93103",
    "93109",
    "93117",
    "93210",
    "93212",
    "93215",
    "93221",
    "93223",
    "93230",
    "93240",
    "93241",
    "93245",
    "93247",
    "93250",
    "93257",
    "93263",
    "93268",
    "93274",
    "93277",
    "93280",
    "93286",
    "93292",
    "93301",
    "93304",
    "93306",
    "93308",
    "93309",
    "93311",
    "93312",
    "93313",
    "93314",
    "93401",
    "93402",
    "93405",
    "93420",
    "93422",
    "93442",
    "93446",
    "93449",
    "93454",
    "93458",
    "93463",
    "93505",
    "93514",
    "93534",
    "93546",
    "93550",
    "93551",
    "93552",
    "93555",
    "93560",
    "93561",
    "93610",
    "93618",
    "93630",
    "93635",
    "93637",
    "93644",
    "93654",
    "93662",
    "93703",
    "93706",
    "93710",
    "93711",
    "93720",
    "93722",
    "93726",
    "93727",
    "93730",
    "93905",
    "93927",
    "93930",
    "93940",
    "93950",
    "94019",
    "94024",
    "94044",
    "94061",
    "94402",
    "94403",
    "94507",
    "94509",
    "94510",
    "94520",
    "94523",
    "94531",
    "94544",
    "94546",
    "94547",
    "94550",
    "94551",
    "94553",
    "94559",
    "94561",
    "94563",
    "94565",
    "94577",
    "94583",
    "94585",
    "94587",
    "94588",
    "94590",
    "94597",
    "94611",
    "94901",
    "94903",
    "94925",
    "94941",
    "94947",
    "95003",
    "95010",
    "95014",
    "95018",
    "95019",
    "95023",
    "95032",
    "95037",
    "95051",
    "95062",
    "95119",
    "95120",
    "95121",
    "95124",
    "95125",
    "95127",
    "95128",
    "95205",
    "95207",
    "95210",
    "95222",
    "95240",
    "95301",
    "95307",
    "95320",
    "95334",
    "95337",
    "95338",
    "95340",
    "95350",
    "95355",
    "95360",
    "95361",
    "95370",
    "95376",
    "95380",
    "95382",
    "95401",
    "95405",
    "95407",
    "95422",
    "95437",
    "95448",
    "95472",
    "95476",
    "95482",
    "95490",
    "95503",
    "95519",
    "95531",
    "95540",
    "95603",
    "95608",
    "95610",
    "95616",
    "95621",
    "95630",
    "95632",
    "95660",
    "95661",
    "95667",
    "95670",
    "95673",
    "95678",
    "95682",
    "95691",
    "95695",
    "95747",
    "95758",
    "95814",
    "95816",
    "95819",
    "95821",
    "95822",
    "95824",
    "95825",
    "95826",
    "95828",
    "95831",
    "95835",
    "95838",
    "95843",
    "95926",
    "95932",
    "95945",
    "95948",
    "95954",
    "95961",
    "95966",
    "95969",
    "95971",
    "95993",
    "96001",
    "96002",
    "96007",
    "96013",
    "96019",
    "96021",
    "96067",
    "96073",
    "96097",
    "96101",
    "96130",
    "96143",
    "96150",
    "96161",
  ],
  OR: [
    "97003",
    "97005",
    "97007",
    "97013",
    "97015",
    "97030",
    "97031",
    "97034",
    "97035",
    "97045",
    "97051",
    "97058",
    "97070",
    "97123",
    "97124",
    "97128",
    "97138",
    "97146",
    "97205",
    "97209",
    "97212",
    "97214",
    "97218",
    "97221",
    "97222",
    "97223",
    "97224",
    "97225",
    "97230",
    "97236",
    "97266",
    "97301",
    "97302",
    "97303",
    "97322",
    "97330",
    "97338",
    "97355",
    "97365",
    "97367",
    "97381",
    "97401",
    "97402",
    "97405",
    "97411",
    "97415",
    "97439",
    "97459",
    "97470",
    "97471",
    "97477",
    "97504",
    "97520",
    "97526",
    "97527",
    "97535",
    "97601",
    "97701",
    "97702",
    "97738",
    "97754",
    "97756",
    "97801",
    "97814",
    "97838",
    "97850",
    "97862",
    "97914",
  ],
  WA: [
    "98002",
    "98003",
    "98004",
    "98006",
    "98011",
    "98012",
    "98021",
    "98022",
    "98023",
    "98026",
    "98027",
    "98028",
    "98030",
    "98031",
    "98032",
    "98034",
    "98036",
    "98037",
    "98040",
    "98042",
    "98052",
    "98056",
    "98057",
    "98058",
    "98072",
    "98075",
    "98102",
    "98110",
    "98115",
    "98118",
    "98121",
    "98126",
    "98136",
    "98144",
    "98155",
    "98166",
    "98177",
    "98203",
    "98204",
    "98221",
    "98223",
    "98225",
    "98226",
    "98230",
    "98248",
    "98249",
    "98252",
    "98258",
    "98264",
    "98270",
    "98271",
    "98272",
    "98273",
    "98275",
    "98277",
    "98284",
    "98290",
    "98292",
    "98312",
    "98335",
    "98338",
    "98346",
    "98354",
    "98362",
    "98366",
    "98370",
    "98372",
    "98373",
    "98375",
    "98382",
    "98383",
    "98387",
    "98391",
    "98406",
    "98408",
    "98444",
    "98465",
    "98466",
    "98499",
    "98502",
    "98503",
    "98513",
    "98516",
    "98520",
    "98528",
    "98531",
    "98532",
    "98550",
    "98597",
    "98626",
    "98632",
    "98671",
    "98682",
    "98684",
    "98823",
    "98837",
    "98841",
    "98902",
    "98903",
    "98926",
    "98944",
    "99163",
    "99201",
    "99203",
    "99205",
    "99206",
    "99208",
    "99212",
    "99218",
    "99223",
    "99301",
    "99336",
    "99352",
    "99354",
    "99362",
  ],
  CT: [
    "06492",
    "06473",
    "06410",
    "06770",
    "06810",
    "06705",
    "06608",
    "06513",
    "06855",
    "06708",
    "06716",
    "06512",
    "06519",
    "06468",
    "06471",
    "06472",
    "06514",
    "06804",
    "06801",
    "06824",
    "06811",
    "06401",
    "06510",
    "06516",
    "06460",
    "06614",
    "06905",
    "06877",
  ],
  MA: ["01510", "02721", "02151", "02746", "01301", "02724", "02740", "01570"],
  NJ: [
    "08103",
    "07834",
    "08046",
    "08901",
    "08021",
    "07002",
    "08332",
    "08742",
    "07621",
    "07823",
    "08902",
    "08107",
    "08075",
    "08007",
    "08077",
    "07730",
    "08109",
    "08033",
    "07034",
    "08302",
    "08083",
    "08096",
    "08079",
    "07306",
    "07676",
    "08043",
    "08069",
    "08110",
    "08002",
    "08690",
    "08863",
    "07012",
    "08861",
    "07753",
    "08027",
    "07701",
    "08080",
    "07508",
    "08889",
    "08312",
    "08010",
    "07111",
    "08004",
    "07601",
    "08562",
    "08701",
    "08048",
    "08904",
    "07860",
    "08104",
    "08005",
    "08087",
    "08873",
    "07018",
    "08807",
    "08086",
    "08876",
    "08859",
    "08094",
    "08081",
    "08724",
    "08817",
    "08016",
    "08360",
    "07107",
    "07463",
    "07825",
    "08820",
    "07758",
    "07840",
    "07882",
    "07960",
    "08009",
    "08028",
    "08034",
    "08053",
    "08051",
    "08055",
    "08057",
    "08062",
    "08066",
    "08085",
    "08098",
    "08091",
    "08361",
    "08736",
    "08753",
    "08527",
    "08759",
    "08260",
    "08721",
    "08015",
    "08755",
    "08722",
    "08084",
    "07419",
    "07480",
    "08012",
    "08030",
    "08731",
    "08108",
    "08691",
    "08735",
    "08865",
  ],
  NH: [
    "03862",
    "03452",
    "03064",
    "03835",
    "03848",
    "03773",
    "03833",
    "03077",
    "03038",
    "03054",
    "03102",
    "03055",
    "03051",
    "03053",
    "03060",
    "03079",
    "03104",
    "03106",
    "03109",
    "03246",
    "03110",
    "03253",
    "03301",
    "03743",
    "03431",
    "03458",
    "03784",
    "03820",
    "03801",
    "03861",
    "03824",
    "03865",
    "03842",
    "03857",
    "03867",
    "03868",
    "03235",
    "03275",
    "03785",
    "03076",
    "03101",
    "03263",
    "03470",
    "03222",
    "03561",
    "03878",
    "03264",
    "03251",
    "03244",
  ],
  VT: ["05149", "05032", "05301", "05060", "05156", "05089"],
};

module.exports = {
  zipCodesCovering100Miles,
  zipCodesCoveringDynamicAreas,
  allZipCodesByState,
};
