#
# Script to process USDR's univaf appointment availability data,
# as stored in the logs stored in the S3 folder. These files can be
# downloaded locally with scrape_univaf_logs.py
#
# We maintain an internal locations database to map the long UUID's
# to small numeric ids. Every time this script runs, it reprocesses
# the locations database.
#
# By default, it does not process slot-level data, only the number of
# available appointments per day. If the --slots (-a) flag is enbled,
# if prints out slot-level availabilities (usually without counts).
#
# NOTE: Both checked_time and slot_time are in UTC
#
# TODO: implement "no change" records as well. This is a bit hairy, as it
# requires maintaining state. I'm imagining keeping a dictionary of all
# locations, and only writing records when an update comes in, and at the
# end of the script. The main problem there is dealing with the state that
# came from the day before. Maybe it should write the last state of the day
# so that the next day can pick it up.
#
#
# Usage:
#
#   python process_univaf_new.py [-h] [-s START_DATE] [-e END_DATE] [-c] [-a]
#
#
# Produces:
#
#   univaf_locations.csv - (id, uuid, name, provider, type, address, city,
#                           county, state, zip, lat, lng, timezone)
#   univaf_ids.csv - (external_id, id)
#   univaf_new_avs_{DATE}.csv - (id, checked_time, availability)
#   univaf_new_slots_{DATE}.csv - (id, checked_time, slot_time, availability)
#
#
# Authors:
#
#   Jan Overgoor - jsovergoor@usdigitalresponse.org
#

import ndjson
import os
import csv
import traceback
import sys
import datetime
import dateutil.parser
import argparse
import us
import pytz
from shapely import wkb
# internal
import lib

# set paths
path_raw = lib.path_root + 'data/univaf_new_raw/'
path_out = lib.path_root + 'data/univaf_new_clean/'

locations = {}
eid_to_id = {}


#@profile  # for profiling
def do_date(ds, slots=False):
    """
    Process a single date.
    """
    print("[INFO] doing %s WITH%s slots" % (ds, '' if slots else 'OUT'))
    # open output file
    fn_out = "%sunivaf_new_avs_%s%s.csv" % (path_out, 'slots_' if slots else '', ds)
    f_avs = open(fn_out, 'w')
    writer = csv.writer(f_avs, delimiter=',', quoting=csv.QUOTE_MINIMAL)
    n_avs = 0
    # construct list of files to read
    fn = path_raw + 'availability_log-%s.ndjson' % ds
    if not os.path.exists(fn):
        print("[ERROR] path %s doesn't exist" % fn)
        return None
    print("[INFO]   reading " + fn)
    with open(fn, 'r') as f:
        reader = ndjson.reader(f)
        for row in reader:
            try:
                # for now, only process records with change
                # TODO: maintain state and update last valid_at
                if "available" not in row or row['available'] is None:
                    continue

                # look up the location
                iid = int(eid_to_id['uuid:%s' % row['location_id']])
                if iid not in locations:
                    print('[WARNING] id %d not in the dictionary...' % iid)
                    continue
                loc = locations[iid]

                # parse checked_time and convert to UTC if not already
                t = row['valid_at']
                if t[-5:] == '00:00' or t[-1] == 'Z':
                    check_time_utc = datetime.datetime.strptime(t[:19], "%Y-%m-%dT%H:%M:%S")
                else:
                    check_time_utc = dateutil.parser.parse(t).astimezone(pytz.timezone('UTC'))
                # compute offset
                check_time_local = check_time_utc.astimezone(pytz.timezone(loc['timezone']))
                check_time_offset = int(check_time_local.utcoffset().total_seconds() / (60 * 60))
                # construct output row
                row_out = [iid,
                           check_time_utc.strftime("%Y-%m-%d %H:%M:%S"),
                           check_time_offset]

                if slots:
                    if 'slots' not in row:
                        continue
                    for slot in row['slots']:
                        # compute local offset and UTC time for slot time
                        slot_time_local = datetime.datetime.fromisoformat(slot['start'])
                        slot_time_offset = int(slot_time_local.utcoffset().total_seconds() / (60 * 60))
                        slot_time_utc = slot_time_local.astimezone(pytz.timezone('UTC'))
                        availability = 1 if slot['available'] == 'YES' else 0
                        writer.writerow(row_out + [
                                          slot_time_utc.strftime("%Y-%m-%d %H:%M"),
                                          slot_time_offset,
                                          availability])
                        n_avs += 1
                else:
                    availability = None
                    if row['available'] in ['YES', 'yes']:
                        if 'available_count' in row:
                            availability = row['available_count']
                        elif 'capacity' in row and row['capacity'] is not None and row['capacity'][0]['available'] not in ['YES','NO']:
                            availability = 0
                            for em in row['capacity']:
                                if 'available_count' in em:
                                    availability += em['available_count']
                                elif 'available' in em:
                                    availability += em['available']
                                else:
                                    raise Exception('No availability counts found...')
                        else:
                            availability = '+'
                    elif row['available'] in ['NO', 'no']:
                        availability = 0
                    elif row['available'] == 'UNKNOWN':
                        availability = None
                    else:
                        availability = None
                        raise Exception('No availability found...')
                    writer.writerow(row_out + [availability])
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


def process_locations():
    """
    Process the latest prodiver_locations and external_ids log files.
    """
    # read zip map
    zipmap = lib.read_zipmap()
    # read 'new' locations
    with open(path_raw + 'locations.ndjson', 'r') as f:
        new_locations = ndjson.load(f)
    for row in new_locations:
        # grab internal numeric id, or make one
        sid = 'uuid:%s' % row['id']
        if sid in eid_to_id:
            iid = eid_to_id[sid]
        else:
            iid = lib.hash(row['id'])
            eid_to_id[sid] = iid
        # set fields to None by default
        [uuid, name, provider, loctype, address, city, county,
         state, zip, lat, lng, tz] = [None] * 12
        # extract fields
        uuid = row['id']
        # TODO: if NOT there, then should look up?
        if 'name' in row and row['name'] is not None:
            name = row['name'].title()
        if 'provider' in row and row['provider'] is not None:
            provider = row['provider'].lower()
            if provider == 'rite_aid':
                provider = 'riteaid'
        if 'location_type' in row and row['location_type'] is not None:
            loctype = row['location_type'].lower()
        if 'city' in row and row['city'] is not None:
            city = row['city'].title()
        if 'county' in row and row['county'] is not None:
            county = row['county'].title()
        if 'state' in row and row['state'] is not None:
            state = row['state'].upper()
        if 'postal_code' in row and row['postal_code'] is not None:
            # NOTE - this throws away information after first 5 digits
            zip = "%05d" % int(row['postal_code'][:5])
        # take county from VS zipmap
        if zip is not None and county is None and zip in zipmap:
            county = zipmap[zip][2]
        # process addres
        if 'address_lines' in row and row['address_lines'] is not None:
            # NOTE - length is never larger than 1
            address = ','.join(row['address_lines'])
            # fix end on ,
            if address[-1] == ',':
                address = address[:-1]
        # fix address issue for some NJ listings
        if ', NJ' in address:
            address = address.split(', ')[0]
            if zip is not None:
                city = zipmap[zip][1]
            # still has city in the address..
        # extract local timezone
        if 'time_zone' in row and row['time_zone'] is not None:
            timezone = row['time_zone']
        elif zip is not None:
            zip = "%05d" % int(row['postal_code'][:5])
            timezone = zipmap[zip][0]
        elif state is not None:
            timezone = us.states.lookup(row['state']).time_zones[0]
        # extract position
        if ('position' in row and row['position'] is not None):
            # original format was dictionary
            if type(row['position']) == dict:
                if 'latitude' in row['position']:
                    lat = row['position']['latitude']
                if 'longitude' in row['position']:
                    lng = row['position']['longitude']
            # else, assume WKB hex
            else:
                (lng, lat) = wkb.loads(bytes.fromhex(row['position'])).coords[0]
        # insert row
        locations[iid] = {
            'uuid': uuid,
            'name': name,
            'provider': provider,
            'type': loctype,
            'address': address,
            'city': city,
            'county': county,
            'state': state,
            'zip': zip,
            'lat': lat,
            'lng': lng,
            'timezone': timezone
        }

    # read 'new'  external_id to uuid mapping
    with open(path_raw + 'external_ids.ndjson', 'r') as f:
        eid_to_uuid = {}
        for x in ndjson.load(f):
            eid_to_uuid['%s:%s' % (x['system'], x['value'])] = x['provider_location_id']
    # insert into external_id to iid mapping
    for eid, uuid in eid_to_uuid.items():
        uuid = 'uuid:' + uuid
        eid = lib.scrub_external_ids([eid])[0]
        if uuid not in eid_to_id:
            print("[WARN] uuid %s not in eid_to_id" % uuid)
            continue
        eid_to_id[eid] = eid_to_id[uuid]
    # write updated location files
    lib.write_locations(locations, path_out + 'univaf_locations.csv')
    lib.write_external_ids(eid_to_id, path_out + 'univaf_ids.csv')


if __name__ == "__main__":
    # read arguments
    parser = argparse.ArgumentParser()
    parser.add_argument('-s', '--start_date', help="first date to process")
    parser.add_argument('-e', '--end_date', help="last date to process")
    parser.add_argument('-a', '--slots', action='store_true', help="do slot-level data")
    args = parser.parse_args()
    # parse dates
    dates = lib.parse_date(parser)
    print("[INFO] doing these dates WITH%s slots: [%s]" %
          ('' if args.slots else 'OUT', ', '.join(dates)))
    # process latest locations file
    process_locations()
    # iterate over days
    for date in dates:
        do_date(date, args.slots)
