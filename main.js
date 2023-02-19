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

let allLoads = [];
let firstStart = true;

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

				// get device Info
				await this.getDeviceInfo();

				// get all devices
				await this.getAllDevices();

				// get all loads
				await this.getAllLoads();

				// get RSSI
				await this.getRssi();

				// get jobs
				await this.getJobs();

				// open WebSocket connection
				await this.connectToWS();

			} catch (error) {
				this.log.error(`${error} (ERR_#002)`);
			}

		} else {
			this.log.error('Wiser Gateway-IP and/or username and/or "authentification token" not set and/or not valid. (ERR_#003)');
		}
	}

	async getDeviceInfo() {
		await this.requestClient({
			method: 'GET',
			url: `http://${this.config.gatewayIP}/api/info`,
			headers: {
				Authorization: `Bearer ${this.config.authToken}`,
			},
		})
			.then(async (response) => {
				this.log.debug(`[getDeviceInfo()]: HTTP status response: ${response.status} ${response.statusText}; config: ${JSON.stringify(response.config)}; headers: ${JSON.stringify(response.headers)}; data: ${JSON.stringify(response.data)}`);

				if (firstStart) {
					await this.createDeviceInfo();
				}
				await this.fillDeviceInfo(response.data.data);
			})
			.catch((error) => {
				if (error.response) {
					// The request was made and the server responded with a status code that falls out of the range of 2xx
					this.log.debug(`[getDeviceInfo()]: HTTP status response: ${error.response.status}; headers: ${JSON.stringify(error.response.headers)}; data: ${JSON.stringify(error.response.data)}`);
				} else if (error.request) {
					// The request was made but no response was received `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js
					this.log.debug(`[getDeviceInfo()] error request: ${error}`);
				} else {
					// Something happened in setting up the request that triggered an Error
					this.log.debug(`[getDeviceInfo()] error message: ${error.message}`);
				}
				this.log.debug(`[getDeviceInfo()] error.config: ${JSON.stringify(error.config)}`);
				throw new Error('Wiser Gateway not reachable. Please check Wiser Gateway connection and/or authentification token. (ERR_#0xx)');
			});
	}

	// Attention: This service takes very long time at the first call! Approx. 1 second per device. So with 60 devices it takes 1 minute.
	async getAllDevices() {
		await this.requestClient({
			method: 'GET',
			url: `http://${this.config.gatewayIP}/api/devices/*`,
			headers: {
				Authorization: `Bearer ${this.config.authToken}`,
			},
		})
			.then(async (response) => {
				this.log.debug(`[getAllDevices]: HTTP status response: ${response.status} ${response.statusText}; config: ${JSON.stringify(response.config)}; headers: ${JSON.stringify(response.headers)}; data: ${JSON.stringify(response.data)}`);

				if (firstStart) {
					await this.createDevices(response.data.data);
				}
				await this.fillAllDevices(response.data.data);

			})
			.catch((error) => {
				if (error.response) {
					// The request was made and the server responded with a status code that falls out of the range of 2xx
					this.log.debug(`[getAllDevices()]: HTTP status response: ${error.response.status}; headers: ${JSON.stringify(error.response.headers)}; data: ${JSON.stringify(error.response.data)}`);
				} else if (error.request) {
					// The request was made but no response was received `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js
					this.log.debug(`[getAllDevices()] error request: ${error}`);
				} else {
					// Something happened in setting up the request that triggered an Error
					this.log.debug(`[getAllDevices()] error message: ${error.message}`);
				}
				this.log.debug(`[getAllDevices()] error.config: ${JSON.stringify(error.config)}`);
				throw new Error('Wiser Gateway not reachable. Please check Wiser Gateway connection and/or authentification token. (ERR_#008)');
			});
	}

	async getAllLoads() {
		await this.requestClient({
			method: 'GET',
			url: `http://${this.config.gatewayIP}/api/loads`,
			headers: {
				Authorization: `Bearer ${this.config.authToken}`,
			},
		})
			.then(async (response) => {
				this.log.debug(`[getAllLoads]: HTTP status response: ${response.status} ${response.statusText}; config: ${JSON.stringify(response.config)}; headers: ${JSON.stringify(response.headers)}; data: ${JSON.stringify(response.data)}`);

				allLoads = response.data.data;

				if (firstStart) {
					await this.createLoads(response.data.data);
				}
				await this.fillAllLoads(response.data.data);
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

	async getRssi() {
		await this.requestClient({
			method: 'GET',
			url: `http://${this.config.gatewayIP}/api/net/rssi`,
			headers: {
				Authorization: `Bearer ${this.config.authToken}`,
			},
		})
			.then(async (response) => {
				this.log.debug(`[getRssi()]: HTTP status response: ${response.status} ${response.statusText}; config: ${JSON.stringify(response.config)}; headers: ${JSON.stringify(response.headers)}; data: ${JSON.stringify(response.data)}`);

				if (firstStart) {
					await this.createRssi();
					firstStart = false;
				}
				await this.fillRssi(response.data.data);

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

	async getJobs() {
		await this.requestClient({
			method: 'GET',
			url: `http://${this.config.gatewayIP}/api/jobs`,
			headers: {
				Authorization: `Bearer ${this.config.authToken}`,
			},
		})
			.then(async (response) => {
				this.log.debug(`[getJobs()]: HTTP status response: ${response.status} ${response.statusText}; config: ${JSON.stringify(response.config)}; headers: ${JSON.stringify(response.headers)}; data: ${JSON.stringify(response.data)}`);

				const jobs = response.data.data;

				await this.requestClient({
					method: 'GET',
					url: `http://${this.config.gatewayIP}/api/system/flags`,
					headers: {
						Authorization: `Bearer ${this.config.authToken}`,
					},
				})
					.then(async (response) => {
						this.log.debug(`[getJobs()]: HTTP status response: ${response.status} ${response.statusText}; config: ${JSON.stringify(response.config)}; headers: ${JSON.stringify(response.headers)}; data: ${JSON.stringify(response.data)}`);

						const flags = response.data.data;
						this.log.debug(`[getJobs()]: jobs: ${JSON.stringify(jobs)}; flags ${JSON.stringify(flags)}`);

						if (response.data.data.lenght !== 0) {
							await this.createJobs(jobs, flags);
						}

					})
					.catch((error) => {
						if (error.response) {
							// The request was made and the server responded with a status code that falls out of the range of 2xx
							this.log.debug(`[getJobs()]: HTTP status response: ${error.response.status}; headers: ${JSON.stringify(error.response.headers)}; data: ${JSON.stringify(error.response.data)}`);
						} else if (error.request) {
							// The request was made but no response was received `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js
							this.log.debug(`[getJobs()] error request: ${error}`);
						} else {
							// Something happened in setting up the request that triggered an Error
							this.log.debug(`[getJobs()] error message: ${error.message}`);
						}
						this.log.debug(`[getJobs()] error.config: ${JSON.stringify(error.config)}`);
						throw new Error('Wiser Gateway not reachable. Please check Wiser Gateway connection and/or authentification token. (ERR_#0xx)');
					});
			})
			.catch((error) => {
				if (error.response) {
					// The request was made and the server responded with a status code that falls out of the range of 2xx
					this.log.debug(`[getJobs()]: HTTP status response: ${error.response.status}; headers: ${JSON.stringify(error.response.headers)}; data: ${JSON.stringify(error.response.data)}`);
				} else if (error.request) {
					// The request was made but no response was received `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js
					this.log.debug(`[getJobs()] error request: ${error}`);
				} else {
					// Something happened in setting up the request that triggered an Error
					this.log.debug(`[getJobs()] error message: ${error.message}`);
				}
				this.log.debug(`[getJobs()] error.config: ${JSON.stringify(error.config)}`);
				throw new Error('Wiser Gateway not reachable. Please check Wiser Gateway connection and/or authentification token. (ERR_#0xx)');
			});
	}

	async createDeviceInfo() {
		await this.setObjectNotExistsAsync('info.device', {
			type: 'channel',
			common: {
				name: 'Device Information',
			},
			native: {},
		});
		await this.setObjectNotExistsAsync('info.device.instance_id', {
			type: 'state',
			common: {
				name: 'Unique Nubes Cloud instance ID of µGateway',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});
		await this.setObjectNotExistsAsync('info.device.sn', {
			type: 'state',
			common: {
				name: 'Serial number of µGateway',
				type: 'string',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});
		await this.setObjectNotExistsAsync('info.device.sw', {
			type: 'state',
			common: {
				name: 'Version of µGateway Software',
				type: 'string',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});
		await this.setObjectNotExistsAsync('info.device.api', {
			type: 'state',
			common: {
				name: 'Version of µGateway ReST API',
				type: 'string',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});
		await this.setObjectNotExistsAsync('info.device.product', {
			type: 'state',
			common: {
				name: 'Product Name',
				type: 'string',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});
		await this.setObjectNotExistsAsync('info.device.boot', {
			type: 'state',
			common: {
				name: 'Version of µGateway Bootloader',
				type: 'string',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});
		await this.setObjectNotExistsAsync('info.device.hw', {
			type: 'state',
			common: {
				name: 'Version of µGateway Hardware',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});
	}

	async createDevices(devices) {
		// this.log.debug(`createDevices(): ${JSON.stringify(devices)}`);

		for (let i = 0; i < devices.length; i++) {
			let deviceIcon = '';
			switch (devices[i].a.hw_id) {
				case '0x2110':
					deviceIcon = 'icons/0x2110.svg';
					break;
				case '0x2301':
					deviceIcon = 'icons/0x2301.svg';
					break;
				case '0x1202':
					deviceIcon = 'icons/0x1202.svg';
					break;
				default:
					deviceIcon = 'icons/unknown.svg';
			}
			// create device
			await this.setObjectNotExistsAsync(devices[i].id, {
				type: 'device',
				common: {
					name: devices[i].a.comm_name,
					icon: deviceIcon,
				},
				native: {},
			});
			// create channel
			await this.setObjectNotExistsAsync(`${devices[i].id}.a`, {
				type: 'channel',
				common: {
					name: 'A-Block information.'
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.a.hw_id`, {
				type: 'state',
				common: {
					name: 'Hardware ID, actual assembly variant, defined by the HWID Resistor on the PCBA.',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.a.nubes_id`, {
				type: 'state',
				common: {
					name: 'Unique ID to identify the device in the Cloud.',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.a.fw_version`, {
				type: 'state',
				common: {
					name: 'Firmware Version, consists of Major, Minor, Patch and Build Number.',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.a.address`, {
				type: 'state',
				common: {
					name: 'Unique 28-Bit K+ Address',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.a.comm_name`, {
				type: 'state',
				common: {
					name: 'Commercial name. A-BLOCK Feller article name.',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.a.serial_nr`, {
				type: 'state',
				common: {
					name: 'Unique Serialnumber',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.a.fw_id`, {
				type: 'state',
				common: {
					name: 'A Firmware project generates an image file (fhx) with a specific FWID.',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.a.comm_ref`, {
				type: 'state',
				common: {
					name: 'Commercial reference. A-BLOCK Feller article number.',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			// create channel
			await this.setObjectNotExistsAsync(`${devices[i].id}.c`, {
				type: 'channel',
				common: {
					name: 'C-Block information'
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.c.hw_id`, {
				type: 'state',
				common: {
					name: 'Hardware ID, actual assembly variant, defined by the HWID Resistor on the PCBA.',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.c.nubes_id`, {
				type: 'state',
				common: {
					name: 'Unique ID to identify the device in the Cloud.',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.c.fw_version`, {
				type: 'state',
				common: {
					name: 'Firmware Version, consists of Major, Minor, Patch and Build Number.',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.c.cmd_matrix`, {
				type: 'state',
				common: {
					name: 'Command matrix selection defines the button functionality of C-Block.',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.c.comm_name`, {
				type: 'state',
				common: {
					name: 'Commercial name. C-BLOCK Feller article name.',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.c.serial_nr`, {
				type: 'state',
				common: {
					name: 'Unique Serialnumber',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.c.fw_id`, {
				type: 'state',
				common: {
					name: 'C Firmware project generates an image file (fhx) with a specific FWID.',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${devices[i].id}.c.comm_ref`, {
				type: 'state',
				common: {
					name: 'Commercial reference. C-BLOCK Feller article number.',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});

			for (let j = 0; j < devices[i].outputs.length; j++) {
				// create channel
				await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}`, {
					type: 'channel',
					common: {
						name: `${devices[i].a.comm_name} - Load ID: ${devices[i].outputs[j].load}`
					},
					native: {},
				});
				await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.type`, {
					type: 'state',
					common: {
						name: 'Device Main-Type',
						type: 'string',
						role: 'value',
						read: true,
						write: false,
					},
					native: {},
				});
				await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.sub_type`, {
					type: 'state',
					common: {
						name: 'Device Sub-Type',
						type: 'string',
						role: 'value',
						read: true,
						write: false,
					},
					native: {},
				});
				await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.load`, {
					type: 'state',
					common: {
						name: 'Load ID',
						type: 'number',
						role: 'value',
						read: true,
						write: false,
					},
					native: {},
				});

				if (devices[i].outputs[j].type === 'onoff') { // main-type "onoff"
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS`, {
						type: 'channel',
						common: {
							name: 'ACTIONS',
						},
						native: {},
					});
					if (devices[i].outputs[j].sub_type === '') { // sub-type ""
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.BRI`, {
							type: 'state',
							common: {
								name: 'Power on/off',
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
						this.subscribeStates(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.BRI`);
					} else if (devices[i].outputs[j].sub_type === 'dto') { // sub-type "dto"
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.BRI`, {
							type: 'state',
							common: {
								name: 'Power on/off',
								type: 'boolean',
								role: 'button',
								read: true,
								write: true
							},
							native: {},
						});
						this.subscribeStates(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.BRI`);
					} else {
						this.log.warn(`createDevices(): Sub-Type "${devices[i].outputs[j].sub_type}" unknown. Device not created.`);
					}
				} else if (devices[i].outputs[j].type === 'dim') { // main-type "dim"
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS`, {
						type: 'channel',
						common: {
							name: 'ACTIONS',
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.BRI`, {
						type: 'state',
						common: {
							name: 'Brightness',
							type: 'number',
							role: 'level.dimmer',
							min: 0,
							max: 10000,
							read: true,
							write: true,
						},
						native: {},
					});
					this.subscribeStates(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.BRI`);
					// create channel
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags`, {
						type: 'channel',
						common: {
							name: 'flags',
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.over_current`, {
						type: 'state',
						common: {
							name: 'over_current',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.fading`, {
						type: 'state',
						common: {
							name: 'fading',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.direction`, {
						type: 'state',
						common: {
							name: 'direction',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.over_temperature`, {
						type: 'state',
						common: {
							name: 'over_temperature',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
				} else if (devices[i].outputs[j].type === 'dali') { // main-type "dali"
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS`, {
						type: 'channel',
						common: {
							name: 'ACTIONS',
						},
						native: {},
					});
					if (devices[i].outputs[j].sub_type === '') { // sub-type ''
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.BRI`, {
							type: 'state',
							common: {
								name: 'Brightness',
								type: 'number',
								role: 'level.dimmer',
								min: 0,
								max: 10000,
								read: true,
								write: true,
							},
							native: {},
						});
						this.subscribeStates(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.BRI`);
					} else if (devices[i].outputs[j].sub_type === 'tw') { // sub-type 'tw'
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.BRI`, {
							type: 'state',
							common: {
								name: 'Brightness',
								type: 'number',
								role: 'level.dimmer',
								min: 0,
								max: 10000,
								read: true,
								write: true,
							},
							native: {},
						});
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.CT`, {
							type: 'state',
							common: {
								name: 'Color temperature',
								type: 'number',
								role: 'level.color.temperature',
								min: 1000,
								max: 20000,
								read: true,
								write: true,
							},
							native: {},
						});
						this.subscribeStates(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.BRI`);
						this.subscribeStates(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.CT`);
					} else if (devices[i].outputs[j].sub_type === 'rgb') { // sub-type "rgb"
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.BRI`, {
							type: 'state',
							common: {
								name: 'Brightness',
								type: 'number',
								role: 'level.dimmer',
								min: 0,
								max: 10000,
								read: true,
								write: true,
							},
							native: {},
						});
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.RED`, {
							type: 'state',
							common: {
								name: 'Color Red',
								type: 'number',
								role: 'level.color.red',
								min: 0,
								max: 255,
								read: true,
								write: true,
							},
							native: {},
						});
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.GREEN`, {
							type: 'state',
							common: {
								name: 'Color Green',
								type: 'number',
								role: 'level.color.green',
								min: 0,
								max: 255,
								read: true,
								write: true,
							},
							native: {},
						});
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.BLUE`, {
							type: 'state',
							common: {
								name: 'Color Blue',
								type: 'number',
								role: 'level.color.blue',
								min: 0,
								max: 255,
								read: true,
								write: true,
							},
							native: {},
						});
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.WHITE`, {
							type: 'state',
							common: {
								name: 'Color White',
								type: 'number',
								role: 'level.color.white',
								min: 0,
								max: 255,
								read: true,
								write: true,
							},
							native: {},
						});
						this.subscribeStates(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.BRI`);
						this.subscribeStates(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.RED`);
						this.subscribeStates(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.GREEN`);
						this.subscribeStates(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.BLUE`);
						this.subscribeStates(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.WHITE`);

						// create channel
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags`, {
							type: 'channel',
							common: {
								name: 'flags',
							},
							native: {},
						});
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.short_circuit`, {
							type: 'state',
							common: {
								name: 'short_circuit',
								type: 'number',
								role: 'value',
								read: true,
								write: false,
							},
							native: {},
						});
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.fading`, {
							type: 'state',
							common: {
								name: 'fading',
								type: 'number',
								role: 'value',
								read: true,
								write: false,
							},
							native: {},
						});
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.noise`, {
							type: 'state',
							common: {
								name: 'noise',
								type: 'number',
								role: 'value',
								read: true,
								write: false,
							},
							native: {},
						});
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.direction`, {
							type: 'state',
							common: {
								name: 'direction',
								type: 'number',
								role: 'value',
								read: true,
								write: false,
							},
							native: {},
						});
						await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.rx_error`, {
							type: 'state',
							common: {
								name: 'rx_error',
								type: 'number',
								role: 'value',
								read: true,
								write: false,
							},
							native: {},
						});
					} else {
						this.log.warn(`createDevices(): Sub-Type "${devices[i].outputs[j].sub_type}" unknown. Device not created.`);
					}
				} else if (devices[i].outputs[j].type === 'motor') { // main-type "motor"
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS`, {
						type: 'channel',
						common: {
							name: 'ACTIONS',
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.LEVEL`, {
						type: 'state',
						common: {
							name: 'Blind level',
							type: 'number',
							role: 'level.blind',
							min: 0,
							max: 10000,
							read: true,
							write: true,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.TILT`, {
						type: 'state',
						common: {
							name: 'Blind tilt',
							type: 'number',
							role: 'level.tilt',
							min: 0,
							max: 9,
							read: true,
							write: true,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.leveltilt`, {
						type: 'channel',
						common: {
							name: 'Set blind with level and tilt',
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.leveltilt.level`, {
						type: 'state',
						common: {
							name: 'Blind level',
							type: 'number',
							role: 'value',
							min: 0,
							max: 10000,
							read: true,
							write: true,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.leveltilt.tilt`, {
						type: 'state',
						common: {
							name: 'Blind tilt',
							type: 'number',
							role: 'value',
							min: 0,
							max: 9,
							read: true,
							write: true,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.leveltilt.SET`, {
						type: 'state',
						common: {
							name: 'Set Blind',
							type: 'boolean',
							role: 'button',
							def: false,
							read: true,
							write: true,
						},
						native: {},
					});
					this.subscribeStates(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.LEVEL`);
					this.subscribeStates(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.TILT`);
					this.subscribeStates(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.ACTIONS.leveltilt.SET`);
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.moving`, {
						type: 'state',
						common: {
							name: 'moving',
							type: 'string',
							role: 'value',
							read: true,
							write: false
						},
						native: {}
					});
					// create channel
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags`, {
						type: 'channel',
						common: {
							name: 'flags',
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.direction`, {
						type: 'state',
						common: {
							name: 'direction',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.learning`, {
						type: 'state',
						common: {
							name: 'learning',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.moving`, {
						type: 'state',
						common: {
							name: 'moving',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.under_current`, {
						type: 'state',
						common: {
							name: 'under_current',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.over_current`, {
						type: 'state',
						common: {
							name: 'over_current',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.timeout`, {
						type: 'state',
						common: {
							name: 'timeout',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setObjectNotExistsAsync(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.flags.locked`, {
						type: 'state',
						common: {
							name: 'locked',
							type: 'number',
							role: 'value',
							read: true,
							write: false,
						},
						native: {},
					});
				} else {
					this.log.warn(`createDevices(): Main-Type "${devices[i].outputs[j].type}" unknown. Device not created.`);
				}
			}
		}
	}

	async createLoads(loads) {
		this.log.debug(`createLoads(): ${JSON.stringify(loads)}`);

		for (let i = 0; i < loads.length; i++) {
			await this.setObjectNotExistsAsync(`${loads[i].device}.${loads[i].device}_${loads[i].id}.unused`, {
				type: 'state',
				common: {
					name: 'Flag to indicate that the underlying load is currently not used (no load is physically connected to that channel)',
					type: 'boolean',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${loads[i].device}.${loads[i].device}_${loads[i].id}.name`, {
				type: 'state',
				common: {
					name: 'Name of the load',
					type: 'string',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync(`${loads[i].device}.${loads[i].device}_${loads[i].id}.channel`, {
				type: 'state',
				common: {
					name: 'Reference ID to the physical device',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
		}
	}

	async createRssi() {
		await this.setObjectNotExistsAsync('info.rssi', {
			type: 'state',
			common: {
				name: 'Received Signal Strength Indication of the Gateway device.',
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
	}

	async createJobs(jobs, flags) {
		await this.setObjectNotExistsAsync(`jobs`, {
			type: 'channel',
			common: {
				name: 'Jobs',
			},
			native: {},
		});

		for (let i = 0; i < jobs.length; i++) {
			await this.setObjectNotExistsAsync(`jobs.${jobs[i].flag_values[0].flag}`, {
				type: 'state',
				common: {
					name: `Job: ${flags.find((sID) => sID.id === jobs[i].flag_values[0].flag).name}`,
					type: 'boolean',
					role: 'value',
					read: true,
					write: false,
				},
				native: {},
			});
		}
	}

	async fillDeviceInfo(deviceInfo) {
		this.setState('info.device.instance_id', { val: deviceInfo.instance_id, ack: true });
		this.setState('info.device.sn', { val: deviceInfo.sn, ack: true });
		this.setState('info.device.sw', { val: deviceInfo.sw, ack: true });
		this.setState('info.device.api', { val: deviceInfo.api, ack: true });
		this.setState('info.device.product', { val: deviceInfo.product, ack: true });
		this.setState('info.device.boot', { val: deviceInfo.boot, ack: true });
		deviceInfo.hw ? this.setState('info.device.hw', { val: deviceInfo.hw, ack: true }) : 0;
	}

	async fillAllDevices(devices) {
		// TODO
		for (let i = 0; i < devices.length; i++) {
			this.setState(`${devices[i].id}.a.hw_id`, { val: `${devices[i].a.hw_id}`, ack: true });
			this.setState(`${devices[i].id}.a.nubes_id`, { val: `${devices[i].a.nubes_id}`, ack: true });
			this.setState(`${devices[i].id}.a.fw_version`, { val: `${devices[i].a.fw_version}`, ack: true });
			this.setState(`${devices[i].id}.a.address`, { val: `${devices[i].a.address}`, ack: true });
			this.setState(`${devices[i].id}.a.comm_name`, { val: `${devices[i].a.comm_name}`, ack: true });
			this.setState(`${devices[i].id}.a.serial_nr`, { val: `${devices[i].a.serial_nr}`, ack: true });
			this.setState(`${devices[i].id}.a.fw_id`, { val: `${devices[i].a.fw_id}`, ack: true });
			this.setState(`${devices[i].id}.a.comm_ref`, { val: `${devices[i].a.comm_ref}`, ack: true });
			this.setState(`${devices[i].id}.c.hw_id`, { val: `${devices[i].c.hw_id}`, ack: true });
			this.setState(`${devices[i].id}.c.nubes_id`, { val: `${devices[i].c.nubes_id}`, ack: true });
			this.setState(`${devices[i].id}.c.fw_version`, { val: `${devices[i].c.fw_version}`, ack: true });
			this.setState(`${devices[i].id}.c.cmd_matrix`, { val: `${devices[i].c.cmd_matrix}`, ack: true });
			this.setState(`${devices[i].id}.c.comm_name`, { val: `${devices[i].c.comm_name}`, ack: true });
			this.setState(`${devices[i].id}.c.serial_nr`, { val: `${devices[i].c.serial_nr}`, ack: true });
			this.setState(`${devices[i].id}.c.fw_id`, { val: `${devices[i].c.fw_id}`, ack: true });
			this.setState(`${devices[i].id}.c.comm_ref`, { val: `${devices[i].c.comm_ref}`, ack: true });

			for (let j = 0; j < devices[i].outputs.length; j++) {
				this.setState(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.type`, { val: devices[i].outputs[j].type, ack: true });
				this.setState(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.sub_type`, { val: devices[i].outputs[j].sub_type, ack: true });
				this.setState(`${devices[i].id}.${devices[i].id}_${devices[i].outputs[j].load}.load`, { val: devices[i].outputs[j].load, ack: true });
			}
		}
	}

	async fillAllLoads(loads) {
		for (let i = 0; i < loads.length; i++) {
			this.setState(`${loads[i].device}.${loads[i].device}_${loads[i].id}.unused`, { val: loads[i].unused, ack: true });
			this.setState(`${loads[i].device}.${loads[i].device}_${loads[i].id}.name`, { val: loads[i].name, ack: true });
			this.setState(`${loads[i].device}.${loads[i].device}_${loads[i].id}.channel`, { val: loads[i].channel, ack: true });
		}
	}

	async fillRssi(rssi) {
		this.setState('info.rssi', { val: rssi.rssi, ack: true });
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


			try {
				if (message.load !== undefined) {
					const deviceID = allLoads.find((sID) => sID.id === message.load.id).device;
					const loadType = allLoads.find((sID) => sID.id === message.load.id).type;
					const loadSubtype = allLoads.find((sID) => sID.id === message.load.id).sub_type;
					// this.log.debug(`[wss.on - message]: deviceID: ${deviceID}; loadType: ${loadType}; loadSubtype: ${loadSubtype}`);

					if (loadType === 'onoff') {
						if (loadSubtype === '') {
							this.setState(`${deviceID}.${deviceID}_${message.load.id}.ACTIONS.BRI`, { val: message.load.state.bri, ack: true });
						} else if (loadSubtype === 'dto') {
							this.setState(`${deviceID}.${deviceID}_${message.load.id}.ACTIONS.BRI`, { val: message.load.state.bri === 10000 ? true : false, ack: true });
						} else {
							this.log.warn(`[wss.on - message]: loadSubtype "${loadSubtype}" of loadType "${loadType}" unknown.`);
						}
					} else if (loadType === 'dim') {
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.ACTIONS.BRI`, { val: message.load.state.bri, ack: true });

						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.over_current`, { val: message.load.state.flags.over_current, ack: true });
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.fading`, { val: message.load.state.flags.fading, ack: true });
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.direction`, { val: message.load.state.flags.direction, ack: true });
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.over_temperature`, { val: message.load.state.flags.over_temperature, ack: true });
					} else if (loadType === 'dali') {
						if (loadSubtype === '') {
							this.setState(`${deviceID}.${deviceID}_${message.load.id}.ACTIONS.BRI`, { val: message.load.state.bri, ack: true });
						} else if (loadSubtype === 'tw') {
							this.setState(`${deviceID}.${deviceID}_${message.load.id}.ACTIONS.BRI`, { val: message.load.state.bri, ack: true });
							this.setState(`${deviceID}.${deviceID}_${message.load.id}.ACTIONS.CT`, { val: message.load.state.ct, ack: true });
						} else if (loadSubtype === 'rgb') {
							this.setState(`${deviceID}.${deviceID}_${message.load.id}.ACTIONS.BRI`, { val: message.load.state.bri, ack: true });
							this.setState(`${deviceID}.${deviceID}_${message.load.id}.ACTIONS.RED`, { val: message.load.state.red, ack: true });
							this.setState(`${deviceID}.${deviceID}_${message.load.id}.ACTIONS.GREEN`, { val: message.load.state.green, ack: true });
							this.setState(`${deviceID}.${deviceID}_${message.load.id}.ACTIONS.BLUE`, { val: message.load.state.blue, ack: true });
							this.setState(`${deviceID}.${deviceID}_${message.load.id}.ACTIONS.WHITE`, { val: message.load.state.white, ack: true });
						} else {
							this.log.warn(`[wss.on - message]: loadSubtype "${loadSubtype}" of loadType "${loadType}" unknown.`);
						}
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.short_circuit`, { val: message.load.state.flags.short_circuit, ack: true });
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.fading`, { val: message.load.state.flags.fading, ack: true });
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.noise`, { val: message.load.state.flags.noise, ack: true });
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.direction`, { val: message.load.state.flags.direction, ack: true });
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.rx_error`, { val: message.load.state.flags.rx_error, ack: true });
					} else if (loadType === 'motor') {
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.ACTIONS.LEVEL`, { val: message.load.state.level, ack: true });
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.ACTIONS.TILT`, { val: message.load.state.tilt, ack: true });

						this.setState(`${deviceID}.${deviceID}_${message.load.id}.moving`, { val: message.load.state.moving, ack: true });
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.direction`, { val: message.load.state.flags.direction, ack: true });
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.learning`, { val: message.load.state.flags.learning, ack: true });
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.moving`, { val: message.load.state.flags.moving, ack: true });
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.under_current`, { val: message.load.state.flags.under_current, ack: true });
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.over_current`, { val: message.load.state.flags.over_current, ack: true });
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.timeout`, { val: message.load.state.flags.timeout, ack: true });
						this.setState(`${deviceID}.${deviceID}_${message.load.id}.flags.locked`, { val: message.load.state.flags.locked, ack: true });
					} else {
						this.log.info('[wss.on - message]: Unknown device. Nothing Set. (ERR_#004)');
					}
				} else if (message.flag !== undefined) {
					this.setState(`jobs.${message.flag.id}`, { val: message.flag.value, ack: true });
				} else {
					this.log.info('[wss.on - message]: Unknown message. Nothing Set. (ERR_#0xx)');
				}

			} catch (error) {
				// do nothing
				this.log.debug(`[wss.on - message]: ${error}`);
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
	/**
		 * Is called when adapter shuts down - callback has to be called under any circumstances!
		 * @param {() => void} callback
		 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active

			this.setState('info.connection', false, true);

			this.log.info('cleaned everything up... (#1)');
			callback();
		} catch (e) {
			this.log.info('cleaned everything up... (#2)');
			callback();
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
				this.log.debug(`[onStateChange]: id: ${id}; state: ${JSON.stringify(state)}`);

				const deviceID = id.split('.')[2];
				this.log.debug(`[onStateChange]: deviceID: ${deviceID}`);
				const loadID = id.split('.')[3].split('_')[1];
				this.log.debug(`[onStateChange]: loadID: ${loadID}`);
				const load = id.split('.')[5];
				this.log.debug(`[onStateChange]: load: ${load}`);
				const deviceType = allLoads.find((sID) => sID.device === deviceID).type;
				this.log.debug(`[onStateChange]: deviceType: ${deviceType}`);
				const deviceSubtype = allLoads.find((sID) => sID.device === deviceID).sub_type;
				this.log.debug(`[onStateChange]: deviceSubtype: ${deviceSubtype}`);

				let sendData = {};

				switch (deviceType) {
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
					case 'dali':
						if (deviceSubtype === '') {
							sendData = { bri: state.val };
						} else if (deviceSubtype === 'tw') {
							this.log.warn(`[onStateChange]: Dali "tw" not yet supported`);
						} else if (deviceSubtype === 'rgb') {
							this.log.warn(`[onStateChange]: Dali "rgb" not yet supported`);
						} else {
							this.log.warn(`[onStateChange]: Dali "${deviceSubtype}" unknown`);
						}
						break;
					case 'motor':
						if (load === 'LEVEL') {
							sendData = { level: state.val };
						} else if (load === 'TILT') {
							sendData = { tilt: state.val };
						} else if (load === 'leveltilt') {
							const idSplit = id.split('.');
							const parentPath = idSplit.slice(0, idSplit.length - 1).join('.');
							this.log.debug(`[onStateChange]: parentPath: ${parentPath}`);

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

				this.log.debug(`[onStateChange]: sendData: ${JSON.stringify(sendData)}`);

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