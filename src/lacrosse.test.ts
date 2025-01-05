import { expect, test } from 'vitest'
import LaCrosseAPI from './lacrosse.js'
import { http, HttpResponse } from 'msw'

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

  const lacrosse = new LaCrosseAPI('an-invalid-email@example.local', 'password')

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
  const lacrosse = new LaCrosseAPI('an-email@example.local', 'invalid-password')

  await expect(() => lacrosse.getLocations()).rejects.toThrowError(new Error('INVALID_PASSWORD'))
})

test('get all locations', async () => {
  const lacrosse = new LaCrosseAPI('an-email@example.local', 'password')

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
  const lacrosse = new LaCrosseAPI('an-email@example.local', 'password')

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

test('get device weather data', async () => {
  const lacrosse = new LaCrosseAPI('an-email@example.local', 'password')

  await expect(lacrosse.getDeviceWeatherData('a-device-id')).resolves.toStrictEqual({
    barometricPressure: 1033,
    heatIndex: 16.500000000000004,
    humidity: 69,
    temperature: 16.5,
  })
})
