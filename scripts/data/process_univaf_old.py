#
# Script to process USDR's univaf appointment availability data.
# These files can be downloaded locally with scrape_univaf_old.py
# It processes scraped data by date, iterating over a date-range,
# and writes out both general and slot-level availability data.
#
# We maintain an internal locations database to map the long UUID's
# to small numeric ids. Every time this script runs, it reprocesses
# the locations database.
#
# NOTE: Both checked_time and slot_time are in UTC
#
# Usage:
#
#   python process_univaf_old.py [-h] [-s START_DATE] [-e END_DATE]
#
# Produces:
#
#   locations.csv    - (id, uuid, name, provider, type, address, city,
#                       county, state, zip, lat, lng, timezone)
#   ids.csv          - (external_id, id)
#   avs_{DATE}.csv   - (id, checked_time, offset, availability)
#   slots_{DATE}.csv - (id, checked_time, offset, slot_time,
#                       offset, availability)
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
import pytz
# internal
import lib
from process_univaf_new import process_locations


# set paths
path_raw = lib.path_root + 'data/univaf_old_raw/'
path_out = lib.path_root + 'data/univaf_old_clean/'

locations = {}
eid_to_id = {}


#@profile  # for profiling
def do_date(ds):
    """
    Process a single date.
    """
    global locations
    global eid_to_id

    print("[INFO] doing %s" % ds)
    # open output files
    fn_avs = "%savs_%s.csv" % (path_out, ds)
    f_avs = open(fn_avs, 'w')
    writer_avs = csv.writer(f_avs, delimiter=',', quoting=csv.QUOTE_MINIMAL)
    n_avs = 0
    fn_slots = "%sslots_%s.csv" % (path_out, ds)
    f_slots = open(fn_slots, 'w')
    writer_slots = csv.writer(f_slots, delimiter=',', quoting=csv.QUOTE_MINIMAL)
    n_slots = 0
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
                row_av = row['availability']

                # look up the location
                # convert main id, depending on API version
                if lib.is_uuid(row['id']):
                    sid = 'uuid:%s' % row['id']
                else:
                    sid = 'univaf_v0:%s' % row['id']
                if sid not in eid_to_id:
                    print('[WARN]     id %s not in the dictionary...' % sid)
                    continue
                iid = int(eid_to_id[sid])
                loc = locations[iid]

                # parse checked_time and convert to UTC if not already
                t = row_av['valid_at']
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

                # do slots, if the data is there
                if 'slots' in row_av:
                    for slot in row_av['slots']:
                        # compute local offset and UTC time for slot time
                        slot_time_local = datetime.datetime.fromisoformat(slot['start'])
                        slot_time_offset = int(slot_time_local.utcoffset().total_seconds() / (60 * 60))
                        slot_time_utc = slot_time_local.astimezone(pytz.timezone('UTC'))
                        availability = 1 if slot['available'] == 'YES' else 0
                        writer_slots.writerow(row_out + [
                                                slot_time_utc.strftime("%Y-%m-%d %H:%M"),
                                                slot_time_offset,
                                                availability])
                        n_slots += 1

                # do regulare availability data
                availability = None
                if row_av['available'] in ['YES', 'yes']:
                    if 'available_count' in row_av:
                        availability = row_av['available_count']
                    elif ('meta' in row_av and row_av['meta'] is not None and
                          'capacity' in row_av['meta']):
                        cap = row_av['meta']['capacity']
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
                elif row_av['available'] in ['NO', 'no']:
                    availability = 0
                elif row_av['available'] == 'UNKNOWN':
                    availability = None
                else:
                    availability = None
                    raise Exception('No availability found...')
                writer_avs.writerow(row_out + [availability])
                n_avs += 1

            except Exception as e:
                print("[ERROR] ", sys.exc_info())
                traceback.print_exc()
                print("Problem data: ")
                print(lib.pp(row))
                exit()

    # close availabilities file
    f_avs.close()
    print("[INFO]   wrote %d availability records to %s" % (n_avs, fn_avs))
    print("[INFO]   wrote %d slot records to %s" % (n_slots, fn_slots))


if __name__ == "__main__":
    # read arguments
    parser = argparse.ArgumentParser()
    parser.add_argument('-s', '--start_date', help="first date to process")
    parser.add_argument('-e', '--end_date', help="last date to process")
    args = parser.parse_args()
    dates = lib.parse_date(parser)
    print("[INFO] doing these dates: [%s]" % ', '.join(dates))
    # process latest locations file
    (locations, eid_to_id) = process_locations(path_out)
    # iterate over days
    for date in dates:
        do_date(date)
