'use strict';

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const axios = require('axios');
const WebSocket = require('ws');

// variables
const isValidIP = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])/;
const isValidAuthToken = /[a-zA-Z0-9]{8}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{12}/;
const isValidUsername = /[a-zA-Z0-9]{4,}/;

class Wiserbyfeller extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'wiserbyfeller',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));

		this.requestClient = axios.create();

		this.allLoads = null;
		this.rssi = null;

		this.updateInterval = null;
		this.autoRestartTimeout = null;

		this.waitBeforeCheck = null;
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		this.log.info('starting adapter "wiserbyfeller" ...');

		// Reset the connection indicator during startup
		this.setState('info.connection', false, true);

		// The adapters config (in the instance object everything under the attribute "native") is accessible via this.config:
		this.log.debug(`config.gatewayIP: ${this.config.gatewayIP}`);
		this.log.debug(`config.username: ${this.config.username}`);
		this.log.debug(`config.authToken: ${this.config.authToken}`);

		// check if gatewayIP has a valid IP
		// authtoken is like "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
		// username must be at least 4 characters only a-zA-Z0-9
		if (isValidIP.test(this.config.gatewayIP) && isValidAuthToken.test(this.config.authToken) && isValidUsername.test(this.config.username)) {
			try {
				this.log.info(`Trying to connect Wiser Gateway [IP: ${this.config.gatewayIP}]...`);

				// Get all loads with all their properties
				await this.getAllLoads();

				// create objects
				await this.createObjects();

				// fillAllLoads and fillAllStates
				await this.fillAllLoads(this.allLoads);

				// RSSI
				await this.getRssi();

				this.updateInterval = setInterval(async () => {
					try {
						await this.getRssi();
					} catch (error) {
						this.log.error(`${error} (ERR_#001)`);
					}
				}, 5 * 60 * 1000); // 5min = 300000ms

				// open WebSocket
				await this.connectToWS();
			} catch (error) {
				this.log.error(`${error} (ERR_#002)`);
			}
		} else {
			this.log.error('Wiser Gateway-IP and/or username and/or "authentification token" not set and/or not valid. (ERR_#003)');
		}
	}

	async connectToWS() {
		if (this.wss) {
			this.wss.close(1000, 'Close old websocket connection before start new websocket connection.');
		}

		this.wss = new WebSocket(`ws://${this.config.gatewayIP}/api`, {
			headers: {
				Authorization: `Bearer ${this.config.authToken}`,
			},
		});

		// on connect
		this.wss.on('open', () => {
			this.log.info('Connection to "Wiser Gateway WebSocket" established. Ready to get status events...');

			this.setStateAsync('info.connection', true, true);

			// get all loads https://github.com/Feller-AG/wiser-tutorial/blob/main/doc/websocket.md#get-all-load-states
			this.wss.send(
				JSON.stringify({
					command: 'dump_loads',
				}),
			);
		});

		this.wss.on('message', async (data, isBinary) => {
			const message = isBinary ? JSON.parse(data) : JSON.parse(data.toString());
			this.log.debug(`[wss.on - message]: ${JSON.stringify(message)}`);

			// save all loads
			try {
				//const jsonMessage = JSON.parse(message);
				const allLoads_device = this.allLoads.find((sID) => sID.id === message.load.id).device;
				const allLoads_type = this.allLoads.find((sID) => sID.id === message.load.id).type;

				if (allLoads_type === 'onoff') {
					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.ACTIONS.BRI`, { val: message.load.state.bri, ack: true });
				} else if (allLoads_type === 'dim') {
					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.ACTIONS.BRI`, { val: message.load.state.bri, ack: true });

					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.flags.over_current`, { val: message.load.state.flags.over_current, ack: true });
					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.flags.fading`, { val: message.load.state.flags.fading, ack: true });
					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.flags.noise`, { val: message.load.state.flags.noise, ack: true });
					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.flags.direction`, { val: message.load.state.flags.direction, ack: true });
					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.flags.over_temperature`, { val: message.load.state.flags.over_temperature, ack: true });
				} else if (allLoads_type === 'motor') {
					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.ACTIONS.LEVEL`, { val: message.load.state.level, ack: true });
					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.ACTIONS.TILT`, { val: message.load.state.tilt, ack: true });

					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.flags.direction`, { val: message.load.state.flags.direction, ack: true });
					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.flags.learning`, { val: message.load.state.flags.learning, ack: true });
					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.flags.moving`, { val: message.load.state.flags.moving, ack: true });
					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.flags.under_current`, { val: message.load.state.flags.under_current, ack: true });
					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.flags.over_current`, { val: message.load.state.flags.over_current, ack: true });
					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.flags.timeout`, { val: message.load.state.flags.timeout, ack: true });
					this.setState(`${allLoads_device}.${allLoads_device}_${message.load.id}.flags.locked`, { val: message.load.state.flags.locked, ack: true });
				} else {
					this.log.info('[wss.on - message]: Unknown device. Nothing Set. (ERR_#004)');
				}
			} catch (error) {
				// do nothing
			}
		});

		this.wss.on('close', async (data, reason) => {
			this.log.debug(`[wss.on - close]: this.wss.readyState: ${this.wss.readyState}; data: ${data}; reason: ${reason}`);

			this.setStateAsync('info.connection', false, true);

			try {
				if (data === 1000) {
					// do not restart because of shut down of connection from the adapter
					this.log.debug(`[wss.on - close]: ${reason}`);
				} else if (data === 1006) {
					await this.autoRestart();
				} else {
					throw new Error('Unknown WebSocket error. (ERR_#005)');
				}
			} catch (error) {
				this.log.debug(`[wss.close - error]: ${error} (ERR_#006)`);
			}
		});

		this.wss.on('error', (error) => {
			this.log.debug(`[wss.on - error]: error: ${error}; error.message: ${error.message} (ERR_#007)`);
		});
	}

	async autoRestart() {
		this.log.debug('[autoRestart()]: WebSocket connection terminated by "Wiser Gateway". Reconnect again in 5 seconds...');
		this.autoRestartTimeout = setTimeout(() => {
			this.connectToWS();
		}, 5 * 1000); // min. 5s = 5000ms
	}

	// Get all loads with all their properties: https://github.com/Feller-AG/wiser-tutorial/blob/main/doc/tool_curl.md#get-all-loads AND https://github.com/Feller-AG/wiser-tutorial/blob/main/doc/api_loads.md#get-apiloads
	async getAllLoads() {
		await this.requestClient({
			method: 'GET',
			url: `http://${this.config.gatewayIP}/api/loads`,
			headers: {
				Authorization: `Bearer ${this.config.authToken}`,
			},
		})
			.then((response) => {
				this.log.debug(`[getAllLoads]: HTTP status response: ${response.status} ${response.statusText}; config: ${JSON.stringify(response.config)}; headers: ${JSON.stringify(response.headers)}; data: ${JSON.stringify(response.data)}`);

				this.allLoads = response.data.data;
			})
			.catch((error) => {
				if (error.response) {
					// The request was made and the server responded with a status code that falls out of the range of 2xx
					this.log.debug(`[getAllLoads()]: HTTP status response: ${error.response.status}; headers: ${JSON.stringify(error.response.headers)}; data: ${JSON.stringify(error.response.data)}`);
				} else if (error.request) {
					// The request was made but no response was received `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js
					this.log.debug(`[getAllLoads()] error request: ${error}`);
				} else {
					// Something happened in setting up the request that triggered an Error
					this.log.debug(`[getAllLoads()] error message: ${error.message}`);
				}
				this.log.debug(`[getAllLoads()] error.config: ${JSON.stringify(error.config)}`);
				throw new Error('Wiser Gateway not reachable. Please check Wiser Gateway connection and/or authentification token. (ERR_#008)');
			});
	}

	// Get RSSI
	async getRssi() {
		await this.requestClient({
			method: 'GET',
			url: `http://${this.config.gatewayIP}/api/net/rssi`,
			headers: {
				Authorization: `Bearer ${this.config.authToken}`,
			},
		})
			.then((response) => {
				this.log.debug(`[getRssi()]: HTTP status response: ${response.status} ${response.statusText}; config: ${JSON.stringify(response.config)}; headers: ${JSON.stringify(response.headers)}; data: ${JSON.stringify(response.data)}`);

				this.setState('info.rssi', { val: response.data.data.rssi, ack: true });
			})
			.catch((error) => {
				if (error.response) {
					// The request was made and the server responded with a status code that falls out of the range of 2xx
					this.log.debug(`[getRssi()]: HTTP status response: ${error.response.status}; headers: ${JSON.stringify(error.response.headers)}; data: ${JSON.stringify(error.response.data)}`);
				} else if (error.request) {
					// The request was made but no response was received `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js
					this.log.debug(`[getRssi()] error request: ${error}`);
				} else {
					// Something happened in setting up the request that triggered an Error
					this.log.debug(`[getRssi()] error message: ${error.message}`);
				}
				this.log.debug(`[getRssi()] error.config: ${JSON.stringify(error.config)}`);
				throw new Error('Wiser Gateway not reachable. Please check Wiser Gateway connection and/or authentification token. (ERR_#009)');
			});
	}

	// https://github.com/ioBroker/ioBroker/blob/master/doc/STATE_ROLES.md
	async createObjects() {
		this.log.debug(`createObjects(): this.allLoads: ${JSON.stringify(this.allLoads)}`);

		if (this.allLoads && this.allLoads.length) {
			this.log.debug(`[createObjects()] start objects creation for ${this.allLoads.length} device${this.allLoads.length > 1 ? 's' : ''}...`);

			await this.setObjectNotExistsAsync('info.rssi', {
				type: 'state',
				common: {
					name: 'Received Signal Strength Indication of the Gateway device.',
					desc: 'Received Signal Strength Indication of the Gateway device',
					type: 'number',
					role: 'value',
					min: -100,
					max: -1,
					unit: 'dBm',
					read: true,
					write: false,
				},
				native: {},
			});

			for (const i in this.allLoads) {
				// get device type
				let devicetypeName = '';
				let deviceIcon = '';
				if (this.allLoads[i].type === 'onoff') {
					devicetypeName = 'WiserByFeller switchable light';
					deviceIcon = 'icons/icon_wiserbyfeller_switchable_light_2ch.svg';
				} else if (this.allLoads[i].type === 'dim') {
					devicetypeName = 'WiserByFeller LED-universaldimmer';
					deviceIcon = 'icons/icon_wiserbyfeller_led_universaldimmer_2ch.svg';
				} else if (this.allLoads[i].type === 'motor') {
					devicetypeName = 'WiserByFeller blind switch';
					deviceIcon = 'icons/icon_wiserbyfeller_led_blindswitch_2ch.svg';
				}

				// create device
				await this.setObjectNotExistsAsync(this.allLoads[i].device, {
					type: 'device',
					common: {
						name: devicetypeName,
						icon: deviceIcon,
					},
					native: {},
				});
				await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.type`, {
					type: 'state',
					common: {
						name: 'Device type',
						desc: 'Device type',
						type: 'string',
						role: 'value',
						read: true,
						write: false,
					},
					native: {},
				});
				await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.device`, {
					type: 'state',
					common: {
						name: 'Device ID',
						desc: 'Device ID',
						type: 'string',
						role: 'value',
						read: true,
						write: false,
					},
					native: {},
				});

				// create channel
				await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}`, {
					type: 'channel',
					common: {
						name: `${devicetypeName} DeviceID: ${this.allLoads[i].id}`,
						desc: `${devicetypeName} DeviceID: ${this.allLoads[i].id}`,
					},
					native: {},
				});
				await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.id`, {
					type: 'state',
					common: {
						name: 'Device ID',
						desc: 'Device ID',
						type: 'number',
						role: 'value',
						read: true,
						write: false,
					},
					native: {},
				});
				await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.channel`, {
					type: 'state',
					common: {
						name: 'Device Channel',
						desc: 'Device Channel',
						type: 'number',
						role: 'value',
						read: true,
						write: false,
					},
					native: {},
				});
				await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.unused`, {
					type: 'state',
					common: {
						name: 'Unused',
						desc: 'Unused',
						type: 'boolean',
						role: 'value',
						read: true,
						write: false,
					},
					native: {},
				});
				// not found in https://github.com/Feller-AG/wiser-tutorial/blob/main/doc/api_loads.md#get-apiloads
				await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.name`, {
					type: 'state',
					common: {
						name: 'Device Name',
						desc: 'Device Name',
						type: 'string',
						role: 'value',
						read: true,
						write: false,
					},
					native: {},
				});
				// not found in https://github.com/Feller-AG/wiser-tutorial/blob/main/doc/api_loads.md#get-apiloads
				await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.room`, {
					type: 'state',
					common: {
						name: 'Device Room',
						desc: 'Device Room',
						type: 'number',
						role: 'value',
						read: true,
						write: false,
					},
					native: {},
				});
				await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.kind`, {
					type: 'state',
					common: {
						name: 'kind',
						desc: 'kind',
						type: 'number',
						role: 'value',
						read: true,
						write: false,
					},
					native: {},
				});

				// #3401 1-channel pressure switch
				// #3402 2-channel pressure switch
				if (this.allLoads[i].type === 'onoff') {
					// create channel
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.ACTIONS`, {
						type: 'channel',
						common: {
							name: 'ACTIONS',
							desc: 'ACTIONS',
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.ACTIONS.BRI`, {
						type: 'state',
						common: {
							name: 'Power on/off',
							desc: 'Power on/off',
							type: 'number',
							role: 'switch',
							read: true,
							write: true,
							states: {
								0: 'off',
								10000: 'on',
							},
						},
						native: {},
					});
				}

				// #3406 1-channel LED-universaldimmer
				// #3407 2-channel LED-universaldimmer
				else if (this.allLoads[i].type === 'dim') {
					// create channel
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.ACTIONS`, {
						type: 'channel',
						common: {
							name: 'ACTIONS',
							desc: 'ACTIONS',
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.ACTIONS.BRI`, {
						type: 'state',
						common: {
							name: 'Brightness',
							desc: 'Brightness',
							type: 'number',
							role: 'level.dimmer',
							min: 0,
							max: 10000,
							read: true,
							write: true,
						},
						native: {},
					});
					// create channel
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.flags`, {
						type: 'channel',
						common: {
							name: 'flags',
							desc: 'flags',
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.flags.over_current`, {
						type: 'state',
						common: {
							name: 'over_current',
							desc: 'over_current',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.flags.fading`, {
						type: 'state',
						common: {
							name: 'fading',
							desc: 'fading',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.flags.noise`, {
						type: 'state',
						common: {
							name: 'noise',
							desc: 'noise',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.flags.direction`, {
						type: 'state',
						common: {
							name: 'direction',
							desc: 'direction',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.flags.over_temperature`, {
						type: 'state',
						common: {
							name: 'over_temperature',
							desc: 'over_temperature',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});

					// #3404 1-channel blind switch
					// #3405 2-channel blind switch
				} else if (this.allLoads[i].type === 'motor') {
					// create channel
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.ACTIONS`, {
						type: 'channel',
						common: {
							name: 'ACTIONS',
							desc: 'ACTIONS',
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.ACTIONS.LEVEL`, {
						type: 'state',
						common: {
							name: 'Blind level',
							desc: 'Blind level',
							type: 'number',
							role: 'level.blind',
							min: 0,
							max: 10000,
							read: true,
							write: true,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.ACTIONS.TILT`, {
						type: 'state',
						common: {
							name: 'Blind tilt',
							desc: 'Blind tilt',
							type: 'number',
							role: 'level.tilt',
							min: 0,
							max: 9,
							read: true,
							write: true,
						},
						native: {},
					});
					/*
					await this.setObjectNotExistsAsync(`${allLoadsAllLoadsStates[i].device}.${allLoadsAllLoadsStates[i].device}_${allLoadsAllLoadsStates[i].id}.ACTIONS.moving`, {
						type: 'state',
						common: {
							name: 'moving',
							desc: 'moving',
							type: 'string',
							role: 'value',
							min: 0,
							max: 1000,
							read: true,
							write: false
						},
						native: {}
					});
					*/
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.ACTIONS.leveltilt`, {
						type: 'channel',
						common: {
							name: 'Set blind with level and tilt',
							desc: 'Set blind with level and tilt',
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.ACTIONS.leveltilt.level`, {
						type: 'state',
						common: {
							name: 'Blind level',
							desc: 'Blind level',
							type: 'number',
							role: 'value',
							min: 0,
							max: 10000,
							read: true,
							write: true,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.ACTIONS.leveltilt.tilt`, {
						type: 'state',
						common: {
							name: 'Blind tilt',
							desc: 'Blind tilt',
							type: 'number',
							role: 'value',
							min: 0,
							max: 9,
							read: true,
							write: true,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.ACTIONS.leveltilt.SET`, {
						type: 'state',
						common: {
							name: 'Set Blind',
							desc: 'Set Blind',
							type: 'boolean',
							role: 'button',
							def: false,
							read: true,
							write: true,
						},
						native: {},
					});
					// create channel
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.flags`, {
						type: 'channel',
						common: {
							name: 'flags',
							desc: 'flags',
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.flags.direction`, {
						type: 'state',
						common: {
							name: 'direction',
							desc: 'direction',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.flags.learning`, {
						type: 'state',
						common: {
							name: 'learning',
							desc: 'learning',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.flags.moving`, {
						type: 'state',
						common: {
							name: 'moving',
							desc: 'moving',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.flags.under_current`, {
						type: 'state',
						common: {
							name: 'under_current',
							desc: 'under_current',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.flags.over_current`, {
						type: 'state',
						common: {
							name: 'over_current',
							desc: 'over_current',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.flags.timeout`, {
						type: 'state',
						common: {
							name: 'timeout',
							desc: 'timeout',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.flags.locked`, {
						type: 'state',
						common: {
							name: 'locked',
							desc: 'locked',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
				}
				this.subscribeStates(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.ACTIONS.BRI`);
				this.subscribeStates(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.ACTIONS.LEVEL`);
				this.subscribeStates(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.ACTIONS.TILT`);
				this.subscribeStates(`${this.allLoads[i].device}.${this.allLoads[i].device}_${this.allLoads[i].id}.ACTIONS.leveltilt.SET`);
			}
			this.log.debug('[createObjects()] Objects created.');
		} else {
			throw new Error('No Objects found, no Objects created. Check installation. (ERR_#010)');
		}
	}

	async fillAllLoads(allLoads) {
		try {
			this.log.debug(`[fillAllLoads()]: starting filling in allLoads for ${allLoads.length} device${allLoads.length > 1 ? 's' : ''}...`);
			for (let i = 0; i < allLoads.length; i++) {
				this.setState(`${allLoads[i].device}.device`, { val: allLoads[i].device, ack: true });
				this.setState(`${allLoads[i].device}.type`, { val: allLoads[i].type, ack: true });

				this.setState(`${allLoads[i].device}.${allLoads[i].device}_${allLoads[i].id}.id`, { val: allLoads[i].id, ack: true });
				this.setState(`${allLoads[i].device}.${allLoads[i].device}_${allLoads[i].id}.channel`, { val: allLoads[i].channel, ack: true });
				this.setState(`${allLoads[i].device}.${allLoads[i].device}_${allLoads[i].id}.unused`, { val: allLoads[i].unused, ack: true });
				this.setState(`${allLoads[i].device}.${allLoads[i].device}_${allLoads[i].id}.name`, { val: allLoads[i].name, ack: true });
				this.setState(`${allLoads[i].device}.${allLoads[i].device}_${allLoads[i].id}.room`, { val: allLoads[i].room, ack: true });
				this.setState(`${allLoads[i].device}.${allLoads[i].device}_${allLoads[i].id}.kind`, { val: allLoads[i].kind, ack: true });
			}
			this.log.debug('[fillAllLoads()]: allLoads filled in.');
		} catch (error) {
			// do nothing
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			this.updateInterval && clearInterval(this.updateInterval);
			this.autoRestartTimeout && clearTimeout(this.autoRestartTimeout);

			this.setState('info.connection', false, true);

			callback();
			this.log.info('cleaned everything up... (#1)');
		} catch (e) {
			callback();
			this.log.info('cleaned everything up... (#2)');
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {
		if (state !== null && state !== undefined && state.val !== null && state.val !== undefined) {
			if (state.ack === false) {
				this.log.debug(`id: ${id}; state: ${JSON.stringify(state)}`);

				const device = id.split('.')[2];
				this.log.debug(`device: ${device}`);
				const loadID = id.split('.')[3].split('_')[1];
				this.log.debug(`loadID: ${loadID}`);
				const load = id.split('.')[5];
				this.log.debug(`load: ${load}`);

				const APIID = this.allLoads.find((obj) => obj.device === device);
				this.log.debug(`APIID.type: ${APIID.type}`);

				let sendData;

				switch (APIID.type) {
					case 'onoff':
						if (state.val > 0) {
							sendData = { bri: 10000 };
						} else {
							sendData = { bri: 0 };
						}
						break;
					case 'dim':
						sendData = { bri: state.val };
						break;
					case 'motor':
						if (load === 'LEVEL') {
							sendData = { level: state.val };
						} else if (load === 'TILT') {
							sendData = { tilt: state.val };
						} else if (load === 'leveltilt') {
							const idSplit = id.split('.');
							const parentPath = idSplit.slice(0, idSplit.length - 1).join('.');
							this.log.debug(`parentPath: ${parentPath}`);

							const level = await this.getStateAsync(`${parentPath}.level`);
							const tilt = await this.getStateAsync(`${parentPath}.tilt`);

							if (level && tilt && level.val && tilt.val) {
								sendData = {
									level: level.val,
									tilt: tilt.val,
								};
							}
						}
						break;
				}

				this.log.debug(`valData: ${JSON.stringify(sendData)}`);

				this.requestClient({
					method: 'PUT',
					url: `http://${this.config.gatewayIP}/api/loads/${loadID}/target_state`,
					headers: {
						Authorization: `Bearer ${this.config.authToken}`,
						'Content-Type': 'application/json; charset=UTF-8',
					},
					data: sendData,
				})
					.then((response) => {
						this.log.debug(`[onStateChange()]: HTTP status response: ${response.status} ${response.statusText}; config: ${JSON.stringify(response.config)}; headers: ${JSON.stringify(response.headers)}; data: ${JSON.stringify(response.data)}`);
					})
					.catch((error) => {
						if (error.response) {
							// The request was made and the server responded with a status code that falls out of the range of 2xx
							this.log.debug(`[onStateChange()]: HTTP status response: ${error.response.status}; headers: ${JSON.stringify(error.response.headers)}; data: ${JSON.stringify(error.response.data)}`);
						} else if (error.request) {
							// The request was made but no response was received `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js
							this.log.debug(`[onStateChange()] error request: ${error}`);
						} else {
							// Something happened in setting up the request that triggered an Error
							this.log.debug(`[onStateChange()] error message: ${error.message}`);
						}
						this.log.debug(`[onStateChange()] error.config: ${JSON.stringify(error.config)}`);
					});
			} else {
				// The state was changed by system
				// this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack}). NO ACTION PERFORMED.`);
			}
		} else {
			// The state was deleted
			this.log.debug(`state ${id} was changed. NO ACTION PERFORMED.`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	// * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	// * Using this method requires "common.messagebox" property to be set to true in io-package.json
	// * @param {ioBroker.Message} obj
	// */

	onMessage(obj) {
		this.log.debug(`[onMessage] message received: ${JSON.stringify(obj)}`);
		if (typeof obj === 'object' && obj.message) {
			// check API-Key
			if (!isValidIP.test(obj.message.gatewayIP)) {
				this.log.error('no valid Gateway-IP (ERR_#011)');
				this.sendTo(obj.from, obj.command, { error: 'noValidGateway-IP' }, obj.callback);
				return;
			}

			// check username
			if (!isValidUsername.test(obj.message.username)) {
				this.log.error('no valid username (ERR_#012)');
				this.sendTo(obj.from, obj.command, { error: 'noValidUsername' }, obj.callback);
				return;
			}

			if (obj.command === 'getAuthToken') {
				this.log.info(`Try to obtain authorization token from ${obj.message.gatewayIP} with username ${obj.message.username} (Press Button on blinking device!)`);

				this.requestClient({
					method: 'POST',
					url: `http://${obj.message.gatewayIP}/api/account/claim`,
					headers: {
						'Content-Type': 'application/json',
					},
					data: { user: obj.message.username },
					timeout: 30000,
				})
					.then((response) => {
						this.log.debug(`[onMessage]: HTTP status response: ${response.status} ${response.statusText}; config: ${JSON.stringify(response.config)}; headers: ${JSON.stringify(response.headers)}; data: ${JSON.stringify(response.data)}`);
						this.log.info(`Got new authentication token "${response.data.data.secret}" with username "${response.data.data.user}"`);

						this.getForeignObject(`system.adapter.${this.name}.${this.instance}`, (error, obj) => {
							if (obj && obj.native) {
								obj.native.authToken = response.data.data.secret;
								this.setForeignObject(`system.adapter.${this.name}.${this.instance}`, obj);
							}
						});

						this.sendTo(obj.from, obj.command, { result: 'authenticationTokenRecived' }, obj.callback);
					})
					.catch((error) => {
						if (error.response) {
							// The request was made and the server responded with a status code that falls out of the range of 2xx
							this.log.debug(`[onMessage]: HTTP status response: ${error.response.status}; headers: ${JSON.stringify(error.response.headers)}; data: ${JSON.stringify(error.response.data)}`);
						} else if (error.request) {
							// The request was made but no response was received `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js
							this.log.debug(`[onMessage]: error request: ${error}`);
						} else {
							// Something happened in setting up the request that triggered an Error
							this.log.debug(`[onMessage]: error message: ${error.message}`);
						}
						this.sendTo(obj.from, obj.command, { error: 'noAuthenticationTokenRecived' }, obj.callback);
					});
			}
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Wiserbyfeller(options);
} else {
	// otherwise start the instance directly
	new Wiserbyfeller();
}
