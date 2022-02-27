'use strict';

/*
 * Created with @iobroker/create-adapter v2.0.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const axios = require('axios').default;
const WebSocket = require('ws');

// variables
//let statesUpdate = true;

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

		this.allLoads = {};

		this.updateInterval = null;

		this.ping = null;
		this.pingTimeout = null;
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

		//check if gatewayIP has a valid IP
		//authtoken is like "60650cf4-5d26-4294-b1f2-6c06adc9d0d8"
		//username must be at least 4 characters only a-zA-Z0-9
		if ((/^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/).test(this.config.gatewayIP) && (/[a-zA-Z0-9]{8}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{12}$/).test(this.config.authToken) && (/[a-zA-Z0-9]{4,}$/).test(this.config.username)) {

			try {
				this.log.info('Trying to connect Wiser Gateway [IP: ' + this.config.gatewayIP + '].');

				//Get all loads with all their properties
				await this.getAllLoads();

				this.setState('info.connection', true, true);
				this.log.info('Wiser Gateway [IP: ' + this.config.gatewayIP + '] connected.');

				//Get all loads state
				//await this.getAllLoadsStates(this.config.gatewayIP, this.config.authToken);

				//create objects
				await this.createObjects();
/*
				//fillAllLoads and fillAllStates
				await this.fillAllLoads(this.allLoads);
				await this.fillAllStates(this.allLoads, this.allLoadsStates);
				await this.getRssi(this.config.gatewayIP, this.config.authToken);
				await this.fillRssi(this.allLoads, this.rssi);

				//start polling
				this.log.info('Starting polltimer with a ' + this.config.intervalTime + ' seconds interval.');
				this.updateInterval = setInterval(async () => {
					try {
						await this.getAllLoadsStates(this.config.gatewayIP, this.config.authToken);
						await this.fillAllStates(this.allLoads, this.allLoadsStates);
						this.setState('info.connection', true, true);
					} catch(error) {
						// Reset the connection indicator
						this.setState('info.connection', false, true);
						this.log.error(error);
					}
				}, this.config.intervalTime * 1000);

				this.updateInterval2 = setInterval(async () => {
					try {
						await this.getRssi(this.config.gatewayIP, this.config.authToken);
						await this.fillRssi(this.allLoads, this.rssi);
					} catch(error) {
						// Reset the connection indicator
						this.log.error(error);
					}
				}, this.config.intervalTime * 5 * 1000);

				//open WebSocket
				await this.connectToWS();
*/
			} catch (error) {
				this.log.error(error);
				//this.setState('info.connection', false, true);
			}
		} else {
			this.log.error('Wiser Gateway-IP and/or "authentification token" not set and/or not valid. (ERR_#001)');
		}
	}

	async connectToWS() {

		if (this.wss) {
			this.wss.close();
		}

		this.wss = new WebSocket('ws://' + this.config.gatewayIP + '/api', {
			headers: {
				'Authorization': 'Bearer ' + this.config.authToken + '\''
			}
		});

		//on connect
		this.wss.on('open', () => {
			//this.log.debug('wss open: Connection established');
			this.log.info('Connection to "Husqvarna WebSocket" established. Ready to get status events...');

			this.wss.send(JSON.stringify({
				command: 'dump_loads'
			}));
		});

		this.wss.on('message', async (message) => {
			this.log.debug('message: ' + message);
		});

		this.wss.on('close', (data) => {
/*
			if (data.wasClean) {
				this.log.debug(`[close] Connection closed cleanly, code=${data.code} reason=${data.reason}`);
			}
*/
			this.log.debug('close data: ' + data);
			this.log.debug('close data.code: ' + data.code);
			this.log.debug('close data.reason: ' + data.reason);

			if (data === 1006) {
				this.autoRestart();
			}

		});

		this.wss.on('error', (error) => {
			this.log.error('websocket error: ' + error);
			this.log.error('websocket error.message: ' + error.message);
		});
	}

	async autoRestart() {
		this.log.debug('Websocked connection terminated. Start again in 5 seconds...');
		this.autoRestartTimeout = setTimeout(() => {
			this.connectToWS();
		}, 5000); //min. 5s = 5000ms
	}


	//Get all loads with all their properties: https://github.com/Feller-AG/wiser-tutorial/blob/main/doc/tool_curl.md#get-all-loads AND https://github.com/Feller-AG/wiser-tutorial/blob/main/doc/api_loads.md#get-apiloads
	async getAllLoads() {

		await axios({
			method: 'GET',
			url: 'http://' + this.config.gatewayIP + '/api/loads',
			headers: {
				'Authorization': 'Bearer ' + this.config.authToken + '\''
			}
		})
			.then((response) => {
				this.log.debug('response.data: ' + JSON.stringify(response.data));
				this.log.debug('response.status: ' + response.status);
				this.log.debug('response.statusText: ' + response.statusText);
				this.log.debug('response.headers: ' + JSON.stringify(response.headers));
				this.log.debug('response.config: ' + JSON.stringify(response.config));

				this.allLoads = response.data.data;
			})
			.catch((error) => {
				if (error.response) {
					// The request was made and the server responded with a status code that falls out of the range of 2xx
					this.log.debug('error.response.data: ' + error.response.data);
					this.log.debug('error.response.status: ' + error.response.status);
					this.log.debug('error.response.statusText: ' + error.response.statusText);
					this.log.debug('error.response.headers: ' + JSON.stringify(error.response.headers));
				} else if (error.request) {
					// The request was made but no response was received `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js
					this.log.debug('error request: ' + error);
				} else {
					// Something happened in setting up the request that triggered an Error
					this.log.debug('error message: ' + error.message);
				}
				this.log.debug('error.config: ' + JSON.stringify(error.config));
				throw new Error ('Wiser Gateway not reachable. Please check Wiser Gateway connection and/or authentification token. (ERR_#002)');
			});
	}

/*
	//Get all loads state
	async getAllLoadsStates(gatewayIP, authToken) {

		await axios({
			method: 'GET',
			url: 'http://' + gatewayIP + '/api/loads/state',
			headers: {
				'Authorization': 'Bearer ' + authToken + '\''
			},
			timeout: this.config.intervalTime * 1000 * 1.5
		})
			.then((response) => {
				this.log.debug('response.data: ' + JSON.stringify(response.data));
				this.log.debug('response.status: ' + response.status);
				//this.log.debug('response.statusText: ' + response.statusText);
				this.log.debug('response.headers: ' + JSON.stringify(response.headers));
				this.log.debug('response.config: ' + JSON.stringify(response.config));

				this.allLoadsStates = response.data.data;
			})
			.catch((error) => {
				if (error.response) {
					// The request was made and the server responded with a status code that falls out of the range of 2xx
					this.log.debug('error data: ' + error.response.data);
					this.log.debug('error status: ' + error.response.status);
					this.log.debug('error headers: ' + error.response.headers);
				} else if (error.request) {
					// The request was made but no response was received `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js
					this.log.debug('error request: ' + error);
				} else {
					// Something happened in setting up the request that triggered an Error
					this.log.debug('error message: ' + error.message);
				}
				this.log.debug('error.config: ' + JSON.stringify(error.config));
				throw new Error ('Wiser Gateway not reachable. Please check Wiser Gateway connection and/or authentification token. (ERR_#003)');
			});
	}
*/
/*
	//Get RSSI
	async getRssi(gatewayIP, authToken) {

		await axios({
			method: 'GET',
			url: 'http://' + gatewayIP + '/api/net/rssi',
			headers: {
				'Authorization': 'Bearer ' + authToken + '\''
			},
			timeout: this.config.intervalTime * 1000 * 1.5
		})
			.then((response) => {
				this.log.debug('response.data: ' + JSON.stringify(response.data));
				this.log.debug('response.status: ' + response.status);
				//this.log.debug('response.statusText: ' + response.statusText);
				this.log.debug('response.headers: ' + JSON.stringify(response.headers));
				this.log.debug('response.config: ' + JSON.stringify(response.config));

				this.rssi = response.data.data;
			})
			.catch((error) => {
				if (error.response) {
					// The request was made and the server responded with a status code that falls out of the range of 2xx
					this.log.debug('error data: ' + error.response.data);
					this.log.debug('error status: ' + error.response.status);
					this.log.debug('error headers: ' + error.response.headers);
				} else if (error.request) {
					// The request was made but no response was received `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js
					this.log.debug('error request: ' + error);
				} else {
					// Something happened in setting up the request that triggered an Error
					this.log.debug('error message: ' + error.message);
				}
				this.log.debug('error.config: ' + JSON.stringify(error.config));
				throw new Error ('Wiser Gateway not reachable. Please check Wiser Gateway connection and/or authentification token. (ERR_#004)');
			});
	}
*/

	//https://github.com/ioBroker/ioBroker/blob/master/doc/STATE_ROLES.md
	async createObjects() {

		this.log.debug('createObjects(): this.allLoads: ' + JSON.stringify(this.allLoads));
		this.log.debug('start objects creation for ' + this.allLoads.length + ' device' + (this.allLoads.length > 1 ? 's' : '') + ' ...');

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
				write: false
			},
			native: {}
		});

		if (this.allLoads.length !== 0) {
			for (let i = 0; i < this.allLoads.length; i++) {

				//get device type
				let devicetypeName = '';
				let deviceIcon = '';
				if (this.allLoads[i].type === 'onoff') {
					devicetypeName = 'WiserByFeller switchable light';
					deviceIcon = 'icons/icon_wiserbyfeller_switchable_light_2ch.png';
				} else if (this.allLoads[i].type === 'dim') {
					devicetypeName = 'WiserByFeller LED-universaldimmer';
					deviceIcon = 'icons/icon_wiserbyfeller_led_universaldimmer_2ch.png';
				} else if (this.allLoads[i].type === 'motor') {
					devicetypeName = 'WiserByFeller blind switch';
					deviceIcon = 'icons/icon_wiserbyfeller_led_blindswitch_2ch.png';
				}

				//create device
				await this.setObjectNotExistsAsync(this.allLoads[i].device, {
					type: 'device',
					common: {
						name: devicetypeName,
						icon: deviceIcon
					},
					native: {}
				});
				await this.setObjectNotExistsAsync(this.allLoads[i].device + '.type', {
					type: 'state',
					common: {
						name: 'Device type',
						desc: 'Device type',
						type: 'string',
						role: 'value',
						read: true,
						write: false
					},
					native: {}
				});
				await this.setObjectNotExistsAsync(this.allLoads[i].device + '.device', {
					type: 'state',
					common: {
						name: 'Device ID',
						desc: 'Device ID',
						type: 'string',
						role: 'value',
						read: true,
						write: false
					},
					native: {}
				});

				//#3401 1-channel pressure switch / #3402 2-channel pressure switch
				if (this.allLoads[i].type === 'onoff') {
					//create channel
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id, {
						type: 'channel',
						common: {
							name: devicetypeName + ' DeviceID: ' + this.allLoads[i].id,
							desc: devicetypeName + ' DeviceID: ' + this.allLoads[i].id,
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.ACTIONS', {
						type: 'channel',
						common: {
							name: 'ACTIONS',
							desc: 'ACTIONS'
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.ACTIONS.bri', {
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
								10000: 'on'
							}
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.id', {
						type: 'state',
						common: {
							name: 'Device ID',
							desc: 'Device ID',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.channel', {
						type: 'state',
						common: {
							name: 'Device Channel',
							desc: 'Device Channel',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.unused', {
						type: 'state',
						common: {
							name: 'Unused',
							desc: 'Unused',
							type: 'boolean',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					//not found in https://github.com/Feller-AG/wiser-tutorial/blob/main/doc/api_loads.md#get-apiloads
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.name', {
						type: 'state',
						common: {
							name: 'Device Name',
							desc: 'Device Name',
							type: 'string',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					//not found in https://github.com/Feller-AG/wiser-tutorial/blob/main/doc/api_loads.md#get-apiloads
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.room', {
						type: 'state',
						common: {
							name: 'Device Room',
							desc: 'Device Room',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.kind', {
						type: 'state',
						common: {
							name: 'kind',
							desc: 'kind',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
				}

				//#3406 1-channel LED-universaldimmer / #3407 2-channel LED-universaldimmer
				else if (this.allLoads[i].type === 'dim') {
					//create channel
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id, {
						type: 'channel',
						common: {
							name: devicetypeName + ' DeviceID: ' + this.allLoads[i].id,
							desc: devicetypeName + ' DeviceID: ' + this.allLoads[i].id
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.ACTIONS', {
						type: 'channel',
						common: {
							name: 'ACTIONS',
							desc: 'ACTIONS'
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.ACTIONS.bri', {
						type: 'state',
						common: {
							name: 'Brightness',
							desc: 'Brightness',
							type: 'number',
							role: 'level.dimmer',
							min: 0,
							max: 10000,
							read: true,
							write: true
						},
						native: {}
					});
					//create channel
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.flags', {
						type: 'channel',
						common: {
							name: 'flags',
							desc: 'flags'
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.flags.over_current', {
						type: 'state',
						common: {
							name: 'over_current',
							desc: 'over_current',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.flags.fading', {
						type: 'state',
						common: {
							name: 'fading',
							desc: 'fading',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.flags.noise', {
						type: 'state',
						common: {
							name: 'noise',
							desc: 'noise',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.flags.direction', {
						type: 'state',
						common: {
							name: 'direction',
							desc: 'direction',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.flags.over_temperature', {
						type: 'state',
						common: {
							name: 'over_temperature',
							desc: 'over_temperature',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.id', {
						type: 'state',
						common: {
							name: 'Device ID',
							desc: 'Device ID',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.channel', {
						type: 'state',
						common: {
							name: 'Device Channel',
							desc: 'Device Channel',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.unused', {
						type: 'state',
						common: {
							name: 'Unused',
							desc: 'Unused',
							type: 'boolean',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					//not found in https://github.com/Feller-AG/wiser-tutorial/blob/main/doc/api_loads.md#get-apiloads
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.name', {
						type: 'state',
						common: {
							name: 'Device Name',
							desc: 'Device Name',
							type: 'string',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					//not found in https://github.com/Feller-AG/wiser-tutorial/blob/main/doc/api_loads.md#get-apiloads
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.room', {
						type: 'state',
						common: {
							name: 'Device Room',
							desc: 'Device Room',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.kind', {
						type: 'state',
						common: {
							name: 'kind',
							desc: 'kind',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});

				//#3404 1-channel blind switch / #3405 2-channel blind switch
				} else if (this.allLoads[i].type === 'motor') {
					//create channel
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id, {
						type: 'channel',
						common: {
							name: devicetypeName + ' DeviceID: ' + this.allLoads[i].id,
							desc: devicetypeName + ' DeviceID: ' + this.allLoads[i].id
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.ACTIONS', {
						type: 'channel',
						common: {
							name: 'ACTIONS',
							desc: 'ACTIONS'
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.ACTIONS.level', {
						type: 'state',
						common: {
							name: 'Blind level',
							desc: 'Blind level',
							type: 'number',
							role: 'level.blind',
							min: 0,
							max: 10000,
							read: true,
							write: true
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.ACTIONS.tilt', {
						type: 'state',
						common: {
							name: 'Blind tilt',
							desc: 'Blind tilt',
							type: 'number',
							role: 'level.tilt',
							min: 0,
							max: 9,
							read: true,
							write: true
						},
						native: {}
					});
					/*
					await this.setObjectNotExistsAsync(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.ACTIONS.moving', {
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
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.ACTIONS.leveltilt', {
						type: 'state',
						common: {
							name: 'Blind leveltilt',
							desc: 'Blind leveltilt',
							type: 'string',
							role: 'value',
							read: true,
							write: true
						},
						native: {}
					});
					//create channel
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.flags', {
						type: 'channel',
						common: {
							name: 'flags',
							desc: 'flags'
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.flags.direction', {
						type: 'state',
						common: {
							name: 'direction',
							desc: 'direction',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.flags.learning', {
						type: 'state',
						common: {
							name: 'learning',
							desc: 'learning',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.flags.moving', {
						type: 'state',
						common: {
							name: 'moving',
							desc: 'moving',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.flags.under_current', {
						type: 'state',
						common: {
							name: 'under_current',
							desc: 'under_current',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.flags.over_current', {
						type: 'state',
						common: {
							name: 'over_current',
							desc: 'over_current',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.flags.timeout', {
						type: 'state',
						common: {
							name: 'timeout',
							desc: 'timeout',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.flags.locked', {
						type: 'state',
						common: {
							name: 'locked',
							desc: 'locked',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.id', {
						type: 'state',
						common: {
							name: 'Device ID',
							desc: 'Device ID',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.channel', {
						type: 'state',
						common: {
							name: 'Device Channel',
							desc: 'Device Channel',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.unused', {
						type: 'state',
						common: {
							name: 'Unused',
							desc: 'Unused',
							type: 'boolean',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					//not found in https://github.com/Feller-AG/wiser-tutorial/blob/main/doc/api_loads.md#get-apiloads
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.name', {
						type: 'state',
						common: {
							name: 'Device Name',
							desc: 'Device Name',
							type: 'string',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					//not found in https://github.com/Feller-AG/wiser-tutorial/blob/main/doc/api_loads.md#get-apiloads
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.room', {
						type: 'state',
						common: {
							name: 'Device Room',
							desc: 'Device Room',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					await this.setObjectNotExistsAsync(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.kind', {
						type: 'state',
						common: {
							name: 'kind',
							desc: 'kind',
							type: 'number',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
				}
				this.subscribeStates(this.allLoads[i].device + '.' + this.allLoads[i].device + '_' + this.allLoads[i].id + '.ACTIONS.*');
			}
			this.log.debug('Objects created ...');
		} else {
			throw new Error ('No Objects found, no Objects created. Check installation.');
		}
	}
/*
	async fillAllLoads(allLoads) {

		if (allLoads.length !== 0) {
			this.log.debug('fillAllLoads(): starting filling in allLoads for ' + allLoads.length + ' device' + (allLoads.length > 1 ? 's' : '') + ' ...');
			for (let i = 0; i < allLoads.length; i++) {

				if (allLoads[i].device !== null) { this.setState(allLoads[i].device + '.device', {val: allLoads[i].device, ack: true}); }
				if (allLoads[i].type !== null) { this.setState(allLoads[i].device + '.type', {val: allLoads[i].type, ack: true}); }

				if (allLoads[i].id !== null) { this.setState(allLoads[i].device + '.' + allLoads[i].device + '_' + allLoads[i].id + '.id', {val: allLoads[i].id, ack: true}); }
				if (allLoads[i].channel !== null) { this.setState(allLoads[i].device + '.' + allLoads[i].device + '_' + allLoads[i].id + '.channel', {val: allLoads[i].channel, ack: true}); }
				if (allLoads[i].unused !== null) { this.setState(allLoads[i].device + '.' + allLoads[i].device + '_' + allLoads[i].id + '.unused', {val: allLoads[i].unused, ack: true}); }
				if (allLoads[i].name !== null) { this.setState(allLoads[i].device + '.' + allLoads[i].device + '_' + allLoads[i].id + '.name', {val: allLoads[i].name, ack: true}); }
				if (allLoads[i].room !== null) { this.setState(allLoads[i].device + '.' + allLoads[i].device + '_' + allLoads[i].id + '.room', {val: allLoads[i].room, ack: true}); }
				if (allLoads[i].kind !== null) { this.setState(allLoads[i].device + '.' + allLoads[i].device + '_' + allLoads[i].id + '.room', {val: allLoads[i].kind, ack: true}); }
			}
			this.log.debug('allLoads filled in ...');
		} else {
			this.log.debug('No "allLoads" found. Nothing updated...');
		}
	}
*/
/*
	async fillAllStates(allLoads, allLoadsStates) {

		const allLoadsAllLoadsStates = allLoads.map(a => Object.assign(a, allLoadsStates.find(b => b.id === a.id)));
		this.log.debug('fillInStates(): "fillAllStates": ' + JSON.stringify(allLoadsAllLoadsStates));

		if (allLoadsAllLoadsStates.length !== 0) {
			this.log.debug('starting "fillAllStates" for ' + allLoadsAllLoadsStates.length + ' device' + (allLoadsAllLoadsStates.length > 1 ? 's' : '') + ' ...');
			for (let i = 0; i < allLoadsAllLoadsStates.length; i++) {
				if (allLoadsAllLoadsStates[i].type === 'onoff') {
					if (statesUpdate) {
						if (allLoadsAllLoadsStates[i].state.bri !== undefined && allLoadsAllLoadsStates[i].state.bri !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.ACTIONS.bri', {val: allLoadsAllLoadsStates[i].state.bri, ack: true}); }
					}
				} else if (allLoadsAllLoadsStates[i].type === 'dim') {
					if (statesUpdate) {
						if (allLoadsAllLoadsStates[i].state.bri !== undefined && allLoadsAllLoadsStates[i].state.bri !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.ACTIONS.bri', {val: allLoadsAllLoadsStates[i].state.bri, ack: true}); }
					}
					if (allLoadsAllLoadsStates[i].state.flags !== null) {
						if (allLoadsAllLoadsStates[i].state.flags.over_current !== undefined && allLoadsAllLoadsStates[i].state.flags.over_current !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.flags.over_current', {val: allLoadsAllLoadsStates[i].state.flags.over_current, ack: true}); }
						if (allLoadsAllLoadsStates[i].state.flags.fading !== undefined && allLoadsAllLoadsStates[i].state.flags.fading !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.flags.fading', {val: allLoadsAllLoadsStates[i].state.flags.fading, ack: true}); }
						if (allLoadsAllLoadsStates[i].state.flags.noise !== undefined && allLoadsAllLoadsStates[i].state.flags.noise !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.flags.noise', {val: allLoadsAllLoadsStates[i].state.flags.noise, ack: true}); }
						if (allLoadsAllLoadsStates[i].state.flags.direction !== undefined && allLoadsAllLoadsStates[i].state.flags.direction !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.flags.direction', {val: allLoadsAllLoadsStates[i].state.flags.direction, ack: true}); }
						if (allLoadsAllLoadsStates[i].state.flags.over_temperature !== undefined && allLoadsAllLoadsStates[i].state.flags.over_temperature !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.flags.over_temperature', {val: allLoadsAllLoadsStates[i].state.flags.over_temperature, ack: true}); }
					}
				} else if (allLoadsAllLoadsStates[i].type === 'motor') {
					if (statesUpdate) {
						if (allLoadsAllLoadsStates[i].state.level !== undefined && allLoadsAllLoadsStates[i].state.level !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.ACTIONS.level', {val: allLoadsAllLoadsStates[i].state.level, ack: true}); }
						if (allLoadsAllLoadsStates[i].state.tilt !== undefined && allLoadsAllLoadsStates[i].state.tilt !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.ACTIONS.tilt', {val: allLoadsAllLoadsStates[i].state.tilt, ack: true}); }
						//if (allLoadsAllLoadsStates[i].state.moving !== undefined && allLoadsAllLoadsStates[i].state.moving !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.ACTIONS.moving', {val: allLoadsAllLoadsStates[i].state.moving, ack: true}); }
					}
					if (allLoadsAllLoadsStates[i].state.flags !== null) {
						if (allLoadsAllLoadsStates[i].state.flags.direction !== undefined && allLoadsAllLoadsStates[i].state.flags.direction !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.flags.direction', {val: allLoadsAllLoadsStates[i].state.flags.direction, ack: true}); }
						if (allLoadsAllLoadsStates[i].state.flags.learning !== undefined && allLoadsAllLoadsStates[i].state.flags.learning !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.flags.learning', {val: allLoadsAllLoadsStates[i].state.flags.learning, ack: true}); }
						if (allLoadsAllLoadsStates[i].state.flags.moving !== undefined && allLoadsAllLoadsStates[i].state.flags.moving !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.flags.moving', {val: allLoadsAllLoadsStates[i].state.flags.moving, ack: true}); }
						if (allLoadsAllLoadsStates[i].state.flagsunder_current !== undefined && allLoadsAllLoadsStates[i].state.flags.under_current !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.flags.under_current', {val: allLoadsAllLoadsStates[i].state.flags.under_current, ack: true}); }
						if (allLoadsAllLoadsStates[i].state.flags.over_current !== undefined && allLoadsAllLoadsStates[i].state.flags.over_current !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.flags.over_current', {val: allLoadsAllLoadsStates[i].state.flags.over_current, ack: true}); }
						if (allLoadsAllLoadsStates[i].state.flags.timeout !== undefined && allLoadsAllLoadsStates[i].state.flags.timeout !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.flags.timeout', {val: allLoadsAllLoadsStates[i].state.flags.timeout, ack: true}); }
						if (allLoadsAllLoadsStates[i].state.flags.locked !== undefined && allLoadsAllLoadsStates[i].state.flags.locked !== null) { this.setState(allLoadsAllLoadsStates[i].device + '.' + allLoadsAllLoadsStates[i].device + '_' + allLoadsAllLoadsStates[i].id + '.flags.locked', {val: allLoadsAllLoadsStates[i].state.flags.locked, ack: true}); }
					}
				}
			}
			statesUpdate = true;

			this.log.debug('"AllStates" filled in ...');
		} else {
			this.log.debug('No "AllStates" found. Nothing updated...');
		}
	}

	async fillRssi(allLoads, rssi) {
		if (allLoads[0].device !== null) { this.setState('info.rssi', {val: rssi.rssi, ack: true}); }
	}
*/
	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			this.setState('info.connection', false, true);
			this.updateInterval && clearInterval(this.updateInterval);
			this.updateInterval2 && clearInterval(this.updateInterval2);
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

		//for (let i = 0; i < Object.keys(loads.data).length; i++)
		if (state !== null && state !== undefined && state.val !== null && state.val !== undefined) {
			if (state.ack === false) {

				this.log.debug('id: ' + id + '; state: ' + JSON.stringify(state));

				const device = id.split('.')[2];
				this.log.debug('device: ' + device);
				const loadID = (id.split('.')[3]).split('_')[1];
				this.log.debug('loadID: ' + loadID);
				const load = (id.split('.')[5]);
				this.log.debug('load: ' + load);

				const APIID = this.allLoads.find(obj => obj.device === device);
				this.log.debug('APIID.type: ' + APIID.type);

				let sendData;

				switch (APIID.type) {
					case 'onoff':
						if (state.val > 0) {
							sendData = {bri : 10000};
						} else {
							sendData = {bri : 0};
						}
						break;
					case 'dim':
						sendData = {bri : state.val};
						break;
					case 'motor':
						if (load === 'level') {
							sendData = {level: state.val};
						} else if (load === 'tilt') {
							sendData = {tilt: state.val};
						} else if (load === 'leveltilt') {
							sendData = state.val;
						}
						break;
				}

				this.log.debug('valData: ' + JSON.stringify(sendData));

				axios({
					method: 'PUT',
					url: 'http://' + this.config.gatewayIP + '/api/loads/' + loadID + '/target_state',
					headers: {
						'Authorization': 'Bearer ' + this.config.authToken + '\'',
						'Content-Type': 'application/json; charset=UTF-8'
					},
					data: sendData
				})
					.then((response) => {
						this.log.debug('response.data: ' + JSON.stringify(response.data));
						this.log.debug('response.status: ' + response.status);
						//this.log.debug('response.statusText: ' + response.statusText);
						this.log.debug('response.headers: ' + JSON.stringify(response.headers));
						this.log.debug('response.config: ' + JSON.stringify(response.config));

						//this.log.debug('response.data.data.target_state: ' + JSON.stringify(response.data.data.target_state));
						this.log.debug('Object.keys(response.data.data.target_state)[0]: ' + Object.keys(response.data.data.target_state)[0]);

						if (Object.keys(response.data.data.target_state)[0] === 'bri') {
							this.setState(id, {val: response.data.data.target_state.bri, ack: true});
						} else if (Object.keys(response.data.data.target_state)[0] === 'tilt' && Object.keys(response.data.data.target_state)[1] === 'level') {
							//f.ex.: {"level":3000, "tilt":3}
							this.setState(id, {val: null, ack: true});
							this.setState(id.substring(0, id.length - 9) + 'level', {val: response.data.data.target_state.level, ack: true});
							this.setState(id.substring(0, id.length - 9) + 'tilt', {val: response.data.data.target_state.tilt, ack: true});
						} else if (Object.keys(response.data.data.target_state)[0] === 'tilt') {
							this.setState(id, {val: response.data.data.target_state.tilt, ack: true});
						} else if (Object.keys(response.data.data.target_state)[0] === 'level') {
							this.setState(id, {val: response.data.data.target_state.level, ack: true});
						}

						statesUpdate = false;
					})
					.catch((error) => {
						if (error.response) {
							// The request was made and the server responded with a status code that falls out of the range of 2xx
							this.log.debug('error data: ' + error.response.data);
							this.log.debug('error status: ' + error.response.status);
							this.log.debug('error headers: ' + error.response.headers);
						} else if (error.request) {
							// The request was made but no response was received `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js
							this.log.debug('error request: ' + error);
						} else {
							// Something happened in setting up the request that triggered an Error
							this.log.debug('error message: ' + error.message);
						}
						this.log.debug('error.config: ' + JSON.stringify(error.config));
					});
			} else {
				// The state was changed by system
				//this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack}). NO ACTION PERFORMED.`);
			}
		} else {
			// The state was deleted
			this.log.debug(`state ${id} was changed. NO ACTION PERFORMED.`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	onMessage(obj) {
		if (typeof obj === 'object' && obj.message) {
			if (obj.command === 'getAuthToken') {

				this.log.info('Try to obtain authorization token from ' + obj.message.gatewayIP + ' with username ' + obj.message.username + ' (Press Button on blinking device!)');

				const messageObj = {};

				axios({
					method: 'POST',
					url: 'http://' + obj.message.gatewayIP + '/api/account/claim',
					headers: {
						'Content-Type': 'application/json'
					},
					data: {'user': obj.message.username},
					timeout: 30000
				})
					.then((response) => {
						this.log.debug('response.data: ' + JSON.stringify(response.data));
						this.log.debug('response.status: ' + response.status);
						//this.log.debug('response.statusText: ' + response.statusText);
						this.log.debug('response.headers: ' + JSON.stringify(response.headers));
						this.log.debug('response.config: ' + JSON.stringify(response.config));
						this.log.debug('response.data.data.user: ' + response.data.data.user);
						this.log.debug('response.data.data.secret: ' + response.data.data.secret);

						messageObj.message = 'SuccessGetAuthToken';
						messageObj.authToken = response.data.data.secret;

						this.log.info('Got new authentication token: ' + response.data.data.secret);
					})
					.catch((error) => {
						if (error.response) {
							// The request was made and the server responded with a status code that falls out of the range of 2xx
							this.log.debug('error data: ' + error.response.data);
							this.log.debug('error status: ' + error.response.status);
							this.log.debug('error headers: ' + error.response.headers);
						} else if (error.request) {
							// The request was made but no response was received `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js
							this.log.debug('error request: ' + error);
							messageObj.message = error;
						} else {
							// Something happened in setting up the request that triggered an Error
							this.log.debug('error message: ' + error.message);
						}
						this.log.debug('error.config: ' + JSON.stringify(error.config));

					})
					.finally(() => {
						//this.log.debug('obj.callback: ' + JSON.stringify(obj.callback) + '; obj.from: ' + obj.from + '; obj.command: ' + JSON.stringify(obj.command) + '; messageObj: ' + JSON.stringify(messageObj) + '; obj.callback: ' + JSON.stringify(obj.callback) );
						if (obj.callback) this.sendTo(obj.from, obj.command, messageObj, obj.callback);
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