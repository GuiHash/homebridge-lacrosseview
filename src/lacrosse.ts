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
  humidity?: number
  temperature?: number
  barometricPressure?: number
  heatIndex?: number
}

type ResponseLogin = {
  idToken: string
  expiresIn: string
  kind: string
  localId: string
  displayName?: string
  registered: boolean
  refreshToken: string
}

export type Device = {
  id: string
  modifiedOn: Date
  name: string
  sensor: Sensor
  createdOn: Date
  shallow: boolean
  weight: string
  flaggedForSynchVNext: boolean
  sensorId: string
  locationId: string
  ownerId: string
}

// TODO complete types
type Sensor = {
  fields: [string]
}

export type Location = {
  id: string
  name: string
}

enum Unit {
  Celcius = 'degrees_celsius',
  Fahrenheit = 'degrees_fahrenheit',
  RelativeHumidity = 'relative_humidity',
  Millibars = 'millibars',
}

type DataField = {
  values: [{ u: number; s: number }]
  unit_enum: number
  unit: Unit
}

type RawWeatherData = {
  [key: string]: {
    [key: string]: {
      time_zone: string
      range: {
        unix: { to: number; from: number; continue: number }
        iso8601: {
          to: Date
          from: Date
          continue: Date
        }
      }
      fields: {
        Temperature?: DataField
        Humidity?: DataField
        HeatIndex?: DataField
        BarometricPressure?: DataField
      }
    }
  }
}

export default class LaCrosseAPI {
  private email: string
  private password: string
  private token: { expiresAt: number; value: string }

  constructor(email: string, password: string) {
    this.email = email
    this.password = password
    this.token = { expiresAt: Date.now(), value: '' }
  }

  private async renewTokenIfNeeded() {
    if (Date.now() > this.token.expiresAt) {
      await this.login()
    }
  }

  private async login() {
    const json = {
      email: this.email,
      password: this.password,
      returnSecureToken: true,
    }

    const { idToken: value, expiresIn }: ResponseLogin = await fetch(LACROSSE_LOGIN_URL, {
      json,
      method: 'POST',
    })

    if (!value) {
      throw new Error('Login Failed. Check credentials and try again')
    }

    this.token = { value, expiresAt: Date.now() + Number(expiresIn) * 1000 - 1000 }
  }

  async getLocations(): Promise<Location[]> {
    await this.renewTokenIfNeeded()
    const body: ResponseData<Location> = await fetch(LACROSSE_LOCATION_URL, undefined, this.token.value)

    return body.items
  }

  async getDevices(locations?: Location[]): Promise<Device[]> {
    await this.renewTokenIfNeeded()
    if (!locations) {
      locations = await this.getLocations()
    }

    const result: Device[] = []
    for (const location of locations) {
      const url = LACROSSE_DEVICES_URL.replace('%ID%', location.id)
      const body: ResponseData<Device> = await fetch(url, undefined, this.token.value)

      result.push(...body.items)
    }

    return result
  }

  async getDeviceWeatherData(device: Device): Promise<DeviceWeatherData> {
    await this.renewTokenIfNeeded()

    const url = LACROSSE_WEATHER_URL.replace('%DEVICE_ID%', device.id)
    const tz = 'Europe/Paris'
    const fields = Object.keys(device.sensor.fields).join()

    // Data is updated each 200000ms on the api and we want only the last update
    const from = Date.now() - 200000

    const data: RawWeatherData = await fetch(
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
      this.token.value,
    )

    const dataFields = data[`ref.user-device.${device.id}`]?.['ai.ticks.1']?.fields

    const valuesTemperature = convertToCelcius(dataFields?.Temperature)?.values
    const valuesHunidity = dataFields?.Humidity?.values
    const valuesHeatIndex = convertToCelcius(dataFields?.HeatIndex)?.values
    const valuesBarometricPressure = dataFields?.BarometricPressure?.values

    return {
      humidity: getLastValue(valuesHunidity),
      temperature: getLastValue(valuesTemperature),
      barometricPressure: getLastValue(valuesBarometricPressure),
      heatIndex: getLastValue(valuesHeatIndex),
    }
  }
}

function getLastValue(values?: { u: number; s: number }[]): number | undefined {
  return values?.pop()?.s
}

function convertToCelcius(temperature?): DataField {
  if (!temperature) return temperature
  if (temperature.unit === Unit.Celcius) {
    return temperature
  }
  if (temperature.unit === Unit.Fahrenheit) {
    temperature.values = temperature.values.map(({ u, s }) => ({ u, s: (s - 32) * (5 / 9) }))

    return temperature
  }

  throw new Error(`Unit ${temperature.unit} cannot be converted to celcius`)
}

interface fetch {
  (url: string | URL, options: Options): Promise<ResponseLogin>
  (url: string | URL, options: Options, token: string): Promise<RawWeatherData>
  <T>(url: string | URL, options: Options | undefined, token: string): Promise<ResponseData<T>>
}

const fetch: fetch = async function <T>(url, options?, token?): Promise<T> {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}

  const { searchParams, json, method } = options || {}

  try {
    return await got(url, {
      method,
      resolveBodyOnly: true,
      responseType: 'json',
      headers,
      searchParams,
      json,
    })
  } catch (e) {
    throw new Error(e.response?.body?.error?.message || e.message)
  }
}
