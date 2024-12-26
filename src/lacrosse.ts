import got, { Got } from 'got'
import { LRUCache } from 'lru-cache'
import { z } from 'zod'

const cache = new LRUCache({ max: 1 })

const loginSchema = z.object({
  kind: z.string(),
  localId: z.string(),
  email: z.string(),
  displayName: z.string(),
  idToken: z.string(),
  registered: z.boolean(),
  refreshToken: z.string(),
  expiresIn: z.coerce.number(),
})

const locationsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      modifiedOn: z.string(),
      createdOn: z.string(),
      shallow: z.boolean(),
      weight: z.string(),
      flaggedForSynchVNext: z.boolean(),
      name: z.string(),
      ownerId: z.string(),
    }),
  ),
})

const devicesSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      modifiedOn: z.string(),
      createdOn: z.string(),
      shallow: z.boolean(),
      weight: z.string(),
      flaggedForSynchVNext: z.boolean(),
      name: z.string(),
      sensor: z
        .object({
          id: z.string(),
          modifiedOn: z.string(),
          createdOn: z.string(),
          shallow: z.boolean(),
          type: z.object({
            id: z.string(),
            shallow: z.boolean(),
            category: z.number(),
            name: z.string(),
            internalName: z.string(),
            description: z.string(),
            image: z.string(),
            fields: z.object({
              notSupported: z.number().optional(),
              Temperature: z.number().optional(),
              Humidity: z.number().optional(),
              HeatIndex: z.number().optional(),
              BarometricPressure: z.number().optional(),
            }),
          }),
          series: z.string(),
          serial: z.string(),
          controlCode: z.number(),
          verificationCode: z.string(),
          attributes: z.object({
            factory: z.string(),
            Composite: z.string(),
            display: z.string(),
            'data-stream': z.string(),
            'device-glyph': z.string(),
          }),
          fields: z.object({
            notSupported: z.number().optional(),
            Temperature: z.number().optional(),
            Humidity: z.number().optional(),
            HeatIndex: z.number().optional(),
            BarometricPressure: z.number().optional(),
          }),
          permissions: z.object({
            owner: z.boolean(),
            read: z.boolean(),
            subscribe: z.boolean(),
            claim: z.boolean(),
            admin: z.boolean(),
            share: z.boolean(),
            'admin.geo': z.boolean(),
            'admin.smartview': z.boolean(),
          }),
          category: z.number(),
          sensorTypeEntityId: z.string(),
        })
        .passthrough(),
      sensorId: z.string(),
      locationId: z.string(),
      ownerId: z.string(),
    }),
  ),
})

const rawWeatherDataSchema = z.record(
  z.string(),
  z.object({
    'ai.ticks.1': z.object({
      time_zone: z.string(),
      range: z.object({
        unix: z.object({ to: z.number(), from: z.number(), continue: z.number() }),
        iso8601: z.object({
          to: z.string(),
          from: z.string(),
          continue: z.string(),
        }),
      }),
      fields: z.object({
        Temperature: z
          .object({
            values: z.array(z.object({ u: z.number(), s: z.number() })),
            unit_enum: z.number(),
            unit: z.string(),
          })
          .optional(),
        Humidity: z
          .object({
            values: z.array(z.object({ u: z.number(), s: z.number() })),
            unit_enum: z.number(),
            unit: z.string(),
          })
          .optional(),
        HeatIndex: z
          .object({
            values: z.array(z.object({ u: z.number(), s: z.number() })),
            unit_enum: z.number(),
            unit: z.string(),
          })
          .optional(),
        BarometricPressure: z
          .object({
            values: z.array(z.object({ u: z.number(), s: z.number() })),
            unit_enum: z.number(),
            unit: z.enum(['millibars']),
          })
          .optional(),
      }),
    }),
  }),
)

async function getToken(email: string, password: string) {
  const token = cache.get('idToken')

  if (token) {
    return token
  }

  const { idToken, expiresIn } = await got
    .post('https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword', {
      searchParams: {
        key: 'AIzaSyD-Uo0hkRIeDYJhyyIg-TvAv8HhExARIO4',
      },
      json: { email, password, returnSecureToken: true },
      responseType: 'json',
      resolveBodyOnly: true,
    })
    .then(loginSchema.parse)

  cache.set('idToken', idToken, { ttl: expiresIn * 1000 })

  return idToken
}

type Device = z.infer<typeof devicesSchema>['items'][number]

type Location = z.infer<typeof locationsSchema>['items'][number]

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

export default class LaCrosseAPI {
  private client: Got

  constructor(email: string, password: string) {
    this.client = got.extend({
      prefixUrl: 'https://lax-gateway.appspot.com/_ah/api/lacrosseClient/v1.1/active-user',
      responseType: 'json',
      resolveBodyOnly: true,
      hooks: {
        beforeRequest: [
          async options => {
            const token = await getToken(email, password)
            options.headers['Authorization'] = `Bearer ${token}`
          },
        ],
      },
    })
  }

  async getLocations() {
    const body = await this.client.get('locations').then(locationsSchema.parse)

    return body.items
  }

  async getDevices(locations?: Location[]): Promise<Device[]> {
    if (!locations) {
      locations = await this.getLocations()
    }

    const devices = await Promise.all(
      locations.map(async location => {
        const body = await this.client.get(`location/${location.id}/sensorAssociations`).then(devicesSchema.parse)
        return body.items
      }),
    )

    return devices.flat()
  }

  async rawWeatherData(device: Device) {
    const fields = Object.keys(device.sensor.fields).join()

    // Get data from the last 12 hours
    const from = Date.now() - 12 * 60 * 60 * 1000

    const userDevice = `ref.user-device.${device.id}`
    const aggregates = 'ai.ticks.1'

    const data = await this.client
      .get(`device-association/${userDevice}/feed`, {
        prefixUrl: 'https://ingv2.lacrossetechnology.com/api/v1.1/active-user',
        searchParams: {
          fields,
          from: Math.floor(from / 1000),
          aggregates,
          types: 'spot',
        },
      })
      .then(rawWeatherDataSchema.parse)

    return data[userDevice][aggregates]
  }

  async getDeviceWeatherData(device: Device) {
    const data = await this.rawWeatherData(device)

    const dataFields = data?.fields

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
