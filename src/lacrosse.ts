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
        name: z.string().optional(),
        ownerId: z.string().optional(),
      })
      .passthrough(),
  ),
})

export const deviceSchema = z
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
  .passthrough()

const devicesSchema = z.object({
  items: z.array(deviceSchema),
})

const dataSchema = z.object({
  unit_enum: z.number(),
  unit: z.enum(['degrees_celsius', 'degrees_fahrenheit', 'relative_humidity', 'millibars']),
  spot: z.object({
    value: z.number(),
    time: z.number(),
    attributes: z.object({}),
  }),
  data_points: z.number(),
})

const deviceStatusSchema = z
  .object({
    time_zone: z.string(),
    status: z.object({
      health: z.string(),
      battery_status: z.enum(['low', 'charged']).or(z.string()),
      battery_level: z.number(),
    }),
    last_update: z.number(),
    data: z.object({
      current: z.object({
        Temperature: dataSchema.optional(),
        Humidity: dataSchema.optional(),
        HeatIndex: dataSchema.optional(),
        BarometricPressure: dataSchema.optional(),
      }),
    }),
  })
  .passthrough()

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

type Temperature = z.infer<typeof deviceStatusSchema>['data']['current']['Temperature']

export default class LaCrosseAPI {
  private client: Got

  constructor(email: string, password: string) {
    this.client = got.extend({
      prefixUrl: 'https://lax-gateway.appspot.com/_ah/api/lacrosseClient/v1.1/active-user',
      responseType: 'json',
      resolveBodyOnly: true,
      headers: {
        'User-Agent': 'okhttp/5.0.0-alpha.11',
      },
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
    const allLocationIds = await this.getLocations().then(locations => locations.map(location => location.id))

    const devices = await Promise.all(
      (locationIds || allLocationIds).map(async locationId => {
        const body = await this.client.get(`location/${locationId}/sensorAssociations`).then(devicesSchema.parse)
        return body.items
      }),
    )

    return devices.flat()
  }

  async getRawDeviceStatus(deviceId: string): Promise<unknown> {
    const userDevice = `ref.user-device.${deviceId}`

    const response = await this.client.get(`active-user/device-association/${userDevice}/status`, {
      prefixUrl: 'https://ingv2.lacrossetechnology.com/api/v1.1',
    })

    return response
  }

  async getDeviceStatus(deviceId: string) {
    const response = await this.getRawDeviceStatus(deviceId).then(deviceStatusSchema.parse)
    const data = response.data.current

    return {
      temperature: convertToCelcius(data.Temperature)?.spot.value,
      humidity: data.Humidity?.spot.value,
      heatIndex: convertToCelcius(data.HeatIndex)?.spot.value,
      barometricPressure: data.BarometricPressure?.spot.value,
      battery: response.status.battery_level,
    }
  }
}

function convertToCelcius(temperature?: Temperature) {
  if (!temperature) return temperature
  if (temperature.unit === 'degrees_celsius') {
    return temperature
  }
  if (temperature.unit === 'degrees_fahrenheit') {
    temperature.spot.value = (temperature.spot.value - 32) * (5 / 9)
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
