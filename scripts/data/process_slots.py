#
# Script to aggregate event data of when slot availbility was checked,
# to construct ranges of time a slot was available for.
#
# NOTE: checked_time is in UTC and slot_time is in local time.
#
# Usage:
#
#   python process_slots.py [-h] [-s START_DATE] [-e END_DATE] [-m old|new]
#
# Produces:
#
#   slots_grouped_all.csv - (id, slot_time, n_observations, first_seen_time,
#                            last_seen_time, hour_of_day, day_of_week)
#
# Authors:
#
#   Jan Overgoor - jsovergoor@usdigitalresponse.org
#

import pandas as pd
from pytz import UTC
import argparse
import glob
import lib

# set path
main_path = ''


def lookup(date_pd_series, format=None):
    dates = {date:pd.to_datetime(date, format=format) for date in date_pd_series.unique()}
    return date_pd_series.map(dates)


#@profile  # for profiling
def do_date(ds):
    """
    Process a single date.
    """
    fn = "%sslots_%s.csv" % (main_path, ds)
    print("[INFO]   reading " + fn)
    # read data
    DF = pd.read_csv(fn,
                     #nrows=10000,
                     dtype={'checked_time': str, 'slot_time': str},
                     names=["id", "checked_time", "offset1",
                                  "slot_time", "offset2", "availability"])
    DF[['checked_time_ds', 'checked_time_ts']] = DF.checked_time.str[:16].str.split(' ', expand=True)
    DF[['checked_time_h', 'checked_time_m']] = DF.checked_time_ts.str.split(':', expand=True)
    DF[['checked_time']] = lookup(DF.checked_time_ds, format='%Y-%m-%d')
    DF[['checked_time']] = DF.checked_time + pd.to_timedelta(DF.checked_time_h.astype(int), unit='h') + pd.to_timedelta(DF.checked_time_m.astype(int), unit='m')
    DF[['slot_time_ds', 'slot_time_ts']] = DF.slot_time.str.split(' ', expand=True)
    DF[['slot_time_h', 'slot_time_m']] = DF.slot_time_ts.str.split(':', expand=True)
    DF[['slot_time']] = lookup(DF.slot_time_ds, format='%Y-%m-%d')
    DF[['slot_time']] = DF.slot_time + pd.to_timedelta(DF.slot_time_h.astype(int), unit='h') + pd.to_timedelta(DF.slot_time_m.astype(int), unit='m')

    # add offsets
    DF[['checked_time']] = DF.checked_time + pd.to_timedelta(DF.offset1.astype(int), unit='h')
    DF[['slot_time']] = DF.slot_time + pd.to_timedelta(DF.offset2.astype(int), unit='h')

    # add offsets and remove duplicates
    DF = (DF[['id', 'checked_time', 'slot_time']]
            .drop_duplicates()
            # group by id, slot_time to compute interval stats
            .groupby(['id', 'slot_time'])
            .agg(n_observations=('checked_time', len),
                 first_seen_time=('checked_time', min),
                 last_seen_time=('checked_time', max))
            .reset_index()
            .assign(slot_time=DF.slot_time.dt.tz_localize(UTC),
                    hour_of_day=DF.slot_time.dt.hour,
                    day_of_week=DF.slot_time.dt.dayofweek))
    # write to csv
    fn_out = "%sslots_grouped_%s.csv" % (main_path, ds)
    DF.to_csv(fn_out, index=False, header=False, date_format="%Y-%m-%d %H:%M")
    print("[INFO]   writing %s" % fn_out)


def join_all():
    """
    Join all dates together to deal with individual checked_dates
    """
    fn_out = main_path + 'slots_grouped_all.csv'
    # read individual files
    fns = glob.glob(main_path + "slots_grouped_2021*.csv")
    li = [pd.read_csv(x, header=None) for x in fns]
    DF = pd.concat(li, axis=0, ignore_index=True)
    DF.set_axis(['id', 'slot_time', 'n', 'min', 'max', 'hod', 'dow'],
                axis=1, inplace=True)
    print("[INFO]   read %d records" % DF.shape[0])
    # group by slot_time
    DF = (DF.groupby(['id', 'slot_time', 'hod', 'dow'])
            .agg(n=('n', sum), min=('min', min), max=('max', max))
            .reset_index())
    DF.to_csv(fn_out, index=False, header=False, date_format="%Y-%m-%d %H:%M")
    print("[INFO]   wrote %d records to %s" % (DF.shape[0], fn_out))


if __name__ == "__main__":
    # read arguments
    parser = argparse.ArgumentParser()
    parser.add_argument('-s', '--start_date', help="first date to process")
    parser.add_argument('-e', '--end_date', help="last date to process")
    parser.add_argument('-m', '--mode', help="do new or old data")
    args = parser.parse_args()
    # parse dates
    dates = lib.parse_date(parser)
    if args.m not in ['old', 'new']:
        print("[ERROR] mode should be 'old' or 'new'")
        exit()
    main_path = '%sdata/univaf_%s_clean/' % (lib.path_root, args.m)

    print("[INFO] doing these dates: [%s]" % ','.join(dates))
    # parse whether to keep previous locations
    for date in dates:
        do_date(date)
    # join all
    join_all()
