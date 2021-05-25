#
# Script to scrape USDR's "univaf" API as store as plain json.
# A single run is currently about 36M large.
#
#
# Usage:
#
#   python scrape_univaf.py
#
#
# cron job for hourly pull:
#
#   0 * * * * python3 /home/overgoor/usdr/scrape_univaf.py
#
#
# Authors:
#
#   Jan Overgoor - jsovergoor@usdigitalresponse.org
#

from time import time
from datetime import datetime
import lib

# set path
#path = '/home/overgoor/usdr'  # Stanford SOAL server
path = '/tmp/af'  # local
# current time as yyyymmdd_hhmmss
ts = datetime.utcfromtimestamp(time()).strftime('%Y%m%d_%H%M%S')
api_endpoint = 'http://getmyvax.org/locations'
fn_out = '%s/data/univaf_raw/locations_%s.json' % (path, ts)
lib.download_json_remotely(api_endpoint, fn_out)
