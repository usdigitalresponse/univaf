#
# Miscelaneous helper code imported by more than one script.
#
#
# Authors:
#
#   Jan Overgoor - jsovergoor@usdigitalresponse.org
#

import os
import csv
import json
import datetime
import dateutil
import urllib.request
from uuid import UUID


#path_root = '/home/overgoor/usdr/'  # Stanford SOAL server
path_root = '/tmp/af/'  # local


def read_locations(locations_path):
    """
    Read the pre-existing locations file, if it already exists.
    """
    locations = {}
    if os.path.exists(locations_path):
        with open(locations_path, 'r') as f:
            reader = csv.DictReader(f, delimiter=',')
            for row in reader:
                iid = int(row['id'])
                locations[iid] = row
                del locations[iid]['id']  # remove the 'id' field itself
        print("[INFO] read %d locations from %s" % (len(locations), locations_path))
    return locations


def write_locations(locations, locations_path):
    """
    Write the new locations file.
    """
    header = ['id', 'uuid', 'name', 'provider', 'type',
              'address', 'city', 'county', 'state', 'zip', 'lat', 'lng']
    with open(locations_path, 'w') as f:
        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL)
        sink = writer.writerow(header)
        for id in sorted(locations.keys()):
            row = [id] + [locations[id][key] for key in header[1:]]
            sink = writer.writerow(row)
    print("[INFO] wrote %d locations to %s" % (len(locations), locations_path))


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
    print("[INFO] doing these dates: [%s]" % ', '.join(dates))
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
    with open(path, 'w') as f:
        f.write(json.dumps(data, indent=2))


def intersect(list1, list2):
    return list(set(list1) & set(list2))


def pp(s):
    """
    Pretty print JSON string.
    """
    return json.dumps(s, indent=4)
