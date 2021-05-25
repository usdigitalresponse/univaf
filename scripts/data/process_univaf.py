#
# Script to process USDR's univaf appointment availability data.
# Warning! Currently need to run make_ids.py before every run...
#
#
# Usage:
#
#   python process_univaf.py [-h] [-s START_DATE] [-e END_DATE] [-c]
#
#
# Todo:
#
#   [ ] make location merging better
#   [ ] check duplicate locations
#   [ ] (how to) store individual appointments?
#
#
# Authors:
#
#   Jan Overgoor - jsovergoor@usdigitalresponse.org
#

import json
import os
import csv
import traceback
import sys
import dateutil.parser
import argparse
import us
import pytz
import lib  # internal


# set paths
path_raw = lib.path_root + 'data/univaf_raw/'
path_out = lib.path_root + 'data/univaf_clean/'
locations_path = path_out + 'locations_univaf.csv'

locations = {}
eid_to_id = {}
max_key = -1


def do_date(ds):
    """
    Process a single date
    """
    print("[INFO] doing %s" % ds)
    global max_key

    # open output file
    fn_out = "%savailabilities_%s.csv" % (path_out, ds)
    f_avs = open(fn_out, 'w')
    writer = csv.writer(f_avs, delimiter=',', quoting=csv.QUOTE_MINIMAL)
    n_avs = 0

    # iterate over scraped data
    for fn in sorted(os.listdir(path_raw)):
        if fn == '.DS_Store':
            continue
        # only do relevant dates
        if fn.split('_')[1] != ''.join(ds.split('-')):
            continue
        print("[INFO]   reading " + fn)
        with open(path_raw + fn) as f:
            data_raw = json.load(f)
        for row in data_raw:
            try:
                # deal with pagination
                if "__next__" in row:
                    fn_p2 = fn.split('.')[0] + '_p2.json'
                    # download if doesn't already exist
                    if fn_p2 not in os.listdir(path_raw):
                        url = 'http://getmyvax.org' + row['__next__']
                        lib.download_json_remotely(url, fn_p2)
                        # right now it just downloads it and process the next time
                        # right now it assumes there are only two pages
                    continue

                # this very ugly logic disambiguates ids (like in this issue:
                # https://github.com/usdigitalresponse/appointment-availability-infra/issues/120)
                # convert main id, depending on API version
                if lib.is_uuid(row['id']):
                    sid = 'uuid:%s' % row['id']
                else:
                    sid = 'univaf_v0:%s' % row['id']
                ids = [sid] + ["%s:%s" % x for x in row['external_ids'].items()]
                overlap = lib.intersect(ids, eid_to_id.keys())
                # if there are new external_ids, add them to the dictionary
                if len(overlap) != len(ids):
                    # if haven't seen any before, make new integer id
                    if not len(overlap):
                        siid = max_key
                        max_key = max_key + 1
                    else:
                        # take any of them, hopefully the same...
                        siid = eid_to_id[overlap[0]]
                    for x in ids:
                        eid_to_id[x] = str(siid)
                # take the inter version of the canonical id
                iid = int(eid_to_id[sid])

                #
                # extract location data
                #
                # NOTE: assumes that location meta-data stays stable,
                #       and takes the first known values as true
                # TODO: should maybe check and give a warning if not
                # TODO: might want to revert to *last* known values
                if iid not in locations:
                #if True:
                    # set fields to None by default
                    [uuid, name, provider, type, address, city, county,
                     state, zip, lat, lng] = [None] * 11
                    # extract fields
                    if lib.is_uuid(row['id']):
                        uuid = row['id']
                    # TODO: if NOT there, then should look up?
                    if 'name' in row and row['name'] is not None:
                        name = row['name'].title()
                    if 'provider' in row and row['provider'] is not None:
                        provider = row['provider'].lower()
                    if 'location_type' in row and row['location_type'] is not None:
                        type = row['location_type'].lower()
                    if 'address_lines' in row and row['address_lines'] is not None:
                        address = ','.join(row['address_lines'])
                    if 'city' in row and row['city'] is not None:
                        city = row['city'].title()
                    if 'county' in row and row['county'] is not None:
                        county = row['county'].title()
                    if 'state' in row and row['state'] is not None:
                        state = row['state'].upper()
                    if 'postal_code' in row and row['postal_code'] is not None:
                        # NOTE - this throws away information after first 5 digits
                        zip = "%05d" % int(row['postal_code'][:5])
                    if ('position' in row and row['position'] is not None and 'latitude' in row['position']):
                        lat = row['position']['latitude']
                    if ('position' in row and row['position'] is not None and 'longitude' in row['position']):
                        lng = row['position']['longitude']
                    # fix address issue for some NJ listings
                    if ', NJ' in address and zip is not None:
                        zip = address[-5:]
                        city = address.split(', ')[1]
                        address = address.split(', ')[0]
                    # insert row
                    locations[iid] = {
                        'uuid': uuid,
                        'name': name,
                        'provider': provider,
                        'type': type,
                        'address': address,
                        'city': city,
                        'county': county,
                        'state': state,
                        'zip': zip,
                        'lat': lat,
                        'lng': lng
                    }

                #
                # extract availability data
                #
                time_raw = dateutil.parser.parse(row['availability']['valid_at'])
                # compute local offset
                local_tz = us.states.lookup(row['state']).time_zones[0]
                time_local = time_raw.astimezone(pytz.timezone(local_tz))
                offset = int(time_local.utcoffset().total_seconds() / (60 * 60))
                # convert to UTC, so it's all the same
                time_utc = time_raw.astimezone(pytz.timezone('UTC'))
                # extract availabilities
                availability = None
                if row['availability']['available'] in ['YES', 'yes']:
                    if 'available_count' in row['availability']:
                        availability = row['availability']['available_count']
                    elif 'meta' in row['availability'] and row['availability']['meta'] is not None and 'capacity' in row['availability']['meta']:
                        cap = row['availability']['meta']['capacity']
                        #elif 'capacity' in row['availability']:
                        #    cap = row['availability']['capacity']
                        availability = 0
                        for em in cap:
                            if 'available_count' in em:
                                availability += em['available_count']
                            elif 'available' in em:
                                availability += em['available']
                            else:
                                raise Exception('No availability counts found...')
                    else:
                        availability = '+'
                elif row['availability']['available'] in ['NO', 'no']:
                    availability = 0
                elif row['availability']['available'] == 'UNKNOWN':
                    availability = None
                else:
                    availability = None
                    raise Exception('No availability found...')
                writer.writerow((iid,
                                 time_utc.strftime("%Y-%m-%d %H:%M:%S"),
                                 offset,
                                 availability))
                n_avs += 1
            except Exception as e:
                print("[ERROR] ", sys.exc_info())
                traceback.print_exc()
                print("Problem data: ")
                print(lib.pp(row))
                exit()

    # close availabilities file
    f_avs.close()
    print("[INFO]   wrote %d availability records to %s" % (n_avs, fn_out))
    # write updated locations file
    lib.write_locations(locations, locations_path)
    # write updated external id file
    with open(path_out + 'ids_external.csv', 'w') as f:
        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL)
        sink = [writer.writerow(x) for x in eid_to_id.items()]


if __name__ == "__main__":
    # read arguments
    parser = argparse.ArgumentParser()
    parser.add_argument('-s', '--start_date', help="first date to process")
    parser.add_argument('-e', '--end_date', help="last date to process")
    parser.add_argument('-c', '--clean_run', action='store_true',
                        help="replace previous locations file")
    args = parser.parse_args()
    # parse dates
    dates = lib.parse_date(parser)
    print("[INFO] doing these dates: [%s]" % ', '.join(dates))
    # parse whether to keep previous locations
    if args.clean_run:
        print("[INFO] clean_run=T, so no old locations are being read")
    else:
        print("[INFO] clean_run=F, so keep previously collected location data")
        # read prior locations
        locations = lib.read_locations(locations_path)
        max_key = max(locations.keys())
        # read prior external-id to numeric id mapping 
        with open(path_out + 'ids_external.csv', 'r') as f:
            eid_to_id2 = dict(list(csv.reader(f)))
    # iterate over days
    for date in dates:
        do_date(date)
