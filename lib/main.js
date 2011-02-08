const {Cc,Ci} = require("chrome");
const widgets = require("widget");
const tabs = require("tabs");
const data = require("self").data;
const panel = require("panel");
const notifications = require("notifications");
// const prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService);
const prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
const P = require("simple-storage"); // P == persistent
if (!P.storage.settings) P.storage.settings = [];

//const proxySetting = {
//	"Disable" : function () {
//		prefs.setIntPref("network.proxy.type", 0);
//	},
//	"Local SOCKS" : function () {
//		prefs.setIntPref("network.proxy.type", 1);
//		prefs.setCharPref("network.proxy.socks", "localhost");
//		prefs.setIntPref("network.proxy.socks_port", 8081);
//	},
//	"ArrogationLocal" : function () {
//		prefs.setIntPref("network.proxy.type", 1);
//		prefs.setCharPref("network.proxy.http", "localhost");
//		prefs.setIntPref("network.proxy.http_port", 5432);
//	},
//};

function reset () {
	["http", "ssl", "ftp", "gopher", "socks"].forEach(function (p) {
		prefs.setCharPref("network.proxy."+p, "");
		prefs.setIntPref("network.proxy."+p+"_port", 0);
	});
}

function openSetting (index) {
	var setting = typeof index == 'undefined' ? null : P.storage.settings[index];

	var settingPanel = panel.Panel({
		width: 550,
		height: 550,
		contentURL : data.url("setting.html"),
		contentScriptWhen : "ready",
		contentScript : (function () {
			document.getElementsByTagName('h1')[0].appendChild(document.createTextNode(name));
			on('message', function (message) {
				({
					fill : function () {
						if (message.data) {
							var inputs = document.getElementsByTagName('input');
							for (var i = 0, it; it = inputs[i]; i++) {
								if (!it.name) continue;
								if (it.type == "checkbox") {
									it.checked = !!message.data[it.name];
								} else
								if (it.type == "radio") {
									it.checkbox == (it.value == message.data[it.name]);
								} else {
									it.value = message.data[it.name];
								}
							}
							document.querySelector('input[name=name]').focus();
						} else {
							document.getElementById('delete').style.display = 'none';
						}
					},
				})[message.type].call(this);
			});

			document.getElementById('save').addEventListener('click', function (e) {
				var data = {};
				var inputs = document.getElementsByTagName('input');
				for (var i = 0, it; it = inputs[i]; i++) {
					if (!it.name) continue;
					if (it.type == "checkbox") {
						data[it.name] == it.checked;
					} else
					if (it.type == "radio") {
						if (it.checked) data[it.name] = +it.value;
					} else {
						if (/_port$/.test(it.name)) {
							data[it.name] = +it.value;
						} else {
							data[it.name] = it.value;
						}
					}
				}

				if (!data.name) {
					document.querySelector('input[name=name]').focus();
				} else {
					postMessage({ type : 'save', data : data });
				}
			}, false);

			document.getElementById('delete').addEventListener('click', function (e) {
				postMessage({ type : 'delete' });
			}, false);

			postMessage({ type : 'ready' });
		}).toSource() + '()',

		onMessage: function (message) {
			console.log(message.type);
			({
				ready : function () {
					this.postMessage({ type: 'fill', data : setting });
				},

				save : function () {
					var settings = P.storage.settings;
					if (setting) {
						settings[index] = message.data;
					} else {
						settings.push(message.data);
					}
					P.storage.settings = settings;
					notifications.notify({
						title : 'Many Proxies Swithcer',
						text : "Saved proxy setting: " + message.data.name,
					});
					this.hide();
				},
				'delete' : function () {
					var settings = P.storage.settings;
					if (setting) {
						settings.splice(index, 1);
					} else {
					}
					P.storage.settings = settings;
					this.hide();
				},
			})[message.type].call(this);
		}
	});
	settingPanel.show();
}

var widget = widgets.Widget({
	label      : "Many Proxies Switcher",
	contentURL : data.url("icon.png"),
	width      : 16,
	panel      : panel.Panel({
		width: 240,
		height: 320,
		contentURL: data.url("list.html"),
		contentScriptWhen: "ready",

		contentScriptFile : [ data.url("createElementFromString.js") ],
		contentScript : (function () {
			var tmpl = document.getElementById('list-item').text;
			var cont = document.getElementById('select');

			on('message', function (message) {
				({
					setting : function () {
						cont.innerHTML = "";

						var e = createElementFromString(tmpl, {
							data: { name : 'Disable' }
						});
						cont.appendChild(e);
						e.addEventListener('click', function (e) {
							postMessage({ type : 'change', index : -1 });
						}, false);
						e.edit.parentNode.removeChild(e.edit);

						for (var i = 0, it; it = message.names[i]; i++) (function (name, index) {
							var e = createElementFromString(tmpl, {
								data: { name : name }
							});
							cont.appendChild(e);
							e.addEventListener('click', function (e) {
								postMessage({ type : 'change', index : index });
							}, false);

							e.edit.addEventListener('click', function (e) {
								e.stopPropagation();
								e.preventDefault();
								postMessage({ type : 'edit', index : index });
							}, false);
						})(it.name, it.index);
						postMessage({ type : 'resize', height: document.documentElement.offsetHeight });
					}
				})[message.type].call(this);
			});

			document.getElementById('add').addEventListener('click', function (e) {
				postMessage({ type: 'add' });
			}, false);

			postMessage({ type : 'ready' });
		}).toSource() + '()',

		onShow : function () {
			console.log('onshow');
			var names = [];
			var settings = P.storage.settings;
			for (var i = 0, len = settings.length; i < len; i++) {
				names.push({
					index : i,
					name  : settings[i].name
				});
			}
			this.postMessage({ type : 'setting', names : names });
		},

		onMessage: function (message) {
			console.log(message.type);
			({
				ready : function () {
				},
				resize : function () {
					this.resize(240, message.height);
				},
				change : function () {
					this.hide();

					reset();
					if (message.index >= 0) {
						var setting = P.storage.settings[message.index];
						console.log('set:' + setting.name);

						prefs.setIntPref("network.proxy.type", 1);
						for (var key in setting) if (setting.hasOwnProperty(key)) {
							if (!/^network.proxy/.test(key)) continue;
							var val = setting[key];
							console.log('setting: ' + key + ' to: ' + val);
							if (typeof val == "boolean") {
								prefs.setBoolPref(key, val);
							} else
							if (typeof val == "number") {
								prefs.setIntPref(key, val);
							} else {
								prefs.setCharPref(key, val);
							}
						}

						notifications.notify({
							title : 'Many Proxies Swithcer',
							text : "Changed proxy setting: " + setting.name,
						});
					} else {
						prefs.setIntPref("network.proxy.type", Math.abs(message.index) - 1);
						notifications.notify({
							title : 'Many Proxies Swithcer',
							text : "Changed proxy setting",
						});
					}
				},
				edit : function () {
					this.hide();
					openSetting(message.index);
				},
				add : function () {
					this.hide();
					openSetting();
				},
			})[message.type].call(this);
		}
	}),
});

