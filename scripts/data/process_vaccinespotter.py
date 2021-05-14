#
# Script to download and process vaccinespotter.org's appointment
# availability data.
#
#
# Usage:
#
#   python process_univaf.py [-h] [-s START_DATE] [-e END_DATE] [-c]
#
#
# Todo:
#
#   [ ] is it useful to store both old and new data row?
#   [ ] (how to) store individual appointments?
#
#
# Authors:
#
#   Jan Overgoor - jsovergoor@usdigitalresponse.org
#

import argparse
import csv
import datetime
import dateutil.parser
import gzip
import json
import os
import pytz
import sys
import traceback
import urllib.request
import us
import lib  # internal


# set paths
main_url = "https://www.vaccinespotter.org/database/history/"
path_raw = lib.path_root + 'data/vaccine_spotter_raw/'
path_out = lib.path_root + 'data/vaccine_spotter_clean/'
locations_path = path_out + 'locations_vs.csv'

# global locations object
locations = {}


def do_date(ds):
    """
    Process a single date
    """
    print("[INFO] doing %s" % ds, end='')
    fn = "%s.jsonl.gz" % (ds)

    # download if it doesn't exist already
    if not os.path.exists(path_raw + fn):
        print("\n[INFO]   downloading %s from vaccinespotter.org" % fn, end='')
        url = main_url + fn
        # big files so handle with care..
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozila/5.0'})
        response = urllib.request.urlopen(req)
        # taken from from https://stackoverflow.com/a/1517728
        CHUNK = 16 * 1024
        with open(path_raw + fn, 'wb') as f:
            while True:
                chunk = response.read(CHUNK)
                if not chunk:
                    break
                f.write(chunk)
    size = os.stat(path_raw + fn).st_size * 1.0 / 1e+6
    print(" (size: %d MB)" % size)
    n_lines = 0
    n_avs = 0

    # open output file
    fn_out = "%savailabilities_%s.csv" % (path_out, ds)
    f_avs = open(fn_out, 'w')
    writer = csv.writer(f_avs, delimiter=',', quoting=csv.QUOTE_MINIMAL)

    # open input file
    with gzip.open(path_raw + fn, 'rb') as f:
        while True:
            line = f.readline()
            if line is None or len(line) == 0:
                break
            try:
                data = json.loads(line[:-1].replace(b"\\\\", b"\\").decode())
            except json.decoder.JSONDecodeError:
                print('[ERROR] json.decoder.JSONDecodeError:')
                print(line)
                exit()

            #print(data)
            #print(data['audit_id'])

            n_lines += 1
            try:
                if data['action'] == 'UPDATE':
                    loc = data['data']
                elif data['action'] == 'INSERT':
                    loc = data['changed_data']
                elif data['action'] == 'DELETE':
                    loc = data['previous_data']
                else:
                    print('[WARN] different action than {UPDATE,INSERT}')
                    print(lib.pp(data))

                # TODO : is this the correct id??
                id = loc['id']

                #
                # extract location data
                #
                # NOTE: assumes that location meta-data stays stable,
                #       and takes the last known non-null values as true
                # TODO: should maybe check and give a warning if not
                # if iid not in locations:
                if True:
                    # set fields to None by default
                    [uuid, name, provider, type, address, city, county,
                     state, zip, lat, lng] = [None] * 11
                    # extract fields
                    if loc['name'] is not None:
                        name = loc['name']
                    if loc['brand'] is not None:
                        provider = loc['brand'].lower()
                    if loc['address'] is not None:
                        address = loc['address']
                    if loc['city'] is not None:
                        city = loc['city'].title()
                    if loc['state'] is not None:
                        state = loc['state'].upper()
                    if loc['postal_code'] is not None:
                        zip = "%05d" % int(loc['postal_code'][:5])
                    if loc['location'] is not None:
                        lat = loc['location']['latitude']
                        lng = loc['location']['longitude']
                    # insert row
                    locations[id] = {
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

                if data['action'] in ['INSERT', 'DELETE']:
                    continue
                # warn if anything else than known values get updated
                if data['changed_data'] is None or (
                    'appointments' not in data['changed_data'] and
                    'appointments_available' not in data['changed_data']):
                    #if 'time_zone' not in data['changed_data']:
                    #    print('[WARN]   %d - different values in changed_data: %s' %
                    #          (data['audit_id'], ', '.join(data['changed_data'].keys())))
                    #sink = None
                    continue
                #
                # extract "any" availability data
                #
                for block in [data['previous_data'], data['data']]:
                    # they only started recording last_fetched later...
                    if 'appointments_last_fetched' in block and block['appointments_last_fetched'] is not None:
                        ts = block['appointments_last_fetched']
                    elif 'updated_at' in block and block['updated_at'] is not None:
                        ts = block['updated_at']
                    else:
                        ts = data['transaction_timestamp']
                    time_raw = dateutil.parser.parse(ts)
                    # (optional) compute local offset
                    if (block['time_zone'] is not None and block['time_zone'] != '') or block['state'] is not None:
                        if block['time_zone'] is not None and block['time_zone'] != '':
                            local_tz = block['time_zone']
                        else:
                            local_tz = us.states.lookup(block['state']).time_zones[0]
                        time_local = time_raw.astimezone(pytz.timezone(local_tz))
                        offset = int(time_local.utcoffset().total_seconds() / (60 * 60))
                    else:
                        offset = None
                    # convert to UTC, so it's all the same
                    time_utc = time_raw.astimezone(pytz.timezone('UTC'))

                    # extract availabilities
                    availability = None
                    if block['appointments_available']:
                        if block['appointments'] is not None:
                            availability = len(block['appointments'])
                        else:
                            availability = '+'
                    elif not block['appointments_available']:
                        availability = 0
                    else:
                        availability = None
                        print('[WARN]   %d - no availability found' % data['audit_id'])
                    writer.writerow((id,
                                     time_utc.strftime("%Y-%m-%d %H:%M:%S"),
                                     offset,
                                     availability))
                    n_avs += 1

            except Exception:
                print("Unexpected error:", sys.exc_info())
                traceback.print_exc()
                print("Problem data: ")
                print(lib.pp(data))
                exit()

    # close file
    f_avs.close()
    print("[INFO]   processed %d records from %s" % (n_lines, path_raw + fn))
    print("[INFO]   wrote %d availability records to %s" % (n_avs, fn_out))
    # write updated locations file
    lib.write_locations(locations, locations_path)


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
    # computer intersection with days that VaccineSpotter actually has data for
    try:
        # first try latest, from internet (if possible)
        url = main_url + "days.json"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozila/5.0'})
        s = urllib.request.urlopen(req).read().decode()
        with open(path_raw + "days.json", 'w') as f:
            f.write(json.dumps(json.loads(s), indent=4))
        json_vs = json.loads(s)
    except urllib.error.URLError as e:
        # read locally as fallback
        print("[WARN] no internet connection, get local VS date list instead")
        with open(path_raw + "days.json", 'r') as f:
            json_vs = json.load(f)
    dates_vs = [x['name'].split('.')[0] for x in json_vs['files']]
    dates = sorted(lib.intersect(dates, dates_vs))
    print("[INFO] doing these dates: [%s]" % ', '.join(dates))
    # parse whether to keep previous locations
    if args.clean_run:
        print("[INFO] clean_run=T, so no old locations are being read")
    else:
        print("[INFO] clean_run=F, so keep previously collected location data")
        locations = lib.read_locations(locations_path)
    # iterate over days
    for date in dates:
        do_date(date)
