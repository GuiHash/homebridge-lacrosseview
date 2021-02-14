import got, { Options } from 'got'
import { URL } from 'url'

const LACROSSE_LOGIN_URL =
  'https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=AIzaSyD-Uo0hkRIeDYJhyyIg-TvAv8HhExARIO4'
const LACROSSE_LOCATION_URL = 'https://lax-gateway.appspot.com/_ah/api/lacrosseClient/v1.1/active-user/locations'
const LACROSSE_DEVICES_URL =
  'https://lax-gateway.appspot.com/_ah/api/lacrosseClient/v1.1/active-user/location/%ID%/sensorAssociations?prettyPrint=false'
const LACROSSE_WEATHER_URL =
  'https://ingv2.lacrossetechnology.com/api/v1.1/active-user/device-association/ref.user-device.%DEVICE_ID%/feed'

interface ResponseData<T> {
  items: [T]
}

export type DeviceWeatherData = {
  humidity: number
  temperature: number
  barometricPressure: number
  heatIndex: number
}

// TODO complete types

interface ResponseLogin {
  idToken: string
}

type Sensor = {
  fields: [string]
}

type Device = {
  id: string
  name: string
  sensor: Sensor
}

type Location = {
  id: string
}

type RawWeatherData = Record<string, unknown>

export default class LaCrosseAPI {
  private token: string
  private email: string
  private password: string

  constructor(email: string, password: string) {
    this.email = email
    this.password = password
    this.token = ''
  }

  private async login() {
    const json = {
      email: this.email,
      password: this.password,
      returnSecureToken: true,
    }

    // TODO manage 400 errors
    const body: ResponseLogin = await fetch(LACROSSE_LOGIN_URL, {
      json,
      method: 'POST',
    })

    const token = body.idToken

    if (!token) {
      throw new Error('Login Failed. Check credentials and try again')
    }

    this.token = token
  }

  async getLocations(): Promise<Location[]> {
    if (!this.token) {
      await this.login()
    }
    const body: ResponseData<Location> = await fetch(LACROSSE_LOCATION_URL, undefined, this.token)

    return body.items
  }

  async getDevices(locations?: Location[]): Promise<Device[]> {
    if (!this.token) {
      await this.login()
    }
    if (!locations) {
      locations = await this.getLocations()
    }
    for (const location of locations) {
      const url = LACROSSE_DEVICES_URL.replace('%ID%', location.id)
      const body: ResponseData<Device> = await fetch(url, undefined, this.token)

      // TODO manage multiple locations ?
      return body.items
    }

    return []
  }

  async getDeviceWeatherData(device: Device): Promise<DeviceWeatherData> {
    if (!this.token) {
      await this.login()
    }

    const url = LACROSSE_WEATHER_URL.replace('%DEVICE_ID%', device.id)
    const tz = 'Europe/Paris'
    const fields = Object.keys(device.sensor.fields).join()

    // Data is updated each 200000ms and we want only the last update
    const from = Date.now() - 200000

    const data: ResponseData<RawWeatherData> = await fetch(
      url,
      {
        searchParams: {
          fields,
          tz,
          from: Math.floor(from / 1000),
          aggregates: 'ai.ticks.1',
          types: 'spot',
        },
      },
      this.token,
    )

    const dataFields = data[`ref.user-device.${device.id}`]['ai.ticks.1'].fields

    const valuesTemperature = dataFields.Temperature?.values
    const valuesHunidity = dataFields.Humidity?.values
    const valuesHeatIndex = dataFields.HeatIndex?.values
    const valuesBarometricPressure = dataFields.BarometricPressure?.values

    const lastTemperature = valuesTemperature?.pop().s
    const lastHumidity = valuesHunidity?.pop().s
    const lastHeatIndex = valuesHeatIndex?.pop().s
    const lastBarometricPressure = valuesBarometricPressure?.pop().s

    return {
      humidity: lastHumidity,
      temperature: lastTemperature,
      barometricPressure: lastBarometricPressure,
      heatIndex: lastHeatIndex,
    }
  }
}

interface fetch {
  <T>(url: string | URL, options: Options | undefined, token: string): Promise<ResponseData<T>>
  (url: string | URL, options: Options): Promise<ResponseLogin>
}

const fetch: fetch = async function <T>(url, options?, token?): Promise<T> {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}

  const { searchParams, json, method } = options || {}

  return got(url, {
    method,
    resolveBodyOnly: true,
    responseType: 'json',
    headers,
    searchParams,
    json,
  })
}
