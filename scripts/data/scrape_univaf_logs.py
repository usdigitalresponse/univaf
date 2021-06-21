#
# Script to download the logs of USDR's "univaf" API.
# It downloads all the availability logs 
#
#
# Usage:
#
#   python scrape_univaf_logs.py
#
#
# cron job for daily pull:
#
#   0 12 * * * python3 /home/overgoor/usdr/scrape_univaf_logs.py
#
#
# Authors:
#
#   Jan Overgoor - jsovergoor@usdigitalresponse.org
#

import os
import urllib.request
import xml.etree.ElementTree as ET
import lib

# download the index
host = "http://univaf-data-snapshots.s3.amazonaws.com/"
index = []
external_ids = None
locations = None

with urllib.request.urlopen(host) as r:
    root = ET.fromstring(r.read())
    for child in root:
        if len(child) == 5:
            (type, file) = child[0].text.split('/')
            size = child[3].text
            if type == 'availability_log':
                index.append((type, file, size))
            if type == 'external_ids':
                external_ids = (type, file, size)
            if type == 'provider_locations':
                locations = (type, file, size)

index.append(external_ids)
index.append(locations)

for (type, file, size) in index:
    if type == 'external_ids':
        path_out = '%sdata/univaf_raw_new/external_ids.ndjson' % lib.path_root
    elif type == 'provider_locations':
        path_out = '%sdata/univaf_raw_new/locations.ndjson' % lib.path_root
    else:
        path_out = '%sdata/univaf_raw_new/%s' % (lib.path_root, file)
    if not os.path.exists(path_out) or type != 'availability_log':
        url = '%s%s/%s' % (host, type, file)
        size = int(size) * 1.0 / 1048000
        print("Writing %s to %s (size=%.1fMB)" % (url, path_out, size))
        with open(path_out, 'w') as f:
            for line in urllib.request.urlopen(url):
                f.write(line.decode('utf-8'))
