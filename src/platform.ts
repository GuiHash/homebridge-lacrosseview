import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge'

import { PLATFORM_NAME, PLUGIN_NAME } from './settings'
import { ExamplePlatformAccessory } from './platformAccessory'

import LaCrosseAPI from './lacrosse'

interface LaCrosseViewConfig extends PlatformConfig {
  password: string
  email: string
  pollingInterval: number
}

function generateConfig(config: PlatformConfig): LaCrosseViewConfig {
  const password = config.password as string
  const email = config.email as string
  if (!email || !password) {
    throw new Error('Missing password or email, please configure your config.json')
  }
  if (config.pollingInterval && typeof config.pollingInterval !== 'number') {
    throw new Error('pollingInterval must be a number in your config.json')
  }
  return {
    ...config,
    password,
    email,
    pollingInterval: (config.pollingInterval as number) || 200,
  }
}

const DISCOVER_DEVICES_INTERVAL = 10 * 60 * 1000 // every 10 mminutes

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

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = []

  constructor(public readonly log: Logger, config: PlatformConfig, public readonly api: API) {
    try {
      this.config = generateConfig(config)
      this.lacrosse = new LaCrosseAPI(this.config.email, this.config.password)
      this.log.debug('Finished initializing platform: %s', this.config.name)

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
      this.lacrosse = {} as LaCrosseAPI
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

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory)
  }

  async discoverDevices(initial: boolean) {
    try {
      const devices = await this.lacrosse.getDevices()

      for (const device of devices) {
        const uuid = this.api.hap.uuid.generate(device.id)
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

        if (initial || !existingAccessory) {
          this.log.info('New Device Online: [%s] sensor [%s]', device.name, device.id)
          this.log.info('Adding: [%s] sensor [%s]', device.name, device.id)
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

          new ExamplePlatformAccessory(this, existingAccessory)

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
          new ExamplePlatformAccessory(this, accessory)

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
        }
      }

      for (const accessory of this.accessories) {
        const existingDevice = devices.find(device => {
          const uuid = this.api.hap.uuid.generate(device.id)
          return accessory.UUID === uuid
        })

        console.warn('gui')

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
}
