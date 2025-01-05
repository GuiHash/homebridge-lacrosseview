import got, { type Got, HTTPError, RequestError } from 'got'
import { LRUCache } from 'lru-cache'
import { z } from 'zod'

const cache = new LRUCache({ max: 1 })

const loginSchema = z
  .object({
    kind: z.string().optional(),
    localId: z.string().optional(),
    email: z.string().optional(),
    displayName: z.string().optional(),
    idToken: z.string(),
    registered: z.boolean().optional(),
    refreshToken: z.string().optional(),
    expiresIn: z.coerce.number(),
  })
  .passthrough()

const locationsSchema = z.object({
  items: z.array(
    z
      .object({
        id: z.string(),
        modifiedOn: z.string().optional(),
        createdOn: z.string().optional(),
        shallow: z.boolean().optional(),
        weight: z.string().optional(),
        flaggedForSynchVNext: z.boolean().optional(),
        name: z.string().optional(),
        ownerId: z.string().optional(),
      })
      .passthrough(),
  ),
})

const devicesSchema = z.object({
  items: z.array(
    z
      .object({
        id: z.string(),
        modifiedOn: z.string().optional(),
        createdOn: z.string().optional(),
        shallow: z.boolean().optional(),
        weight: z.string().optional(),
        flaggedForSynchVNext: z.boolean().optional(),
        name: z.string(),
        sensor: z
          .object({
            id: z.string(),
            modifiedOn: z.string().optional(),
            createdOn: z.string().optional(),
            shallow: z.boolean().optional(),
            type: z
              .object({
                id: z.string().optional().optional(),
                shallow: z.boolean().optional(),
                category: z.number().optional(),
                name: z.string(),
                internalName: z.string().optional(),
                description: z.string().optional(),
                image: z.string().optional(),
              })
              .passthrough(),
            series: z.string().optional(),
            serial: z.string(),
            fields: z
              .object({
                notSupported: z.number().optional(),
                Temperature: z.number().optional(),
                Humidity: z.number().optional(),
                HeatIndex: z.number().optional(),
                BarometricPressure: z.number().optional(),
              })
              .passthrough()
              .optional(),
            category: z.number().optional(),
            sensorTypeEntityId: z.string().optional(),
          })
          .passthrough(),
        sensorId: z.string().optional(),
        locationId: z.string(),
        ownerId: z.string().optional(),
      })
      .passthrough(),
  ),
})

const dataSchema = z.object({
  values: z.array(z.object({ u: z.number(), s: z.number() })),
  unit_enum: z.number(),
  unit: z.enum(['degrees_celsius', 'degrees_fahrenheit', 'relative_humidity', 'millibars']),
})

const rawWeatherDataSchema = z.record(
  z.string(),
  z.object({
    'ai.ticks.1': z.object({
      fields: z.object({
        Temperature: dataSchema.optional(),
        Humidity: dataSchema.optional(),
        HeatIndex: dataSchema.optional(),
        BarometricPressure: dataSchema.optional(),
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

type Temperature = z.infer<typeof rawWeatherDataSchema>[string]['ai.ticks.1']['fields']['Temperature']

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

  @formatError
  async getLocations() {
    const body = await this.client.get('locations').then(locationsSchema.parse)

    return body.items
  }

  @formatError
  async getDevices(locationIds?: string[]) {
    const allLocationIds =
      locationIds ?? (await this.getLocations().then(locations => locations.map(location => location.id)))

    const devices = await Promise.all(
      allLocationIds!.map(async locationId => {
        const body = await this.client.get(`location/${locationId}/sensorAssociations`).then(devicesSchema.parse)
        return body.items
      }),
    )

    return devices.flat()
  }

  async rawWeatherData(deviceId: string) {
    // Get data from the last 12 hours
    const from = Date.now() - 12 * 60 * 60 * 1000

    const userDevice = `ref.user-device.${deviceId}`
    const aggregates = 'ai.ticks.1'

    const data = await this.client
      .get(`device-association/${userDevice}/feed`, {
        prefixUrl: 'https://ingv2.lacrossetechnology.com/api/v1.1/active-user',
        searchParams: {
          from: Math.floor(from / 1000),
          aggregates,
          types: 'spot',
        },
      })
      .then(rawWeatherDataSchema.parse)

    if (!data[userDevice]) {
      throw new Error(`No data for device ${userDevice}`)
    }

    return data[userDevice][aggregates]
  }

  @formatError
  async getDeviceWeatherData(deviceId: string) {
    const data = await this.rawWeatherData(deviceId)

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

function convertToCelcius(temperature?: Temperature) {
  if (!temperature) return temperature
  if (temperature.unit === 'degrees_celsius') {
    return temperature
  }
  if (temperature.unit === 'degrees_fahrenheit') {
    temperature.values = temperature.values.map(({ u, s }) => ({ u, s: (s - 32) * (5 / 9) }))
    return temperature
  }

  throw new Error(`Unit ${temperature.unit} cannot be converted to celcius`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatError<This, Args extends any[], Return>(target: (this: This, ...args: Args) => Promise<Return>) {
  async function replacementMethod(this: This, ...args: Args) {
    try {
      const result = await target.call(this, ...args)
      return result
    } catch (e: unknown) {
      throw handleError(e)
    }
  }

  return replacementMethod
}

function handleError(error: unknown) {
  if (error instanceof HTTPError) {
    return new Error(error.response.body?.error?.message || error.response.body?.error, { cause: error })
  } else if (error instanceof RequestError) {
    return new Error(error.response?.body?.error?.message || error.response?.body?.error.message, { cause: error })
  } else if (error instanceof Error) {
    return new Error(error.message, { cause: error })
  }

  return new Error('Unknown error', { cause: error })
}
