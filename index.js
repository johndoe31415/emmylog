/*
 *	emmylog - Baby logger to determine sleep/wake cycle and time since last nursing
	Copyright (C) 2019-2019 Johannes Bauer

	This file is part of emmylog.

	emmylog is free software; you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation; this program is ONLY licensed under
	version 3 of the License, later versions are explicitly excluded.

	emmylog is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with emmylog; if not, write to the Free Software
	Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA

	Johannes Bauer <JohannesBauer@gmx.de>
*/

function format_tdiff(secs) {
	secs = Math.round(secs);
	if (secs < 60) {
		return sprintf("%.0f Sek", secs)
	} else if (secs < 3600) {
		return sprintf("%.0f Min", secs / 60)
	} else if (secs < 86400) {
		return sprintf("%d:%02d Std:Min", secs / 3600, secs % 3600 / 60)
	} else {
		return sprintf("%d Tag und %d:%02d Std:Min", secs / 86400, secs % 86400 / 3600, secs % 86400 % 3600 / 60)
	}
}

function format_event(event) {
	return {
		"nurse_left":		"🤱 Stillen links",
		"nurse_right":		"🤱 Stillen rechts",
		"nurse_bottle":		"🍼 Flasche",
		"sleep":			"😴 Schlafen",
		"awake":			"⏰ Wach",
		"test":				"🧪  Test",
	}[event];
}

class EmmyLog {
	constructor(table, ts_input) {
		this._table = table;
		this._ts_input = ts_input;
		this._tbody = this._table.querySelector("tbody");
		this._query_uri = "query.py";
		this._table_data = null;
	}

	_execute(action, data, callback) {
		let post_data = {
			action: action,
		}
		if (data != null) {
			post_data = Object.assign({ }, post_data, data);
		}
		fetch(this._query_uri, {
			headers: {
				"Accept":			"application/json",
				"Content-Type":		"application/json",
			},
			method: "POST",
			body: JSON.stringify(post_data)
		}).then(function(response) {
			if (response.status == 200) {
				return response.text();
			}
		}).then(function(data) {
			data = JSON.parse(data);
			callback(data);
		});
	}

	_clear_table() {
		this._tbody.innerHTML = "";
	}

	_add_table_entry(entry, last_awake_ts, last_sleep_ts) {
		const ts = new Date(entry["ts_utc"]);

		const now = new Date();
		const tdiff = (now.getTime() - ts.getTime()) / 1000;

		const tr = document.createElement("tr");
		function append_cell(text, classes) {
			const td = document.createElement("td");
			td.innerHTML = text;
			for (const classname of classes) {
				td.classList.add(classname);
			}
			tr.append(td);
		}

		const classes = [ ];
		if (tdiff < 86400) {
			classes.push("last24hrs");
		}

		const weekday = {
			0:	"So",
			1:	"Mo",
			2:	"Di",
			3:	"Mi",
			4:	"Do",
			5:	"Fr",
			6:	"Sa",
		}[ts.getDay()];
		append_cell(sprintf("%s, %d.%d %d:%02d", weekday, ts.getDate(), ts.getMonth(), ts.getHours(), ts.getMinutes()), classes);

		append_cell("vor " + format_tdiff(tdiff), classes);

		let comment = null;
		if ((entry["event"] == "awake") && (last_sleep_ts != null)) {
			/* Now awake, how long did she sleep? */
			const tdiff = (ts.getTime() - last_sleep_ts.getTime()) / 1000;
			comment = format_tdiff(tdiff) + " geschlafen";
		} else if ((entry["event"] == "sleep") && (last_awake_ts != null)) {
			/* Now sleeping, how long was she awake? */
			const tdiff = (ts.getTime() - last_awake_ts.getTime()) / 1000;
			comment = format_tdiff(tdiff) + " wach";
		}
		let cell_text = format_event(entry["event"]);
		if (comment != null) {
			cell_text += " (" + comment + ")";
		}
		append_cell(cell_text, classes);

		if (this._tbody.childNodes.length == 0) {
			this._tbody.append(tr);
		} else {
			this._tbody.insertBefore(tr, this._tbody.childNodes[0]);
		}
	}

	display_table_data() {
		if (this._table_data == null) {
			return;
		}
		this._clear_table();
		let last_awake_ts = null;
		let last_sleep_ts = null;
		for (const entry of this._table_data) {
			this._add_table_entry(entry, last_awake_ts, last_sleep_ts);
			if (entry["event"] == "awake") {
				last_awake_ts = new Date(entry["ts_utc"]);
			} else if (entry["event"] == "sleep") {
				last_sleep_ts = new Date(entry["ts_utc"]);
			}
		}
	}

	_recv_data(data) {
		if (data["success"]) {
			this._table_data = data["data"];
			this.display_table_data();
		}
	}

	update() {
		this._execute("list", null, (data) => this._recv_data(data));
	}

	_add_event(eventname) {
		this._execute("add", {
			"event": eventname,
			"ts": this._ts_input.value,
		}, () => this.update());
	}

	btn_action(action) {
		if (action == "btn_wake") {
			this._add_event("awake");
		} else if (action == "btn_sleep") {
			this._add_event("sleep");
		} else if (action == "btn_nurse_left") {
			this._add_event("nurse_left");
		} else if (action == "btn_nurse_right") {
			this._add_event("nurse_right");
		} else if (action == "btn_nurse_bottle") {
			this._add_event("nurse_bottle");
		} else if (action == "btn_test") {
			this._add_event("test");
		} else {
			console.log("Unsupported action:", action);
		}
	}
}

const events_table = document.querySelector("#events");
const ts_input = document.querySelector("#timestamp");
const emmylog = new EmmyLog(events_table, ts_input);
emmylog.update();
setInterval(() => emmylog.update(), 300 * 1000);
document.querySelectorAll(".action_btn").forEach(function(node) {
	node.addEventListener("click", (event) => emmylog.btn_action(event.target.id));
});
