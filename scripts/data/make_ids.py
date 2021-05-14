#
# Script to construct a mapping from all known id's (including both
# UUID's and external id's) to integer id's,
#
#
# Usage:
#
#   python make_ids.py
#
#
# Authors:
#
#   Jan Overgoor - jsovergoor@usdigitalresponse.org
#

import json
import os
import csv
import lib


# set paths
path_raw = lib.path_root + 'data/univaf_raw/'
path_out = lib.path_root + 'data/univaf_clean/'

# read last file
fn = sorted(os.listdir(path_raw))[-1]
with open(path_raw + fn) as f:
    data_raw = json.load(f)

# get unique UUID's
uuids = set()
for row in data_raw:
    if lib.is_uuid(row['id']):
        uuids.add(row['id'])
uuids = list(uuids)

# assign numeric id's
uuid_to_int = dict([(uuids[i], i + 1) for i in range(len(uuids))])

# write out 'int_id to uuid' map
with open(path_out + 'ids_uuid.csv', 'w') as f:
    writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL)
    sink = writer.writerow(['id', 'uuid'])
    int_to_uuid = []
    for k, v in uuid_to_int.items():
        int_to_uuid.append((v, k))
    int_to_uuid.sort()
    for i in int_to_uuid:
        sink = writer.writerow(i)

# construct 'external_id to int_id' map
with open(path_out + 'ids_external.csv', 'w') as f:
    writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL)
    sink = writer.writerow(['external_id', 'id'])
    for row in data_raw:
        uuid = row['id']
        id = uuid_to_int[uuid]
        sink = writer.writerow(("uuid:%s" % uuid, id))
        for k, v in row['external_ids'].items():
            sink = writer.writerow(("%s:%s" % (k, v), id))
