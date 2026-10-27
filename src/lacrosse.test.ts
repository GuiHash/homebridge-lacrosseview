import { expect, test } from 'vitest'
import LaCrosseAPI from './lacrosse.js'
import { http, HttpResponse } from 'msw'
import realRainStatus from '../mocks/rain-status.json'
import realWindMultiStatus from '../mocks/wind-multi-status.json'

/* eslint-disable no-console */
const logger = {
  info: () => console.info,
  success: () => console.info,
  warn: () => console.warn,
  error: () => console.error,
  debug: () => console.debug,
}
/* eslint-enable no-console */

test('throw an error if invalid email', async () => {
  globalThis.httpServer?.use(
    http.post('https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword', () => {
      return HttpResponse.json(
        {
          error: {
            code: 400,
            message: 'EMAIL_NOT_FOUND',
            errors: [
              {
                message: 'EMAIL_NOT_FOUND',
                domain: 'global',
                reason: 'invalid',
              },
            ],
          },
        },
        { status: 400 },
      )
    }),
  )

  const lacrosse = new LaCrosseAPI('an-invalid-email@example.local', 'password', logger)

  await expect(() => lacrosse.getLocations()).rejects.toThrowError(new Error('EMAIL_NOT_FOUND'))
})

test('throw an error if invalid password', async () => {
  globalThis.httpServer?.use(
    http.post('https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword', () => {
      return HttpResponse.json(
        {
          error: {
            code: 400,
            message: 'INVALID_PASSWORD',
            errors: [
              {
                message: 'INVALID_PASSWORD',
                domain: 'global',
                reason: 'invalid',
              },
            ],
          },
        },
        { status: 400 },
      )
    }),
  )
  const lacrosse = new LaCrosseAPI('an-email@example.local', 'invalid-password', logger)

  await expect(() => lacrosse.getLocations()).rejects.toThrowError(new Error('INVALID_PASSWORD'))
})

test('get all locations', async () => {
  const lacrosse = new LaCrosseAPI('an-email@example.local', 'password', logger)

  await expect(lacrosse.getLocations()).resolves.toStrictEqual([
    {
      createdOn: '2021-01-23T20:24:12.452Z',
      flaggedForSynchVNext: true,
      id: 'a-location-id',
      modifiedOn: '2021-01-23T20:24:12.452Z',
      name: 'Home',
      ownerId: 'an-owner-id',
      shallow: false,
      weight: '100',
    },
  ])
})

test('get all devices', async () => {
  const lacrosse = new LaCrosseAPI('an-email@example.local', 'password', logger)

  await expect(lacrosse.getDevices()).resolves.toStrictEqual([
    {
      id: 'a-device-id',
      modifiedOn: '2021-01-23T20:24:12.708Z',
      createdOn: '2021-01-23T20:24:12.708Z',
      shallow: false,
      weight: '0',
      flaggedForSynchVNext: true,
      name: 'Chambre',
      sensor: {
        id: 'a-sensor-id',
        modifiedOn: '2020-07-28T11:44:02.478Z',
        createdOn: '2020-07-28T11:44:02.478Z',
        shallow: false,
        flaggedForSynchVNext: true,
        type: {
          id: '5758531941433344',
          shallow: false,
          category: 10,
          name: 'WS6862BLA FRANCE',
          internalName: 'WS6862BLA',
          description: 'C83100 FOR FRANCE UPLOAD PRESSURE',
          image:
            'https://firebasestorage.googleapis.com/v0/b/lax-gateway.appspot.com/o/images%2FWS6862BLA.png?alt=media',
          fields: {
            Temperature: 1,
            notSupported: 0,
            BarometricPressure: 24,
            Humidity: 2,
            HeatIndex: 6,
          },
        },
        series: 'V2',
        serial: 'serial',
        controlCode: 1,
        verificationCode: 'ap7',
        geo: {
          anonymous: false,
          zip: '',
          timezone: 'America/',
          countryCode: 'US',
        },
        attributes: {
          factory: '14',
          Composite: '0',
          display: '1',
          'data-stream': '1',
          'device-glyph': '20',
        },
        fields: {
          Temperature: 1,
          notSupported: 0,
          BarometricPressure: 24,
          Humidity: 2,
          HeatIndex: 6,
        },
        permissions: {
          owner: true,
          read: true,
          subscribe: true,
          claim: true,
          admin: true,
          share: true,
          'admin.geo': true,
          'admin.smartview': true,
        },
        linkedSensors: [
          {
            identifier: 'auto',
            type: '0',
            sensorId: 'a-sensor-id',
          },
        ],
        category: 10,
        sensorTypeEntityId: '5758531941433344',
      },
      sensorId: 'a-sensor-id',
      locationId: 'a-location-id',
      ownerId: 'an-owner-id',
    },
  ])
})

test('get device status', async () => {
  const lacrosse = new LaCrosseAPI('an-email@example.local', 'password', logger)

  await expect(lacrosse.getDeviceStatus('a-device-id')).resolves.toStrictEqual({
    barometricPressure: 1040,
    battery: 10,
    heatIndex: 15.6,
    humidity: 54,
    temperature: 15.600000000000001,
    windSpeed: undefined,
    rain: undefined,
    rainLast15Minutes: undefined,
    rainLast30Minutes: undefined,
    rainLastHour: undefined,
    rainLast24Hours: undefined,
  })
})

const windStatus = (unit: string, value: number) => ({
  time_zone: 'Etc/UTC',
  status: { health: 'healthy', battery_status: 'charged', battery_level: 80 },
  last_update: 1738774194,
  data: {
    current: {
      WindSpeed: { unit_enum: 0, unit, spot: { value, time: 1738774194, attributes: {} }, data_points: 1 },
    },
  },
})

const windStatusUrl =
  'https://ingv2.lacrossetechnology.com/api/v1.1/active-user/device-association/ref.user-device.a-wind-device-id/status'

test.each([
  ['kilometers_per_hour', 10, 10],
  ['miles_per_hour', 10, 16.09344],
  ['meters_per_second', 10, 36],
  ['knots', 10, 18.52],
  ['some_new_unit', 10, 10],
])('get wind speed in km/h from %s', async (unit, value, expected) => {
  globalThis.httpServer?.use(http.get(windStatusUrl, () => HttpResponse.json(windStatus(unit, value))))

  const lacrosse = new LaCrosseAPI('an-email@example.local', 'password', logger)
  const status = await lacrosse.getDeviceStatus('a-wind-device-id')

  expect(status.windSpeed).toBeCloseTo(expected)
  expect(status.battery).toBe(80)
})

const rainStatus = (rain: unknown) => ({
  time_zone: 'Etc/UTC',
  status: { health: 'healthy', battery_status: 'charged', battery_level: 90 },
  last_update: 1738774194,
  data: { current: { Rain: rain } },
})

const rainStatusUrl =
  'https://ingv2.lacrossetechnology.com/api/v1.1/active-user/device-association/ref.user-device.a-rain-device-id/status'

test.each([
  ['inches', 0.1, 2.54],
  ['millimeters', 3, 3],
  ['some_new_unit', 3, 3],
])('get rain in mm from %s', async (unit, value, expected) => {
  globalThis.httpServer?.use(
    http.get(rainStatusUrl, () =>
      HttpResponse.json(
        rainStatus({ unit_enum: 517, unit, spot: { value, time: 1738774194, attributes: {} }, data_points: 1 }),
      ),
    ),
  )

  const lacrosse = new LaCrosseAPI('an-email@example.local', 'password', logger)
  const status = await lacrosse.getDeviceStatus('a-rain-device-id')

  expect(status.rain).toBeCloseTo(expected)
})

test('a malformed rain reading does not break the rest of the status', async () => {
  globalThis.httpServer?.use(http.get(rainStatusUrl, () => HttpResponse.json(rainStatus({ unexpected: true }))))

  const lacrosse = new LaCrosseAPI('an-email@example.local', 'password', logger)
  const status = await lacrosse.getDeviceStatus('a-rain-device-id')

  expect(status.rain).toBeUndefined()
  expect(status.battery).toBe(90)
})

test('real rain sensor payload: rolling totals while the latest reading is 0', async () => {
  globalThis.httpServer?.use(http.get(rainStatusUrl, () => HttpResponse.json(realRainStatus)))

  const lacrosse = new LaCrosseAPI('an-email@example.local', 'password', logger)
  const status = await lacrosse.getDeviceStatus('a-rain-device-id')

  expect(status.rain).toBe(0)
  expect(status.rainLast15Minutes).toBeCloseTo(0.762)
  expect(status.rainLast30Minutes).toBeCloseTo(1.524)
  expect(status.rainLastHour).toBeCloseTo(2.54)
  expect(status.rainLast24Hours).toBeCloseTo(14.478)
  expect(status.battery).toBe(75)
})

test('rolling rain totals reported in inches are converted to mm', async () => {
  const payload = structuredClone(realRainStatus) as typeof realRainStatus
  payload.data['ai.hours.1'].head.fields.Rain.unit = 'inches'
  payload.data['ai.hours.1'].head.fields.Rain.tally.value = 0.1
  globalThis.httpServer?.use(http.get(rainStatusUrl, () => HttpResponse.json(payload)))

  const lacrosse = new LaCrosseAPI('an-email@example.local', 'password', logger)
  const status = await lacrosse.getDeviceStatus('a-rain-device-id')

  expect(status.rainLastHour).toBeCloseTo(2.54)
})

test('real LTV-WSDTH04 payload: wind, temperature and humidity', async () => {
  globalThis.httpServer?.use(http.get(windStatusUrl, () => HttpResponse.json(realWindMultiStatus)))

  const lacrosse = new LaCrosseAPI('an-email@example.local', 'password', logger)
  const status = await lacrosse.getDeviceStatus('a-wind-device-id')

  expect(status.windSpeed).toBeCloseTo(1.1)
  expect(status.temperature).toBe(10)
  expect(status.humidity).toBe(92)
  expect(status.battery).toBe(75)
})
