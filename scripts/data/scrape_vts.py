#
# Script to scrape VaccinateTheStates locations and concordances.
#
#
# Usage:
#
#   python scrape_vts.py
#
#
# Authors:
#
#   Jan Overgoor - jsovergoor@usdigitalresponse.org
#

import lib
import csv
import json
import urllib.request

states = ['AK', 'AL', 'AR', 'AS', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL',
          'GA', 'GU', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA',
          'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH',
          'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'PR', 'RI', 'SC',
          'SD', 'TN', 'TX', 'UT', 'VA', 'VI', 'VT', 'WA', 'WI', 'WV', 'WY']
#states = ['CA']

locations = []
concordances = []

for state in states:
    url = "https://api.vaccinatethestates.com/v0/%s.geojson" % state
    print(url)
    with urllib.request.urlopen(url) as r:
        data = json.loads(r.read().decode())
    for em in data['features']:
        id = em['id']
        name = em['properties']['name']
        state = em['properties']['state']
        type = em['properties']['location_type']
        address = em['properties']['full_address']
        if address is not None:
            address = address.replace('\n', '')
            zip = address[-5:]
            if len(address.split(',')) == 3:
                address = address.split(',')[0]
            elif len(address.split(',')) == 4:
                address = address.split(',')[0] + ',' + address.split(',')[1]
        else:
            zip = None
        city = em['properties']['city']
        county = em['properties']['county']
        lat = em['geometry']['coordinates'][0]
        lng = em['geometry']['coordinates'][1]
        # add
        locations.append([id, name, type, address, zip, city, county, state, lat, lng])
        concordances = concordances + [[id, x] for x in em['properties']['concordances']]


with open('%s/data/clean/vst_locations.csv' % lib.path_root, 'w') as f:
    writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL)
    writer.writerow(['id','name','type','address','zip','city','county','state','lat','lng'])
    sink = [writer.writerow(x) for x in locations]
with open('%s/data/clean/vst_concordances.csv' % lib.path_root, 'w') as f:
    writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL)
    writer.writerow(['vts_id','external_id'])
    sink = [writer.writerow(x) for x in concordances]
