import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformConfig,
  Service,
  Characteristic,
  PlatformAccessory,
} from 'homebridge'
import fakegato from 'fakegato-history'

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import {
  Accessory,
  isCompatibleDevice,
  type PlatformAccessoryWithContext,
  assertPlatformAccessory,
} from './platformAccessory.js'

import LaCrosseAPI from './lacrosse.js'

import util from 'node:util'

interface LaCrosseViewConfig extends PlatformConfig {
  password: string
  email: string
  pollingInterval: number
  devicesToExclude: string[]
  locationsToExclude: string[]
  fakeGatoEnabled: boolean
  fakeGatoStoragePath?: string
}

function generateConfig(config: PlatformConfig): LaCrosseViewConfig {
  const password = config.password
  const email = config.email
  const fakeGatoEnabled = config.fakeGatoEnabled
  const fakeGatoStoragePath = config.fakeGatoStoragePath

  if (!email || !password) {
    throw new Error('Missing password or email, please configure your config.json')
  }
  if (config.pollingInterval && typeof config.pollingInterval !== 'number') {
    throw new Error('pollingInterval must be a number in your config.json')
  }

  return {
    ...config,
    password: String(password),
    email: String(email),
    pollingInterval: config.pollingInterval || 200,
    devicesToExclude: config.devicesToExclude || [],
    locationsToExclude: config.locationsToExclude || [],
    fakeGatoEnabled: fakeGatoEnabled ? Boolean(fakeGatoEnabled) : false,
    fakeGatoStoragePath: fakeGatoStoragePath ? String(fakeGatoStoragePath) : undefined,
  }
}

const DISCOVER_DEVICES_INTERVAL = 10 * 60 * 1000 // every 10 minutes

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class LaCrosseViewPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service
  public readonly Characteristic: typeof Characteristic
  public readonly lacrosse: LaCrosseAPI
  public readonly config: LaCrosseViewConfig
  public readonly FakeGatoHistoryService

  // this is used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessoryWithContext> = new Map()

  constructor(
    public readonly log: Logger,
    config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service
    this.Characteristic = this.api.hap.Characteristic
    this.config = generateConfig(config)
    this.FakeGatoHistoryService = fakegato(this.api)
    this.lacrosse = new LaCrosseAPI(this.config.email, this.config.password, this.log)
    this.log.debug('Finished initializing platform: %s', this.config.platform)

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('didFinishLaunching')
      // run the method to discover / register your devices as accessories
      this.discoverDevices(true)
      setInterval(() => {
        this.discoverDevices()
      }, DISCOVER_DEVICES_INTERVAL)
    })
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    try {
      this.log.info(
        `Loading accessory from cache: [%s] [id: %s] [uuid: %s]`,
        accessory.displayName,
        accessory.context.device.id,
        accessory.UUID,
      )

      assertPlatformAccessory(accessory)

      // add the restored accessory to the accessories cache, so we can track if it has already been registered
      this.accessories.set(accessory.UUID, accessory)
    } catch (e) {
      this.log.error('Configuring accessory', e)
    }
  }

  async discoverDevices(initial?: boolean) {
    try {
      this.log.info('Discovering devices')

      const devices = await this.getDevices()
      const discoveredCacheUUIDs: string[] = []
      // loop over the discovered devices and register each one if it has not already been registered
      for (const device of devices) {
        const uuid = this.api.hap.uuid.generate(device.id)

        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.get(uuid)

        if (existingAccessory) {
          // the accessory already exists
          this.log.debug(
            '[%s] Existing Accessory found [id: %s] [uuid: %s]',
            existingAccessory.displayName,
            device.id,
            uuid,
          )

          // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
          // existingAccessory.context.device = device;
          // this.api.updatePlatformAccessories([existingAccessory]);

          // create the accessory handler for the restored accessory
          // this is imported from `platformAccessory.ts`
          if (initial) {
            new Accessory(this, existingAccessory)
          }
        } else {
          // the accessory does not yet exist, so we need to create it
          this.log.info('Adding new accessory: %s [id: %s] [uuid: %s]', device.name, device.id, uuid)

          // create a new accessory
          const accessory = new this.api.platformAccessory(device.name, uuid)

          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = device

          assertPlatformAccessory(accessory)
          // create the accessory handler for the newly create accessory
          // this is imported from `platformAccessory.ts`
          new Accessory(this, accessory)

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
        }

        // push into discoveredCacheUUIDs
        discoveredCacheUUIDs.push(uuid)
      }

      for (const [uuid, accessory] of this.accessories) {
        if (!discoveredCacheUUIDs.includes(uuid)) {
          this.log.info(
            'Removing existing accessory: %s [id: %s] [uuid: %s]',
            accessory.displayName,
            accessory.context.device.id,
            accessory.UUID,
          )
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
          this.accessories.delete(uuid)
        }
      }
    } catch (e) {
      this.log.error('Discovering devices', e)
    }
  }

  private async getDevices() {
    const allDevices = await this.lacrosse.getDevices()

    return allDevices
      .filter(device => {
        if (this.shouldIncludeDevice(device)) {
          return true
        }
        this.log.debug(`Ignoring discovered device excluded by configuration: [%s] [id: %s]`, device.name, device.id)
        return false
      })
      .filter(device => {
        if (isCompatibleDevice(device)) {
          return true
        }
        this.lacrosse
          .getRawDeviceStatus(device.id)
          .then(data => {
            this.log.info(
              'Ignoring discovered device excluded by incompatibility: [%s] [id: %s]',
              device.name,
              device.id,
            )
            this.log.info(
              'Please consider restarting homebridge in debug mode and opening an issue on github with the debug informations printed',
            )
            this.log.debug(`Device data %s`, util.inspect(device, { depth: null }))
            this.log.debug(`Raw weather data %s`, util.inspect(data, { depth: null }))
            this.log.info(
              'If you want to hide this message, add device [%s] to `devicesToExclude` configuration',
              device.id,
            )
          })
          .catch(e => this.log.error('Error while getting incompatible device data', e))
      })
  }

  private shouldIncludeDevice(device: { id: string; locationId: string }): boolean {
    return (
      !this.config.devicesToExclude.includes(device.id) && !this.config.locationsToExclude.includes(device.locationId)
    )
  }
}
