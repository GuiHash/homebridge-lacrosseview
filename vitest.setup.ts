import { afterAll, afterEach, beforeAll } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const server = setupServer(
  http.post('https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword', async ({ request }) => {
    const body = await request.json()

    if (
      !body ||
      !(typeof body === 'object') ||
      body.email !== 'a-valid-email' ||
      body.password !== 'a-valid-password'
    ) {
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
    }

    return HttpResponse.json({
      kind: 'identitytoolkit#VerifyPasswordResponse',
      localId: 'a-local-id',
      email: 'an-email',
      displayName: '',
      idToken: 'a-jwt-token',
      registered: true,
      refreshToken: 'a-refresh-token',
      expiresIn: '3600',
    })
  }),
  http.get('https://lax-gateway.appspot.com/_ah/api/lacrosseClient/v1.1/active-user/locations', ({ request }) => {
    if (request.headers.get('Authorization') !== 'Bearer a-jwt-token') {
      return HttpResponse.text('Unauthorized', { status: 401 })
    }

    return HttpResponse.json({
      items: [
        {
          id: 'a-location-id',
          modifiedOn: '2021-01-23T20:24:12.452Z',
          createdOn: '2021-01-23T20:24:12.452Z',
          shallow: false,
          weight: '100',
          flaggedForSynchVNext: true,
          name: 'Home',
          ownerId: 'an-owner-id',
        },
      ],
    })
  }),
  http.get(
    'https://lax-gateway.appspot.com/_ah/api/lacrosseClient/v1.1/active-user/location/a-location-id/sensorAssociations',
    ({ request }) => {
      if (request.headers.get('Authorization') !== 'Bearer a-jwt-token') {
        return HttpResponse.text('Unauthorized', { status: 401 })
      }

      return HttpResponse.json({
        items: [
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
                SoftAP: '1',
                'data-stream': '1',
                'device-glyph': '20',
                WPS: '1',
              },
              internalAttributes: { SoftAP: '1' },
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
        ],
      })
    },
  ),
  http.get(
    'https://ingv2.lacrossetechnology.com/api/v1.1/active-user/device-association/ref.user-device.a-device-id/feed',
    ({ request }) => {
      if (request.headers.get('Authorization') !== 'Bearer a-jwt-token') {
        return //HttpResponse.unauthorized()
      }

      return HttpResponse.json({
        'ref.user-device.a-device-id': {
          'ai.ticks.1': {
            time_zone: 'Europe/Paris',
            range: {
              unix: { to: 1735243551, from: 1735241551, continue: 1735243112 },
              iso8601: {
                to: '2024-12-26T21:05:51.246127+01:00',
                from: '2024-12-26T20:32:31+01:00',
                continue: '2024-12-26T20:58:32.674713+01:00',
              },
            },
            fields: {
              Temperature: {
                values: [{ u: 1735243112, s: 16.5 }],
                unit_enum: 4225,
                unit: 'degrees_celsius',
              },
              Humidity: {
                values: [{ u: 1735243112, s: 69 }],
                unit_enum: 16513,
                unit: 'relative_humidity',
              },
              HeatIndex: {
                values: [{ u: 1735243112, s: 61.7 }],
                unit_enum: 4098,
                unit: 'degrees_fahrenheit',
              },
              BarometricPressure: {
                values: [{ u: 1735243112, s: 1033 }],
                unit_enum: 32897,
                unit: 'millibars',
              },
            },
          },
        },
      })
    },
  ),
)

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

//  Close server after all tests
afterAll(() => server.close())

// Reset handlers after each test `important for test isolation`
afterEach(() => server.resetHandlers())

globalThis.httpServer = server
