import { afterAll, afterEach, beforeAll } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

import deviceStatus from './mocks/device-status.json'
import allDevices from './mocks/all-devices.json'
import allLocations from './mocks/all-locations.json'

const server = setupServer(
  http.post('https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword', async ({ request }) => {
    const body = await request.json()

    if (
      !body ||
      !(typeof body === 'object') ||
      body.email !== 'an-email@example.local' ||
      body.password !== 'password'
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

    return HttpResponse.json(allLocations)
  }),
  http.get(
    'https://lax-gateway.appspot.com/_ah/api/lacrosseClient/v1.1/active-user/location/a-location-id/sensorAssociations',
    ({ request }) => {
      if (request.headers.get('Authorization') !== 'Bearer a-jwt-token') {
        return HttpResponse.text('Unauthorized', { status: 401 })
      }

      return HttpResponse.json(allDevices)
    },
  ),
  http.get(
    'https://ingv2.lacrossetechnology.com/api/v1.1/active-user/device-association/ref.user-device.a-device-id/status',
    ({ request }) => {
      if (request.headers.get('Authorization') !== 'Bearer a-jwt-token') {
        return HttpResponse.text('Unauthorized', { status: 401 })
      }

      return HttpResponse.json(deviceStatus)
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
