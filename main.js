"use strict";
const utils = require("@iobroker/adapter-core");
const axios = require("axios").default;

class Ecb1 extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "ecb1",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		this.on("unload", this.onUnload.bind(this));
		this.loopInterval = undefined;
	}

	async onReady() {
		this.log.info("Ecb1 Ip: " + this.config.ip);
		if (this.config.ip != "") {
			const all = (await axios.get("http://" + this.config.ip + "/api/v1/all")).data;
			const startstop = (await axios.get("http://" + this.config.ip + "/api/v1/chargecontrols/1/mode/eco/startstop")).data;
			this.log.info(JSON.stringify(all));
			await this.createStates("", all);
			await this.createStates(".chargecontrols.0", startstop);
			await this.setStatesEcb1("", all);
			await this.setStatesEcb1(".chargecontrols.0", startstop);
			this.loop();
		} else {
			this.log.error("Please set IP in config");
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			if (this.loopInterval)
				this.clearTimeout(this.loopInterval);
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (!state) return;
		/*if (!state.from.includes(this.namespace)) {
			if (this.loopInterval) this.clearTimeout(this.loopInterval);
			const elems = id.split(".").splice(2);
			//chargecontrols: id = stateid + 1
			if (elems[0] == "chargecontrols") elems[1] = "" + (parseInt(elems[1]) + 1);
			const url = "http://" + this.config.ip + "/api/v1/" + elems.reduce((p, c) => p + "/" + c);
			//prevent sync when updating state

			this.log.info(url + ":" + elems[elems.length - 1] + "=" + state.val);

			axios.put(url, elems[elems.length - 1] + "=" + state.val).then(() => {
				state.ack = true;
			}).catch(err => {
				this.log.error(err);
				state.ack = false;
			}).finally(() => {
				this.loopInterval = this.setTimeout(() => {
					this.loop();
				}, this.config.delayBetweenRequests);
			});
		}*/
		id = id.split(".").splice(2).reduce((p, c) => p + "." + c);
		switch (id) {
			case "chargecontrols.0.mode":
				axios.get("http://" + this.config.ip + "/?pvmode=" + state.val);
				state.ack = true;
				break;
			case "chargecontrols.0.autostartstop":
				if (state.val == true) {
					axios.get("http://" + this.config.ip + "/?AIM=1:1");
				} else {
					axios.get("http://" + this.config.ip + "/?AIM=0:1");
				}
				state.ack = true;
				break;
			default:
				state.ack = false;
				break;
		}

	}
	/**
	 * @param {string} prefix
	 * @param {object | array | string} obj
	 */
	async createStates(prefix, obj) {
		for (const elem in obj) {
			if (typeof (obj[elem]) == "string" || typeof (obj[elem]) == "number" || typeof (obj[elem]) == "boolean") {
				if (!elem.includes("protocol-version")) {
					const elemWithoutDot = elem.replace(".", "").replace(".", "");
					const id = prefix.substring(1) + "." + elemWithoutDot;
					const isWriable = !(id.includes("meters") || id.includes("network") || id.includes("system") || id.includes("data"));
					if (typeof (obj[elem]) == "number") {
						await this.setObjectNotExistsAsync(id, {
							type: "state",
							common: {
								name: elem,
								type: "number",
								role: "indicator",
								read: true,
								write: isWriable,
							},
							native: {},
						});
					} else if (typeof (obj[elem]) == "boolean") {
						await this.setObjectNotExistsAsync(id, {
							type: "state",
							common: {
								name: elem,
								type: "boolean",
								role: "indicator",
								read: true,
								write: isWriable,
							},
							native: {},
						});
					}
					else {
						await this.setObjectNotExistsAsync(id, {
							type: "state",
							common: {
								name: elem,
								type: "string",
								role: "indicator",
								read: true,
								write: isWriable,
							},
							native: {},
						});
					}
					if (isWriable)
						this.subscribeStates(id);
				}
			} else if (typeof (obj[elem]) == "object") {
				await this.createStates(prefix + "." + elem, obj[elem]);
			} else if (typeof (obj[elem]) == typeof ([])) {
				for (let i = 0; i < obj[elem].length; i++) {
					await this.createStates(prefix + "." + elem + "." + i, obj[elem][i]);
				}
			}
		}
	}
	/**
	 * @param {string} prefix
	 * @param {any} obj
	 */
	async setStatesEcb1(prefix, obj) {
		for (const elem in obj) {
			if (typeof (obj[elem]) == "string" || typeof (obj[elem]) == "number" || typeof (obj[elem]) == "boolean") {
				if (!elem.includes("protocol-version")) {
					const id = prefix.substring(1) + "." + elem.replace(".", "").replace(".", "");
					const currentState = await this.getStateAsync(id);
					if (currentState) {
						if (obj[elem] != currentState.val)
							this.setState(id, obj[elem], true);
					} else {
						this.setState(id, obj[elem], true);
					}
				}
			} else if (typeof (obj[elem]) == "object") {
				await this.setStatesEcb1(prefix + "." + elem, obj[elem]);
			} else if (typeof (obj[elem]) == typeof ([])) {
				for (let i = 0; i < obj[elem].length; i++) {
					await this.setStatesEcb1(prefix + "." + elem + "." + i, obj[elem][i]);
				}
			}
		}
	}
	async loop() {
		try {
			const response = (await axios.get("http://" + this.config.ip + "/api/v1/all"));
			const startstop = (await axios.get("http://" + this.config.ip + "/api/v1/chargecontrols/1/mode/eco/startstop")).data;
			if (response.status == 200) {
				this.connected = true;
				await this.setStatesEcb1("", response.data);
				await this.setStatesEcb1(".chargecontrols.0", startstop);
			} else {
				this.connected = false;
			}
		} catch (err) {
			this.connected = false;
		} finally {
			this.loopInterval = this.setTimeout(() => {
				this.loop();
			}, this.config.delayBetweenRequests);
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Ecb1(options);
} else {
	// otherwise start the instance directly
	new Ecb1();
}