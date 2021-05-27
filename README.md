# Homebridge La Crosse View

[![npm](https://badgen.net/npm/v/homebridge-lacrosseview) ![npm](https://badgen.net/npm/dt/homebridge-lacrosseview)](https://www.npmjs.com/package/homebridge-lacrosseview)

[Homebridge](https://homebridge.io) Plugin Providing La Crosse View ([iOS](https://apps.apple.com/app/la-crosse-view/id1006925791), [android](https://play.google.com/store/apps/details?id=com.lacrosseview.app)) sensors support

## Compatible sensors

Any La Crosse Technology **temperature** or **humidity** sensor compatible with **La Crosse View** system.

> [List of La Cross View system sensor compatible](https://www.lacrossetechnology.com/collections/lacrosse-view-connected)

## Requirements

- a La Crosse View account ([iOS](https://apps.apple.com/app/la-crosse-view/id1006925791), [android](https://play.google.com/store/apps/details?id=com.lacrosseview.app))
- [compatible sensor](#Compatible%20sensors) added to La Crosse View account

## Installation

Before installing this plugin, you should install Homebridge using the [official instructions](https://github.com/homebridge/homebridge/wiki).

### Install via Homebridge Config UI X

1. Search for `La Crosse View` on the Plugins tab of [Config UI X](https://www.npmjs.com/package/homebridge-config-ui-x).
2. Install the `Homebridge La Crosse View` plugin and use the form to enter your La Crosse View application credentials.

### Manual Installation

1. Install this plugin using: `sudo npm install -g homebridge-lacrosseview --unsafe-perm`.
2. Edit `config.json` manually to add your La Crosse View credentials. See below for instructions on that.

## Configuration

It is recommended to use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) to setup the configuration if you don't want to manually edit JSON files.

```json
"platforms": [{
  "platform": "LaCrosseView",
  "email": "your-la-crossse-view@email.com",
  "password": "your-la-crosse-view-password",

  "devicesToExclude": ["id-device"],
  "locationsToExclude": ["id-location"],
  "pollingInterval": 200,
  "fakeGatoEnabled": false
}]
```

- `platform`: _(Required)_ Must always be set to `LaCrosseVieww`.
- `email`: _(Required)_ Your La Crosse View application email
- `password`: _(Required)_ Your La Crosse View application password
- `pollingInterval`: Interval in seconds to update data _(Default to `200`)_
- `devicesToExclude`: Device ids to exclude _(Default to `[]`)_
- `locationsToExclude`: Location ids to exclude _(Default to `[]`)_
- `fakeGatoEnabled`: If historical data should be reported to the Elgato Eve App _(Default to `false`)_
- `fakeGatoStoragePath`: Custom path where to save fakegato history _(Default to homebridge user path)_

> You can find device / location ids in your homebridge logs in [debug mode](https://github.com/homebridge/homebridge/wiki/Basic-Troubleshooting#debug-mode)

## Elgato Eve

This plugin has support for adding historical data to the [Elgato Eve App](https://itunes.apple.com/us/app/elgato-eve/id917695792) by using the excellent module [fakegato-history](https://github.com/simont77/fakegato-history).

To enable the Elgato Eve feature set `fakeGatoEnabled` to `true` in `config.json`

```json
{
  "fakeGatoEnabled": true
}
```

[fakegato-history](https://github.com/simont77/fakegato-history) caches historical values into a json-file.
Usually located in `/var/lib/homebridge` or `~/.homebridge`. To customise this one can set `fakeGatoStoragePath` to the desired path:

```json
{
  "fakeGatoStoragePath": "/tmp/"
}
```

## Acknowledgements

- Keith Prickett and Stuart Kuredjian for the original code to access La Crossse View API:
  - https://github.com/keithprickett/lacrosse_weather
  - https://github.com/dbconfession78/py_weather_station
- [The homebridge team](https://github.com/orgs/homebridge/people) for homebridge and [homebridge-plugin-template](https://github.com/homebridge/homebridge-plugin-template)
