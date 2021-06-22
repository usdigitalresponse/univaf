#
# Script to scrape USDR's "univaf" API as store as plain json.
#
# Usage:
#
#   python scrape_univaf_old.py
#
# cron job for hourly pull:
#
#   0 * * * * python3 /home/overgoor/usdr/scrape_univaf_old.py
#
# Authors:
#
#   Jan Overgoor - jsovergoor@usdigitalresponse.org
#

from time import time
from datetime import datetime
# internal
import lib

# current time as yyyymmdd_hhmmss
ts = datetime.utcfromtimestamp(time()).strftime('%Y%m%d_%H%M%S')
api_endpoint = 'http://getmyvax.org/locations?external_id_format=v2'
fn_out = '%s/data/univaf_old_raw/locations_%s.json' % (lib.path_root, ts)
lib.download_json_remotely(api_endpoint, fn_out)
