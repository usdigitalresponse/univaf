#
# Script to download and process vaccinespotter.org's appointment
# availability data.
# https://www.vaccinespotter.org/api/#historical
#
#
# Usage:
#
#   python process_vaccinespotter.py [-h] [-s START_DATE] [-e END_DATE] [-c]
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
# internal
import lib


# set paths
main_url = "https://www.vaccinespotter.org/database/history/"
path_raw = lib.path_root + 'data/vs_raw/'
path_out = lib.path_root + 'data/vs_clean/'
locations_path = path_out + 'locations.csv'

# set global variables
locations = {}
avs = {}    # { id : [ts_first, ts_last, offset, available] }
slots = {}  # { id : { ts_slot : [ts_first, ts_last, offset, available] }}


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

    # open output files
    fn_avs = "%savs_%s.csv" % (path_out, ds)
    f_avs = open(fn_avs, 'w')
    writer_avs = csv.writer(f_avs, delimiter=',', quoting=csv.QUOTE_MINIMAL)
    n_avs = 0
    fn_slots = "%sslots_%s.csv" % (path_out, ds)
    f_slots = open(fn_slots, 'w')
    writer_slots = csv.writer(f_slots, delimiter=',', quoting=csv.QUOTE_MINIMAL)
    n_slots = 0

    # read previous state, if exists
    avs = lib.read_previous_state(path_raw, ds, 'avs')
    slots = lib.read_previous_state(path_raw, ds, 'slots')
    # read zip map
    zipmap = lib.read_zipmap()

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
                iid = loc['id']

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
                     state, zip, lat, lng, timezone] = [None] * 12
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
                    # extract local timezone
                    if 'time_zone' in loc and loc['time_zone'] is not None and loc['time_zone'] != '':
                        timezone = loc['time_zone']
                    elif zip is not None:
                        timezone = zipmap[zip][0]
                    elif state is not None:
                        timezone = us.states.lookup(loc['state']).time_zones[0]
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
                        'lng': lng,
                        'timezone': timezone
                    }

                if data['action'] in ['INSERT', 'DELETE']:
                    continue
                # warn if anything else than known values get updated
                if data['changed_data'] is None or (
                    'appointments' not in data['changed_data'] and
                    'appointments_available' not in data['changed_data']):
                    continue
                #
                # extract "any" availability data
                #
                for row in [data['previous_data'], data['data']]:
                    # they only started recording last_fetched later...
                    if 'appointments_last_fetched' in row and row['appointments_last_fetched'] is not None:
                        ts = row['appointments_last_fetched']
                    elif 'updated_at' in row and row['updated_at'] is not None:
                        ts = row['updated_at']
                    else:
                        ts = data['transaction_timestamp']
                    time_raw = dateutil.parser.parse(ts)
                    # convert to UTC, so it's all the same
                    check_time_utc = time_raw.astimezone(pytz.timezone('UTC'))
                    # (optional) compute local offset
                    if locations[iid]['timezone'] is not None:
                        check_time_local = check_time_utc.astimezone(pytz.timezone(locations[iid]['timezone']))
                        offset = int(check_time_local.utcoffset().total_seconds() / (60 * 60))
                    else:
                        offset = None
                    check_time = check_time_utc.strftime("%Y-%m-%d %H:%M:%S")  # in UTC

                    # extract availabilities
                    availability = None
                    if row['appointments_available']:
                        if row['appointments'] is not None:
                            availability = len(row['appointments'])
                        else:
                            availability = '+'
                    elif not row['appointments_available']:
                        availability = 0
                    else:
                        availability = None
                        print('[WARN]   %d - no availability found' % data['audit_id'])

                    # create a new row if the location is new
                    if iid not in avs:
                        avs[iid] = [check_time, check_time, offset, availability]
                    # if new row but availability didn't change, just update time
                    if availability == avs[iid][3]:
                        avs[iid][1] = check_time
                    # else, write old row and update new row
                    else:
                        writer_avs.writerow([iid] + avs[iid])
                        n_avs += 1
                        avs[iid] = [check_time, check_time, offset, availability]

                    # do slots, if the data is there
                    if 'appointments' in row and row['appointments'] is not None:
                        # create a new row if the location is new
                        if iid not in slots:
                            slots[iid] = {}
                        for slot in row['appointments']:
                            if 'time' not in slot or slot['time'] is None:
                                continue
                            # compute local offset and UTC time for slot time
                            slot_time_local = datetime.datetime.fromisoformat(slot['time'])
                            slot_time_offset = int(slot_time_local.utcoffset().total_seconds() / (60 * 60))
                            slot_time_utc = slot_time_local.astimezone(pytz.timezone('UTC'))
                            slot_time = slot_time_utc.strftime("%Y-%m-%d %H:%M")  # in UTC
                            # if slot time didn't exist, create
                            if slot_time not in slots[iid]:
                                if slot_time > check_time:
                                    slots[iid][slot_time] = [check_time, check_time, offset]
                                else:
                                    continue
                            # if availability didn't change, just update time
                            if slot_time > check_time:
                                slots[iid][slot_time][1] = check_time
                            # else, write old row and update new row
                            else:
                                writer_slots.writerow([iid, slot_time] + slots[iid][slot_time])
                                n_slots += 1
                                del slots[iid][slot_time]
                        # assume that slots for which we saw no availaiblity in last update are not available anymore
                        for slot_time in list(slots[iid].keys()):
                            if slots[iid][slot_time][1] != check_time:
                                writer_slots.writerow([iid, slot_time] + slots[iid][slot_time])
                                n_slots += 1
                                del slots[iid][slot_time]

            except Exception:
                print("Unexpected error:", sys.exc_info())
                traceback.print_exc()
                print("Problem data: ")
                print(lib.pp(data))
                exit()

    # wrap up
    f_avs.close()
    f_slots.close()
    print("[INFO]   wrote %d availability records to %s" % (n_avs, fn_avs))
    print("[INFO]   wrote %d slot records to %s" % (n_slots, fn_slots))
    # write current state for the next day
    next_day = lib.add_days(ds, 1)
    with open(path_raw + 'state_%s_avs.json' % next_day, 'w') as f:
        json.dump(avs, f)
    with open(path_raw + 'state_%s_slots.json' % next_day, 'w') as f:
        json.dump(slots, f)
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
    # aggregate slot data over multiple days
    fn_slots = lib.path_root + 'data/clean/vs_slots.csv'
    lib.aggregate_slots(path_out, fn_slots)
