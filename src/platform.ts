import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge'
import fakegato from 'fakegato-history'

import { PLATFORM_NAME, PLUGIN_NAME } from './settings'
import { Accessory } from './platformAccessory'

import LaCrosseAPI, { Device, Location } from './lacrosse'

interface LaCrosseViewConfig extends PlatformConfig {
  password: string
  email: string
  pollingInterval: number
  devicesToExclude: string[]
  locationsToInclude: string[]
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
    devicesToExclude: (config.devicesToExclude || []).filter(filterEmpties),
    locationsToInclude: (config.locationsToInclude || []).filter(filterEmpties),
    fakeGatoEnabled: fakeGatoEnabled ? Boolean(fakeGatoEnabled) : false,
    fakeGatoStoragePath: fakeGatoStoragePath ? String(fakeGatoStoragePath) : undefined,
  }
}

function filterEmpties(value: string) {
  return value && value.trim().length > 0
}

const DISCOVER_DEVICES_INTERVAL = 10 * 60 * 1000 // every 10 minutes

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class LaCrosseViewPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic
  public readonly lacrosse: LaCrosseAPI
  public readonly config: LaCrosseViewConfig
  public readonly FakeGatoHistoryService

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = []

  constructor(public readonly log: Logger, config: PlatformConfig, public readonly api: API) {
    try {
      this.config = generateConfig(config)
      this.FakeGatoHistoryService = fakegato(this.api)
      this.lacrosse = new LaCrosseAPI(this.config.email, this.config.password)
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
          this.discoverDevices(false)
        }, DISCOVER_DEVICES_INTERVAL)
      })
    } catch (e) {
      this.lacrosse = new LaCrosseAPI('', '')
      this.config = config as LaCrosseViewConfig
      this.log.error(e.message)
    }
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info(
      `Loading accessory from cache: [%s] %s %s`,
      accessory.displayName,
      accessory.context.device.id,
      accessory.UUID,
    )

    if (!this.shouldIncludeDevice(accessory.context.device)) {
      this.log.info(
        `Excluding existing device excluded by configuration: [%s] %s %s`,
        accessory.displayName,
        accessory.context.device.id,
        accessory.UUID,
      )
      return
    }

    new Accessory(this, accessory)

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory)
  }

  async discoverDevices(initial: boolean) {
    try {
      const allLocations = await this.lacrosse.getLocations()
      const locations = allLocations.filter(location => {
        if (initial) {
          this.log.info('Location: [%s] id [%s]', location.name, location.id)
        }
        if (!this.shouldIncludeLocation(location)) {
          this.log.debug(
            `Ignoring discovered location excluded by configuration: [%s] id [%s]`,
            location.name,
            location.id,
          )
          return false
        }
        return true
      })

      const allDevices = await this.lacrosse.getDevices(locations)
      const devices = allDevices.filter(device => {
        if (!this.shouldIncludeDevice(device)) {
          this.log.debug(`Ignoring discovered device excluded by configuration: [%s] %s`, device.name, device.id)
          return false
        }
        return true
      })

      for (const device of devices) {
        const uuid = this.api.hap.uuid.generate(device.id)
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

        if (initial || !existingAccessory) {
          this.log.info('New Device Online: [%s] sensor [%s]', device.name, device.id)
          if (!existingAccessory) {
            this.log.info('Adding: [%s] sensor [%s]', device.name, device.id)
          } else {
            this.log.info('Updating: [%s] sensor [%s]', device.name, device.id)
          }
        }
        if (existingAccessory) {
          // the accessory already exists
          this.log.debug('[%s] Existing Accessory found [%s] %s', existingAccessory.displayName, device.id, uuid)

          // Update context accessory
          existingAccessory.context.device = device
          if (existingAccessory.displayName !== device.name) {
            this.log.debug(
              '[%s] Rename Accessory to [%s] [%s] %s',
              existingAccessory.displayName,
              device.name,
              device.id,
              uuid,
            )
            existingAccessory.displayName = device.name
          }

          // update accessory cache with any changes to the accessory details and information
          this.api.updatePlatformAccessories([existingAccessory])
        } else {
          // the accessory does not yet exist, so we need to create it
          this.log.debug('Adding new accessory: %s [%s] [%s]', device.name, device.id, uuid)

          // create a new accessory
          const accessory = new this.api.platformAccessory(device.name, uuid)

          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = device

          // create the accessory handler for the newly create accessory
          // this is imported from `platformAccessory.ts`
          new Accessory(this, accessory)

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
          this.accessories.push(accessory)
        }
      }

      for (const accessory of this.accessories) {
        const existingDevice = devices.find(device => {
          const uuid = this.api.hap.uuid.generate(device.id)
          return accessory.UUID === uuid
        })

        if (!existingDevice) {
          // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
          // remove platform accessories when no longer present
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
          this.log.debug('Removing existing accessory from cache: %s', accessory.displayName)
        }
      }
    } catch (e) {
      this.log.error('Error while discover devices', e)
    }
  }

  private shouldIncludeDevice(device: Device): boolean {
    return (
      this.config.devicesToExclude.find(id => id === device.id) === undefined &&
      this.config.devicesToExclude.find(name => name === device.name) === undefined
    )
  }

  private shouldIncludeLocation(location: Location) {
    return (
      this.config.locationsToInclude.length == 0 ||
      this.config.locationsToInclude.find(id => id === location.id) !== undefined ||
      this.config.locationsToInclude.find(name => name === location.name) !== undefined
    )
  }
}
