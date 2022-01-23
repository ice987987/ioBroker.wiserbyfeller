![Logo](admin/wiserbyfeller.png)
# ioBroker.wiserbyfeller

[![NPM version](https://img.shields.io/npm/v/iobroker.wiserbyfeller.svg)](https://www.npmjs.com/package/iobroker.wiserbyfeller)
[![Downloads](https://img.shields.io/npm/dm/iobroker.wiserbyfeller.svg)](https://www.npmjs.com/package/iobroker.wiserbyfeller)
![Number of Installations](https://iobroker.live/badges/wiserbyfeller-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/wiserbyfeller-stable.svg)
[![Dependency Status](https://img.shields.io/david/ice987987/iobroker.wiserbyfeller.svg)](https://david-dm.org/ice987987/iobroker.wiserbyfeller)

[![NPM](https://nodei.co/npm/iobroker.wiserbyfeller.png?downloads=true)](https://nodei.co/npm/iobroker.wiserbyfeller/)

**Tests:** ![Test and Release](https://github.com/ice987987/ioBroker.wiserbyfeller/workflows/Test%20and%20Release/badge.svg)

## wiserbyfeller adapter for ioBroker

This Adapter enables you to manage all your Wiser-by-Feller system devices.

## Installation requirements

* Node >=12.x is required
* js-controller >=3.x is required
* Installed Wiser by Feller devices are required. More information can be found here: [Wiser by Feller](https://wiser.feller.ch/de/professionals).

## Supported Devices
* Wiser switchable light 1-channel #3401
* Wiser switchable light 2-channel #3402
* Wiser blind switch 1-channel #3404
* Wiser blind switch 2-channel #3405
* Wiser LED-universaldimmer 1-channel #3406
* Wiser LED-universaldimmer 2-channel #3407

## Usage
Trigger changes on states in folder `ACTONS`.

**Wiser switchable light:**

To turn on or off a load set the attribute `bri` (brightness) to the following values:
* Turn off set the `bri` attribute to `0`
* Turn on set the `bri` attribute to `10000`

**Wiser blind switch:**

On a motor e.g. shutter/blind you can set the target level between 0% and 100% (0 - 10000) and a tilt value.
* To set the shutter in open position set the `level` attribute to `0`
* To set the shutter in close position set the `level` attribute to `10000`
* To control the shutter set the `level` attribute between `1` and `10000` (e.g. set `level` to 5000, means set the shutter/blind to position 50%)
* To control slats of a shutter (number of tilt) set the `tilt` attribute to a value `0` - `9`. Finally it's the motor running time, because we don't know the slat position in degrees.
* To control the position and the tilt attribute, set the `leveltilt` attribute to value `{"level": 3000, "tilt": 3}`

**Wiser LED-universaldimmer**

On a dimmable light you can set the target brightness between 0% and 100% (0 - 10000).
* Turn off set the `bri` attribute to `0`
* To dim set the `bri` attribute between `1` and `10000` (e.g. set `bri` to 5000, means 50% of brightness)

<!-- 
**The Embedded Web Interface**
Еven without the mobile app, Wiser-by-Feller WLAN device can be set and controlled through a browser and WiFi connection of a mobile phone, tablet or PC (please make sure, that the device is not connetced to the cloud service -> see reset guideline in the manual).

Procedure:
1. Install Wiser-by-Feller WLAN device
2. After first connection to power, Wiser-by-Feller WLAN device has created an own WiFi network, with name (SSID) such as `wiser-000xxxxx`. Connect to it with your phone, tablet or PC and enter passwort, provided together with the device (sticker).
3. Type `192.168.0.1` in your browser
4. Fill in `New Registration` and press the button on the device to continue
5. Log in
6. Go to `settings` -> `Network settings` -> `Add new WLAN`
7. Enter your credentials and press button `Add WLAN`
8. Press button `Reboot Now!`
9. Log out and discconnect your phone, tablet or PC from the Wiser-by-Feller WLAN device
10. Get IP-Address of Wiser-by-Feller WLAN device in your router
11. Enter `IP-Adress` of Wiser-by-Feller WLAN device in settings of the Instance `Gateway-IP`
12. Enter `username` of Wiser-by-Feller WLAN device in settings of the Instance `username`
-->

## Changelog

### __WORK IN PROGRESS__
* (ice987987) description of several datapoints renamed
* (ice987987) icons added for main datapoints
* (ice987987) update year
* (ice987987) move DP rssi in info-folder

### v0.0.1 (28.12.2021)
* (ice987978) initial release

## License
MIT License

Copyright (c) 2021-2022 ice987987 <mathias.frei@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
