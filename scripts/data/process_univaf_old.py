#
# Script to process USDR's univaf appointment availability data.
# It processes scraped data by date, iterating over a date-range.
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
#
# Usage:
#
#   python process_univaf_old.py [-h] [-s START_DATE] [-e END_DATE] [-c] [-a]
#
#
# Produces:
#
#   univaf_locations.csv - (id, uuid, name, provider, type, address, city,
#                           county, state, zip, lat, lng, timezone)
#   univaf_ids.csv - (external_id, id)
#   univaf_old_avs_{DATE}.csv - (id, checked_time, availability)
#   univaf_old_slots_{DATE}.csv - (id, checked_time, slot_time, availability)
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
# internal
import lib
from process_univaf_logs import process_locations


# set paths
path_raw = lib.path_root + 'data/univaf_old_raw/'
path_out = lib.path_root + 'data/univaf_old_clean/'

locations = {}
eid_to_id = {}


#@profile  # for profiling
def do_date(ds, slots=False):
    """
    Process a single date.
    """
    print("[INFO] doing %s WITH%s slots" % (ds, '' if slots else 'OUT'))
    # open output file
    fn_out = "%sunivaf_old_avs_%s%s.csv" % (path_out, 'slots_' if slots else '', ds)
    f_avs = open(fn_out, 'w')
    writer = csv.writer(f_avs, delimiter=',', quoting=csv.QUOTE_MINIMAL)
    n_avs = 0
    # construct list of files to read
    files = sorted(glob.glob('%slocations_%s_*' % (path_raw, ''.join(ds.split('-')))))

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
                # skip if no availability data
                if 'availability' not in row or row['availability'] is None:
                    continue

                # look up the location
                # convert main id, depending on API version
                if lib.is_uuid(row['id']):
                    sid = 'uuid:%s' % row['id']
                else:
                    sid = 'univaf_v0:%s' % row['id']
                iid = int(eid_to_id[sid])
                if iid not in locations:
                    print('[WARNING] id %d not in the dictionary...' % iid)
                    continue
                loc = locations[iid]

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

    # close availabilities file
    f_avs.close()
    print("[INFO]   wrote %d availability records to %s" % (n_avs, fn_out))


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
