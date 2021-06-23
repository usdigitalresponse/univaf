#
# Script to process USDR's univaf appointment availability data.
# There are two possible data sources:
# 1. --mode old processes locally stored copies of the \locations
#    API, downloaded with scrape_univaf_old.py
# 2. --mode new processes change logs from the S3 folder, which can
#    be locally downloaded with scrape_univaf_new.py
# It processes scraped data by date, iterating over a date-range,
# and writes out both general and slot-level availability data.
#
# We maintain an internal locations database to map the long UUID's
# to small numeric ids. Every time this script runs, it reprocesses
# the locations database.
#
# NOTE: for the availability data checked_time is in UTC.
#       for the slot data, both checked_time and slot_time are in local time.
# TODO: should not write open records at end of day, now that we load state?
#
# Usage:
#
#   python process_univaf.py [-h] [-m new|old] [-s START_DATE] [-e END_DATE]
#
# Produces:
#
#   locations.csv    - (id, uuid, name, provider, type, address, city,
#                       county, state, zip, lat, lng, timezone)
#   ids.csv          - (external_id, id)
#   avs_{DATE}.csv   - (id, first_checked_time, last_checked_time,
#                       offset, availability)
#   slots_{DATE}.csv - (id, slot_time, first_checked_time, last_checked_time,
#                       offset, availability)
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
import json
import datetime
import dateutil.parser
import argparse
import us
import pytz
import pandas as pd
from glob import glob
from shapely import wkb
# internal
import lib

# set global variables
mode = ''
path_raw = ''
path_out = ''
locations = {}
eid_to_id = {}
avs = {}    # { id : [ts_first, ts_last, offset, available] }
slots = {}  # { id : { ts_slot : [ts_first, ts_last, offset, available] }}


#@profile  # for profiling
def do_date(ds):
    """
    Process a single date.
    """
    global avs, slots
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

    # read previous state, if exists
    fn_state_avs = path_raw + 'state_%s_avs.json' % ds
    if os.path.exists(fn_state_avs):
        with open(fn_state_avs, 'r') as f:
            avs = json.load(f)
    fn_state_slots = path_raw + 'state_%s_slots.json' % ds
    if os.path.exists(fn_state_slots):
        with open(fn_state_slots, 'r') as f:
            slots = json.load(f)

    # construct list of files to read
    if mode == 'new':
        files = sorted(glob('%savailability_log-%s.ndjson' % (path_raw, ds)))
    elif mode == 'old':
        files = sorted(glob('%slocations_%s_*' % (path_raw, ''.join(ds.split('-')))))

    for fn in files:

        print("[INFO]   reading " + fn)
        f = open(fn, 'r')
        if mode == 'new':
            records = ndjson.reader(f)
        elif mode == 'old':
            records = json.load(f)

        for row in records:
            try:

                # align old and new schemas
                if mode == 'new':
                    # only process rows that have a (new) valid_at field
                    if "valid_at" not in row:
                        continue
                elif mode == 'old':
                    # deal with (now deprecated) pagination
                    if '__next__' in row:
                        continue
                    # skip if no availability data
                    if 'availability' not in row or row['availability'] is None:
                        continue
                    # rename and move fields up level
                    row['location_id'] = row['id']
                    for k, v in row['availability'].items():
                        row[k] = v

                # look up the location
                if 'uuid:%s' % row['location_id'] in eid_to_id:
                    sid = 'uuid:%s' % row['location_id']
                elif 'univaf_v1:%s' % row['location_id'] in eid_to_id:
                    sid = 'univaf_v1:%s' % row['location_id']
                elif 'univaf_v0:%s' % row['location_id'] in eid_to_id:
                    sid = 'univaf_v0:%s' % row['location_id']
                else:
                    print('[WARN]     id %s not in the dictionary...' % row['location_id'])
                    continue
                iid = int(eid_to_id[sid])
                loc = locations[iid]

                # skip new locations without change as we don't know their prior state
                if iid not in avs and ("available" not in row or row['available'] is None):
                    continue

                # parse checked_time and convert to UTC if not already
                t = row['valid_at']
                if t[-5:] == '00:00' or t[-1] == 'Z':
                    check_time_utc = datetime.datetime.strptime(t[:19], "%Y-%m-%dT%H:%M:%S")
                else:
                    check_time_utc = dateutil.parser.parse(t).astimezone(pytz.timezone('UTC'))
                check_time_local = check_time_utc.astimezone(pytz.timezone(loc['timezone']))
                offset = int(check_time_local.utcoffset().total_seconds() / (60 * 60))
                check_time = check_time_utc.strftime("%Y-%m-%d %H:%M:%S")  # in UTC

                # if nothing new, just update the last time
                if "available" not in row or row['available'] is None:
                    avs[iid][1] = check_time
                    # update each slot time
                    if iid in slots:
                        for ts in slots[iid].keys():
                            slots[iid][ts][1] = check_time
                    continue

                # compute regular availability count
                availability = None
                if row['available'] in ['YES', 'yes']:
                    if 'available_count' in row:
                        availability = row['available_count']
                    elif ('capacity' in row and row['capacity'] is not None and
                          row['capacity'][0]['available'] not in ['YES','NO']):
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
                if 'slots' in row and row['slots'] is not None:
                    # create a new row if the location is new
                    if iid not in slots:
                        slots[iid] = {}
                    for slot in row['slots']:
                        # compute local offset and UTC time for slot time
                        slot_time_local = datetime.datetime.fromisoformat(slot['start'])
                        slot_time_offset = int(slot_time_local.utcoffset().total_seconds() / (60 * 60))
                        slot_time_utc = slot_time_local.astimezone(pytz.timezone('UTC'))
                        slot_time = slot_time_utc.strftime("%Y-%m-%d %H:%M")  # in UTC
                        availability = 1 if slot['available'] == 'YES' else 0
                        # if slot time didn't exist, create
                        if slot_time not in slots[iid]:
                            slots[iid][slot_time] = [check_time, check_time, offset, availability]
                        # if new row but availability didn't change, just update time
                        if availability == slots[iid][slot_time][3]:
                            slots[iid][slot_time][1] = check_time
                        # else, write old row and update new row
                        else:
                            writer_avs.writerow([iid] + slots[iid][slot_time])
                            n_slots += 1
                            slots[iid][slot_time] = [check_time, check_time, offset, availability]

            except Exception as e:
                print("[ERROR] ", sys.exc_info())
                traceback.print_exc()
                print("Problem data: ")
                print(lib.pp(row))
                exit()
        f.close()

    # write unclosed records
    for iid, row in avs.items():
        writer_avs.writerow([iid] + row)
        n_avs += 1
    for iid, tmp_row in slots.items():
        for slot_time, row in tmp_row.items():
            writer_slots.writerow([iid, slot_time] + row)
            n_slots += 1

    # close files
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


def process_locations(path_out):
    """
    Process the latest prodiver_locations and external_ids log files.
    """
    # read zip map
    zipmap = lib.read_zipmap()
    # read 'new' locations
    with open('%sdata/univaf_new_raw/locations.ndjson' % lib.path_root, 'r') as f:
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

    # read 'new' external_id to uuid mapping
    with open('%sdata/univaf_new_raw/external_ids.ndjson' % lib.path_root, 'r') as f:
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
    lib.write_locations(locations, path_out + 'locations.csv')
    lib.write_external_ids(eid_to_id, path_out + 'ids.csv')
    return (locations, eid_to_id)


def aggregate_slots():
    """
    Aggregate slot records over multiple days.
    """
    print("[INFO]   aggregating slots")
    path_in = '%sdata/univaf_%s_clean/' % (lib.path_root, mode)
    fn_out = '%sdata/clean/univaf_slots_%s.csv' % (lib.path_root, mode)
    # read individual files
    fns = glob(path_in + "slots*.csv")
    li = [pd.read_csv(x, dtype={'checked_time': str, 'slot_time': str},
                         names=['id', 'slot_time', 'first_check', 'last_check',
                                'offset', 'available']) for x in fns]
    DF = pd.concat(li, axis=0, ignore_index=True)
    print("[INFO]   read %d records from %s" % (DF.shape[0], path_in))
    # group by slot_time
    DF = (DF.groupby(['id', 'slot_time', 'offset'])
            .agg(first_check=('first_check', min),
                 last_check=('last_check', max),
                 available=('available', max))
            .reset_index())
    # parse time stamps and integrate offset
    DF['slot_time'] = read_timestamp(DF.slot_time, offset=DF.offset)
    DF['first_check'] = read_timestamp(DF.first_check, offset=DF.offset)
    DF['last_check'] = read_timestamp(DF.last_check, offset=DF.offset)
    # compute hod and dow
    DF = (DF.assign(hod=DF.slot_time.dt.hour,
                    dow=DF.slot_time.dt.dayofweek)
            [['id', 'slot_time', 'hod', 'dow', 'first_check', 'last_check']])
    # write out
    DF.to_csv(fn_out, index=False, header=False, date_format="%Y-%m-%d %H:%M")
    print("[INFO]   wrote %d records to %s" % (DF.shape[0], fn_out))


def read_timestamp(string, offset=None):
    """
    Efficiently read a large column of time stamps and incorporate offset.
    """
    DF = pd.DataFrame(data={'string': string})
    DF[['ds', 'ts']] = DF.string.str[:16].str.split(' ', expand=True)
    DF[['h', 'm']] = DF.ts.str.split(':', expand=True)
    # dictionary lookup trick for efficient date parsing
    dates = {date: pd.to_datetime(date, format='%Y-%m-%d') for date in DF.ds.unique()}
    DF['out'] = (DF.ds.map(dates) +
                 pd.to_timedelta(DF.h.astype(int), unit='h') +
                 pd.to_timedelta(DF.m.astype(int), unit='m'))
    if offset is not None:
        DF['out'] += pd.to_timedelta(offset, unit='h')
    return DF.out


if __name__ == "__main__":
    # read arguments
    parser = argparse.ArgumentParser()
    parser.add_argument('-s', '--start_date', help="first date to process")
    parser.add_argument('-e', '--end_date', help="last date to process")
    parser.add_argument('-m', '--mode', help="do new or old data")
    args = parser.parse_args()
    # parse whether old or new data
    if args.mode not in ['old', 'new']:
        print("[ERROR] mode should be 'old' or 'new'")
        exit()
    mode = args.mode
    path_raw = lib.path_root + 'data/univaf_%s_raw/' % mode
    path_out = lib.path_root + 'data/univaf_%s_clean/' % mode
    # parse dates
    dates = lib.parse_date(parser)
    print("[INFO] doing these dates: [%s]" % ', '.join(dates))
    # process latest locations file
    (locations, eid_to_id) = process_locations(path_out)
    # iterate over days
    for date in dates:
        do_date(date)
    # aggregate slot data over multiple days
    aggregate_slots()
