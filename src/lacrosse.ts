import got, { type Got, HTTPError, RequestError } from 'got'
import { LRUCache } from 'lru-cache'
import { z, ZodError } from 'zod'
import util from 'node:util'

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
            WindSpeed: z.number().optional(),
            Rain: z.number().optional(),
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
  items: z
    .array(deviceSchema)
    // It needs to be optional here because when a location is empty without any devices/sensors it returns an empty object, see https://github.com/GuiHash/homebridge-lacrosseview/issues/112
    // To handle that we have to transform the undefined value to an empty array
    .optional()
    .transform(items => items || []),
})

const dataSchema = z.object({
  unit_enum: z.number(),
  // Known units are listed for documentation; any other string is accepted so that new sensor
  // types (e.g. wind speed) don't make the whole status payload fail validation.
  unit: z.enum(['degrees_celsius', 'degrees_fahrenheit', 'relative_humidity', 'millibars']).or(z.string()),
  spot: z.object({
    value: z.number(),
    time: z.number(),
    attributes: z.object({}),
  }),
  data_points: z.number(),
})

// Rolling-window aggregates: `head` covers the window ending at the latest reading
// (e.g. `ai.minutes.30` head = the last 30 minutes), and `tally` is the total rain in it.
const rainAggregateSchema = z
  .object({
    head: z
      .object({
        fields: z
          .object({
            Rain: z
              .object({
                unit_enum: z.number().optional(),
                unit: z.string(),
                tally: z.object({ value: z.number() }).passthrough(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .optional()
  .catch(undefined)

const deviceStatusSchema = z
  .object({
    time_zone: z.string(),
    status: z
      .object({
        health: z.string().optional(),
        battery_status: z.enum(['low', 'charged']).or(z.string()).optional(),
        battery_level: z.number().optional(),
      })
      .passthrough(),
    last_update: z.number(),
    data: z.object({
      current: z.object({
        Temperature: dataSchema.optional(),
        Humidity: dataSchema.optional(),
        HeatIndex: dataSchema.optional(),
        BarometricPressure: dataSchema.optional(),
        WindSpeed: dataSchema.optional(),
        // A malformed rain reading shouldn't take down the rest of the status payload.
        Rain: dataSchema.optional().catch(undefined),
      }),
      'ai.minutes.15': rainAggregateSchema,
      'ai.minutes.30': rainAggregateSchema,
      'ai.hours.1': rainAggregateSchema,
      'ai.days.1': rainAggregateSchema,
    }),
  })
  .passthrough()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParams = any[]

type Logger = {
  info: (message: string, ...parameters: AnyParams) => void
  success: (message: string, ...parameters: AnyParams) => void
  warn: (message: string, ...parameters: AnyParams) => void
  error: (message: string, ...parameters: AnyParams) => void
  debug: (message: string, ...parameters: AnyParams) => void
}

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
type Measurement = z.infer<typeof dataSchema>

export default class LaCrosseAPI {
  private client: Got
  private log: Logger
  private warnedUnits = new Set<string>()

  constructor(email: string, password: string, log: Logger) {
    this.log = log
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
        afterResponse: [
          response => {
            this.log.debug(
              'Request %s',
              util.inspect(
                {
                  method: response.request.options.method,
                  url: response.request.requestUrl?.toString(),
                  request: {
                    headers: response.request.options.headers,
                    body: response.request.options.body,
                  },
                  response: {
                    status: response.statusCode,
                    headers: response.headers,
                    body: response.body,
                  },
                },
                { depth: null },
              ),
            )
            return response
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
      windSpeed: this.convertToKmh(data.WindSpeed)?.spot.value,
      rain: this.convertToMm(data.Rain)?.spot.value,
      rainLast15Minutes: this.rainTally(response.data['ai.minutes.15']),
      rainLast30Minutes: this.rainTally(response.data['ai.minutes.30']),
      rainLastHour: this.rainTally(response.data['ai.hours.1']),
      rainLast24Hours: this.rainTally(response.data['ai.days.1']),
      battery: response.status.battery_level,
    }
  }

  /**
   * Normalizes a wind speed reading to km/h.
   * Unknown units are logged once and passed through unchanged (assumed km/h).
   */
  private convertToKmh(windSpeed?: Measurement) {
    return this.convertUnit(windSpeed, WIND_SPEED_TO_KMH, 'wind speed', 'km/h')
  }

  /**
   * Normalizes a rain reading to millimeters.
   * Unknown units are logged once and passed through unchanged (assumed mm).
   */
  private convertToMm(rain?: Measurement) {
    return this.convertUnit(rain, RAIN_TO_MM, 'rain', 'mm')
  }

  /** Total rain (mm) in an aggregate's rolling window, or undefined if the API didn't provide it. */
  private rainTally(aggregate: z.infer<typeof rainAggregateSchema>) {
    const rain = aggregate?.head?.fields.Rain
    if (!rain) return undefined
    return this.toUnit(rain.tally.value, rain.unit, rain.unit_enum, RAIN_TO_MM, 'rain', 'mm')
  }

  private convertUnit(
    measurement: Measurement | undefined,
    factors: Record<string, number>,
    label: string,
    assumedUnit: string,
  ) {
    if (!measurement) return measurement
    measurement.spot.value = this.toUnit(
      measurement.spot.value,
      measurement.unit,
      measurement.unit_enum,
      factors,
      label,
      assumedUnit,
    )
    return measurement
  }

  private toUnit(
    value: number,
    unit: string,
    unitEnum: number | undefined,
    factors: Record<string, number>,
    label: string,
    assumedUnit: string,
  ) {
    const factor = factors[unit]
    if (factor === undefined) {
      if (!this.warnedUnits.has(unit)) {
        this.warnedUnits.add(unit)
        this.log.warn(
          'Unknown %s unit [%s] (unit_enum %s), assuming %s. Please report this on GitHub.',
          label,
          unit,
          unitEnum,
          assumedUnit,
        )
      }
      return value
    }
    return value * factor
  }
}

const RAIN_TO_MM: Record<string, number> = {
  millimeters: 1,
  millimetres: 1,
  inches: 25.4,
}

const WIND_SPEED_TO_KMH: Record<string, number> = {
  kilometers_per_hour: 1,
  kilometres_per_hour: 1,
  miles_per_hour: 1.609344,
  meters_per_second: 3.6,
  metres_per_second: 3.6,
  knots: 1.852,
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

function formatError<This, Args extends AnyParams, Return>(target: (this: This, ...args: Args) => Promise<Return>) {
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
  if (error instanceof ZodError) {
    return new Error('Error while validating LaCrosse API response', { cause: error })
  } else if (error instanceof HTTPError) {
    return new Error(error.response.body?.error?.message || error.response.body?.error, { cause: error })
  } else if (error instanceof RequestError) {
    return new Error(error.response?.body?.error?.message || error.response?.body?.error.message, { cause: error })
  } else if (error instanceof Error) {
    return new Error(error.message, { cause: error })
  }

  return new Error('Unknown error', { cause: error })
}
