#
# Script to process NJ's historical data, as created by running:
#
#   cd /tmp/af/repos/nj-vaccine-scraper
#   git log -p data.json > data_history
#
# * some listings don't have id's, they are currently skipped
# * mega-sites are currently not working very well. Their updates go over
#   multiple blocks, so the name/id doesn't get attached to the availability
#   data.
#
# Usage:
#
#   python process_nj.py
#
#
# Todo:
#
#
#
# Authors:
#
#   Jan Overgoor - jsovergoor@usdigitalresponse.org
#

import csv
import json
import dateutil.parser
import lib  # internal


# set paths
path_raw = lib.path_root + 'repos/nj-vaccine-scraper/'
path_out = lib.path_root + 'data/nj_clean/'

# keep track of whether current lines are relevant
reader_on = False
lines = []


def process_lines(lines):
    """
    Process a single change block.
    """
    (id, name, time, availability) = (None, None, None, None)

    for line in lines:
        if line[:4] == '\"id\"':
            id = line.split(': ')[1][1:-2]
        if line[:6] == '\"name\"':
            name = line.split(': ')[1][1:-2]
        if line[:11] == '\"available\"':
            availability = line.split(': ')[1][1:-2]
        if line[:16] == '+    \"available\"':
            availability = line.split(': ')[1][1:-2]
        if line[:17] == '+    \"checked_at\"':
            time = line.split(': ')[1][1:-2]
            if time == 'ul':  # was 'null'
                return None
            try:
                time = dateutil.parser.parse(time)
            except dateutil.parser.ParserError:
                print("\n [ERROR] can't process timestamp line %s" % line)
                for line in lines:
                    print(line)
                exit()
            # time = time.astimezone(pytz.timezone('UTC'))  # already UTC
            time = time.strftime("%Y-%m-%d %H:%M:%S")
    if (id is None and name is None) or time is None or availability is None:
        #print("\n [ERROR] some field is NULL")
        #print((id, name, time, -4, availability))
        #for line in lines:
        #    print(line)
        return None
        #exit()
    if availability == 'no':
        availability = '0'
    if availability == 'yes':
        availability = '+'
    return (id, name, time, -4, availability)


# read latest locations from json (not history)
locations = {}
with open(path_raw + 'data.json', 'r') as f:
    data_raw = json.load(f)
for row in data_raw:
    [name, provider, type, address, city, county, state, zip] = [None] * 8
    # extract fields
    if 'id' in row:
        id = row['id']
    # some locations don't have id's, can use name, but would be terribly ugly
    elif 'name' in row and row['name'] is not None:
        continue
    if 'name' in row and row['name'] is not None:
        name = row['name'].title()
    if 'operated_by' in row and row['operated_by'] is not None:
        provider = row['operated_by'].lower()
    if 'official' in row and row['official'] is not None:
        if 'isMegasite' in row['official']:
            if row['official']['isMegasite']:
                type = 'megasite'
            else:
                type = 'normal'
        if 'Facility Address' in row['official']:
            address = row['official']['Facility Address']
            if ', NJ' in address and '\n' not in address:
                zip = address[-5:]
                city = address.split(', ')[1]
                address = address.split(', ')[0]
            elif '\n' in address and len(address.split('\n')) == 2:
                city = address.split('\n')[1]
                address = address.split('\n')[0]
            else:
                address = None
        if 'County' in row['official']:
            county = row['official']['County']
    state = 'NJ'
    # insert row
    locations[id] = {
        'uuid': None,
        'name': name,
        'provider': provider,
        'type': type,
        'address': address,
        'city': city,
        'county': county,
        'state': state,
        'zip': zip,
        'lat': None,
        'lng': None
    }

# write updated locations file
lib.write_locations(locations, path_out + 'locations_nj.csv')

# open output file
fn_out = "%savailabilities.csv" % (path_out)
f_avs = open(fn_out, 'w')
writer = csv.writer(f_avs, delimiter=',', quoting=csv.QUOTE_MINIMAL)
n_avs = 0

# open input file
f = open(path_raw + 'data_history', 'r')
while True:
    line = f.readline()
    if line is None or len(line) == 0:
        break
    # skip lines if irrelevant, until "changes block"
    if not reader_on:
        if line[:2] == '@@':
            reader_on = True
        continue
    else:
        if line[:2] in ['@@', 'co']:
            res = process_lines(lines)
            if res is not None:
                writer.writerow(res)
                n_avs += 1
            lines = []
            if line[:2] == 'co':
                reader_on = False
        else:
            lines.append(line[:-1].strip())

# close files
f.close()
f_avs.close()
print("[INFO]   wrote %d availability records to %s" % (n_avs, fn_out))
