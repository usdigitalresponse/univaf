#
# Miscelaneous helper code imported by more than one script.
#
#
# Authors:
#
#   Jan Overgoor - jsovergoor@usdigitalresponse.org
#

import csv
import datetime
import dateutil
import hashlib
import json
import os
import pandas as pd
import urllib.request
from urllib.parse import urljoin
from uuid import UUID

# root path of where the data lives
path_root = '/tmp/'


def read_external_ids(path):
    """
    Read the current external_id map file.
    """
    with open(path, 'r') as f:
        eid_to_id = dict(list(csv.reader(f)))
    # convert id's to int
    for (eid, id) in eid_to_id.items():
        eid_to_id[eid] = int(id)
    return eid_to_id


def scrub_external_ids(eids):
    """
    Removes the index from "univaf_v.[_.]" keys.
    """
    for i in range(len(eids)):
        if 'univaf' not in eids[i]:
            continue
        if 'v' not in eids[i].split(':')[0].split('_')[-1]:
            # very risky! assumes keys to be "univaf.v._.:.*"
            eids[i] = eids[i][:9] + eids[i][11:]
    return eids


def read_locations(path):
    """
    Read the pre-existing locations file, if it already exists.
    """
    locations = {}
    if os.path.exists(path):
        with open(path, 'r') as f:
            reader = csv.DictReader(f, delimiter=',')
            for row in reader:
                iid = int(row['id'])
                locations[iid] = row
                del locations[iid]['id']  # remove the 'id' field itself
        print("[INFO] read %d locations from %s" % (len(locations), path))
    return locations


def write_locations(locations, path):
    """
    Write the new locations file.
    """
    header = ['id', 'uuid', 'name', 'provider', 'type',
              'address', 'city', 'county', 'state', 'zip', 'lat', 'lng',
              'timezone']
    with open(path, 'w') as f:
        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL)
        sink = writer.writerow(header)
        for id in sorted(locations.keys()):
            row = [id] + [locations[id][key] if key in locations[id] else '' for key in header[1:]]
            sink = writer.writerow(row)
    print("[INFO] wrote %d locations to %s" % (len(locations), path))


def write_external_ids(eid_to_id, path):
    """
    Write the new external_ids file.
    """
    header = ['eid', 'iid']
    with open(path, 'w') as f:
        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL)
        sink = writer.writerow(header)
        for x in sorted(eid_to_id.items()):
            sink = writer.writerow(x)


def read_previous_state(path_raw, ds, source):
    """
    Read a previous state, if it exists
    """
    if source not in ['avs', 'slots']:
        print("[ERROR] source should be one of ['avs', 'slots']")
        return Exception
    fn = '%sstate_%s_%s.json' % (path_raw, ds, source)
    if os.path.exists(fn):
        with open(fn, 'r') as f:
            state = json.load(f)
        # convert keys back to int
        state = {int(k): v for k, v in state.items()}
        if source == 'slots':
            # remove slots more than 1 day before today from the record
            ds2 = add_days(ds, -1)
            for iid, v in state.items():
                for slot_time in list(v.keys()):
                    if slot_time[:10] < ds2:
                        del state[iid][slot_time]
                    else:
                        # cut-off deprecated field from before 
                        state[iid][slot_time] = state[iid][slot_time][:3]
        return state
    else:
        return {}


def aggregate_slots(path_in, fn_out):
    """
    Aggregate slot records over multiple days.
    """
    print("[INFO] aggregating slots")
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


def read_zipmap():
    """
    Read map of zipcodes to timezones.
    """
    zipmap = {}
    with open('vaccinespotter-zipdump.csv', 'r') as f:
        reader = csv.DictReader(f, delimiter=',')
        for row in reader:
            zipmap[row['postal_code']] = (row['time_zone'], row['city'], row['county_name'])
    return zipmap


def parse_date(parser):
    """
    Parse date range from the command line parameters.
    """
    args = parser.parse_args()
    # parse start_date
    if args.start_date is None:
        parser.print_help()
        exit()
    else:
        try:
            start_date = dateutil.parser.parse(args.start_date)
        except Exception as e:
            print("[ERROR] can't parse start_date %s, should be yyyy-mm-dd" %
                  args.start_date)
            exit()
    # parse end_date
    if args.end_date is None:
        end_date = start_date
    else:
        try:
            end_date = dateutil.parser.parse(args.end_date)
        except Exception as e:
            print("[ERROR] can't parse end_date %s, should be yyyy-mm-dd" %
                  args.end_date)
            exit()
    # make date range
    n = (end_date - start_date).days + 1
    dates = [start_date + datetime.timedelta(days=x) for x in range(n)]
    dates = sorted([x.strftime("%Y-%m-%d") for x in dates])
    if len(dates) < 1:
        print("[ERROR] date range has no elements")
        exit()
    return dates


# inspired by https://stackoverflow.com/a/33245493
def is_uuid(s, version=4):
    if not isinstance(s, str):
        return False
    if len(s) != 36:
        return False
    try:
        uuid_obj = UUID(s, version=version)
    except ValueError:
        return False
    return str(uuid_obj) == s


def download_json_remotely(url, path):
    """
    Download a json file from the internet.
    """
    with urllib.request.urlopen(url) as r:
        data = json.loads(r.read().decode())
    # deal with pagination
    while "__next__" in data[-1]:
        url = urljoin('http://getmyvax.org', data[-1]['__next__'])
        with urllib.request.urlopen(url) as r:
            data2 = json.loads(r.read().decode())
        data = data[:-1] + data2
    with open(path, 'w') as f:
        f.write(json.dumps(data, indent=2))


def intersect(list1, list2):
    return list(set(list1) & set(list2))


def pp(s):
    """
    Pretty print JSON string.
    """
    return json.dumps(s, indent=4)


def hash(s, digits=8):
    """
    Creates a (non-unique) int for a string.
    https://stackoverflow.com/a/16008760
    """
    return int(hashlib.sha1(s.encode("utf-8")).hexdigest(), 16) % (10 ** digits)


def add_days(ds, days=1):
    """
    Add a number of days to a date string.
    """
    next_day = datetime.datetime.strptime(ds, "%Y-%m-%d")
    next_day = next_day + datetime.timedelta(days=days)
    return next_day.strftime("%Y-%m-%d")
