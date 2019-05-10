#!/usr/bin/python3 -u
#	emmylog - Baby logger to determine sleep/wake cycle and time since last nursing
#	Copyright (C) 2019-2019 Johannes Bauer
#
#	This file is part of emmylog.
#
#	emmylog is free software; you can redistribute it and/or modify
#	it under the terms of the GNU General Public License as published by
#	the Free Software Foundation; this program is ONLY licensed under
#	version 3 of the License, later versions are explicitly excluded.
#
#	emmylog is distributed in the hope that it will be useful,
#	but WITHOUT ANY WARRANTY; without even the implied warranty of
#	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#	GNU General Public License for more details.
#
#	You should have received a copy of the GNU General Public License
#	along with emmylog; if not, write to the Free Software
#	Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
#
#	Johannes Bauer <JohannesBauer@gmx.de>

import sys
import cgi
import sqlite3
import contextlib
import json
import datetime
import pytz
import os

config = {
	"dbfile":	"/home/shared/emmymon/emmymon.sqlite3",
	"timezone":	"Europe/Berlin",
}

localzone = pytz.timezone(config["timezone"])
postdata = sys.stdin.read()
db = sqlite3.connect(config["dbfile"])
cursor = db.cursor()

with contextlib.suppress(sqlite3.OperationalError):
	cursor.execute("""CREATE TABLE events (
		eid integer PRIMARY KEY,
		source_ip varchar NOT NULL,
		created_utc TIMESTAMP NOT NULL,
		ts_utc TIMESTAMP NOT NULL,
		event varchar NOT NULL
	);""")

def respond(success, errcode, errtext, data = None):
	rsp_object = {
		"success": success,
		"errcode": errcode.lower(),
		"errtext": errtext,
	}
	if data is not None:
		rsp_object["data"] = data
	print(json.dumps(rsp_object))

def respond_error(errcode, errtext, data = None):
	respond(success = False, errcode = errcode, errtext = errtext, data = data)

def respond_success(errcode = "success", data = None):
	respond(success = True, errcode = errcode, errtext = "Success", data = data)

def fmt_ts(ts):
	return ts.strftime("%Y-%m-%dT%H:%M:%SZ")

print("Content-Type: application/json")
print()
try:
	postdata = json.loads(postdata)
except json.JSONDecodeError as e:
	respond_error(e.__class__.__name__, "Cannot read input data")
	sys.exit(0)

if not "action" in postdata:
	respond_error("noaction", "No action given")
	sys.exit(0)

action = postdata.get("action")
if action == "list":
	rows = cursor.execute("SELECT ts_utc, event FROM events ORDER BY ts_utc DESC LIMIT 30;").fetchall()
	data = [
		{
			"ts_utc": row[0],
			"event": row[1],
		} for row in rows
	]
	respond_success(data = data)
elif action == "add":
	utc_tz = pytz.timezone("UTC")
	now_utc = datetime.datetime.utcnow()
	if ("event" not in postdata) or (not isinstance(postdata["event"], str)):
		respond_error("missingdata", "No 'event' property present or not a string value")
		sys.exit(0)

	ts = postdata.get("ts")
	if (ts == "") or (ts is None):
		# Use current time
		ts_utc = now_utc
	else:
		# Try to parse local time
		try:
			ts = datetime.datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")
			ts = localzone.localize(ts)
			ts_utc = ts.astimezone(utc_tz)
		except ValueError as e:
			respond_error(e.__class__.__name__, "Cannot parse timestamp")
			sys.exit(0)

	source_ip = os.environ["REMOTE_ADDR"]

	cursor.execute("INSERT INTO events (source_ip, created_utc, ts_utc, event) VALUES (?, ?, ?, ?);", (source_ip, fmt_ts(now_utc), fmt_ts(ts_utc), postdata["event"]))
	db.commit()

	respond_success(errcode = "data_added")
else:
	response_error("unsupported_action", "Missing action or unsupported action requested.")
