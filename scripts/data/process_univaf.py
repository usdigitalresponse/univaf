#
# Script to process USDR's univaf appointment availability data.
# It processes scraped data by date, iterating over a date-range.
#
# By default, it works off an internal location database and integrates new or
# updated entries accordingly. If --clean_run (-c) is enabled, it *first*
# processes the very last available file, to get the latest location
# information, and _then_ it runs through the dates from start to finish.
#
# By default, it does not process slot-level data, only the number of
# available appointments per day. If the --slots (-a) flag is enbled,
# if prints out slot-level availabilities (usually without counts).
#
# NOTE: Both checked_time and slot_time are in UTC
#
#
# Usage:
#
#   python process_univaf.py [-h] [-s START_DATE] [-e END_DATE] [-c] [-a]
#
#
# Produces:
#
#   locations_univaf.csv - (id, uuid, name, provider, type, address, city,
#                           county, state, zip, lat, lng, timezone)
#   ids_external - (external_id, id)
#   availabilities_{DATE}.csv - (id, checked_time, availability)
#   availabilities_slots_{DATE}.csv - (id, checked_time, slot_time, availability)
#
#
# Todo:
#
#   [ ] check duplicate locations
#   [ ] store individual slot availabilities?
#
#
# Authors:
#
#   Jan Overgoor - jsovergoor@usdigitalresponse.org
#

import json
import glob
import csv
import traceback
import sys
import datetime
import dateutil.parser
import argparse
import us
import pytz
import lib  # internal


# set paths
path_raw = lib.path_root + 'data/univaf_raw/'
path_out = lib.path_root + 'data/univaf_clean/'

locations = {}
eid_to_id = {}


#@profile  # for profiling
def do_date(ds, slots=False, dry_run=False):
    """
    Process a single date.
    If dry_run=True, it runs over the last available file to read loctaion
    information, without processing availability data
    """

    if dry_run:
        files = sorted(glob.glob(path_raw + 'locations*'))[-1:]
        print("[INFO] doing dry run on %s to seed location info" % files[0])
    else:
        print("[INFO] doing %s WITH%s slots" % (ds, '' if slots else 'OUT'))
        # open output file
        fn_out = "%savailabilities_%s%s.csv" % (path_out, 'slots_' if slots else '', ds)
        f_avs = open(fn_out, 'w')
        writer = csv.writer(f_avs, delimiter=',', quoting=csv.QUOTE_MINIMAL)
        n_avs = 0
        # construct list of files to read
        files = sorted(glob.glob('%slocations_%s_*' % (path_raw, ''.join(ds.split('-')))))

    # read zip map
    zipmap = lib.read_zipmap()

    # iterate over scraped data
    for fn in files:
        print("[INFO]   reading " + fn)
        with open(fn) as f:
            data_raw = json.load(f)
        for row in data_raw:
            try:
                # deal with (now deprecated) pagination
                if '__next__' in row:
                    continue

                # this very ugly logic disambiguates ids (like in this issue:
                # https://github.com/usdigitalresponse/appointment-availability-infra/issues/120)
                # convert main id, depending on API version
                if lib.is_uuid(row['id']):
                    sid = 'uuid:%s' % row['id']
                else:
                    sid = 'univaf_v0:%s' % row['id']
                if type(row['external_ids']) == dict:
                    # old external_ids format
                    eids = ["%s:%s" % x for x in row['external_ids'].items()]
                else:
                    # new external_ids format
                    # https://github.com/usdigitalresponse/appointment-availability-infra/issues/188
                    eids = ["%s:%s" % tuple(x) for x in row['external_ids']]
                ids = [sid] + lib.scrub_external_ids(eids)
                overlap = [x for x in ids if x in eid_to_id.keys()]
                # if there are new external_ids, add them to the dictionary
                if len(overlap) != len(ids):
                    # if haven't seen any before, make new integer id
                    if not len(overlap):
                        siid = lib.hash(row['id'])
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
                    [uuid, name, provider, loctype, address, city, county,
                     state, zip, lat, lng] = [None] * 11
                    # extract fields
                    if lib.is_uuid(row['id']):
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
                    # get lat,lng
                    if ('position' in row and row['position'] is not None and 'latitude' in row['position']):
                        lat = row['position']['latitude']
                    if ('position' in row and row['position'] is not None and 'longitude' in row['position']):
                        lng = row['position']['longitude']
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

                #
                # extract availability data
                #
                # skip if no availability data or if we're doing a dry run
                if dry_run or 'availability' not in row or row['availability'] is None:
                    continue
                # parse checked_time and convert to UTC if not already
                t = row['availability']['valid_at']
                if t[-5:] == '00:00'  or t[-1] == 'Z':
                    check_time_utc = datetime.datetime.strptime(t[:19], "%Y-%m-%dT%H:%M:%S")
                else:
                    check_time_utc = dateutil.parser.parse(t).astimezone(pytz.timezone('UTC'))
                # compute offset
                check_time_local = check_time_utc.astimezone(pytz.timezone(timezone))
                check_time_offset = int(check_time_local.utcoffset().total_seconds() / (60 * 60))
                # construct output row
                row_out = [iid,
                           check_time_utc.strftime("%Y-%m-%d %H:%M:%S"),
                           check_time_offset]

                if slots:
                    if 'slots' not in row['availability']:
                        continue
                    for slot in row['availability']['slots']:
                        # compute local offset and UTC time for slot time
                        slot_time_local = datetime.datetime.fromisoformat(slot['start'])
                        slot_time_offset = int(slot_time_local.utcoffset().total_seconds() / (60 * 60))
                        slot_time_utc = slot_time_local.astimezone(pytz.timezone('UTC'))
                        availability = 1 if slot['available'] == 'YES' else 0
                        # TODO: products?
                        writer.writerow(row_out + [
                                          slot_time_utc.strftime("%Y-%m-%d %H:%M"),
                                          slot_time_offset,
                                          availability])
                        n_avs += 1
                else:
                    availability = None
                    if row['availability']['available'] in ['YES', 'yes']:
                        if 'available_count' in row['availability']:
                            availability = row['availability']['available_count']
                        elif ('meta' in row['availability'] and
                              row['availability']['meta'] is not None and
                              'capacity' in row['availability']['meta']):
                            cap = row['availability']['meta']['capacity']
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
                    writer.writerow(row_out + [availability])
                    n_avs += 1
            except Exception as e:
                print("[ERROR] ", sys.exc_info())
                traceback.print_exc()
                print("Problem data: ")
                print(lib.pp(row))
                exit()

    if not dry_run:
        # close availabilities file
        f_avs.close()
        print("[INFO]   wrote %d availability records to %s" % (n_avs, fn_out))
    # write updated location files
    lib.write_locations(locations, path_out + 'locations_univaf.csv')
    lib.write_external_ids(eid_to_id, path_out + 'ids_external.csv')


if __name__ == "__main__":
    # read arguments
    parser = argparse.ArgumentParser()
    parser.add_argument('-s', '--start_date', help="first date to process")
    parser.add_argument('-e', '--end_date', help="last date to process")
    parser.add_argument('-c', '--clean_run', action='store_true',
                        help="replace previous locations file")
    parser.add_argument('-a', '--slots', action='store_true', help="do slot-level data")
    args = parser.parse_args()
    # parse dates
    dates = lib.parse_date(parser)
    print("[INFO] doing these dates WITH%s slots: [%s]" %
          ('' if args.slots else 'OUT', ', '.join(dates)))
    # parse whether to keep previous locations
    if args.clean_run:
        print("[INFO] clean_run=True, so starting from an empty location database")
        do_date("", dry_run=True)
    else:
        print("[INFO] clean_run=False, so keep previously collected location data")
        # read prior locations
        locations = lib.read_locations(path_out + 'locations_univaf.csv')
        # read prior external-id to numeric id mapping 
        eid_to_id = lib.read_external_ids(path_out + 'ids_external.csv')
    # iterate over days
    for date in dates:
        do_date(date, args.slots)
