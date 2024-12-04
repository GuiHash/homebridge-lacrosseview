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
import { Accessory, isCompatibleDevice } from './platformAccessory'

import LaCrosseAPI from './lacrosse'

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
  public readonly Service: typeof Service = this.api.hap.Service
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic
  public readonly lacrosse: LaCrosseAPI
  public readonly config: LaCrosseViewConfig
  public readonly FakeGatoHistoryService

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = []

  constructor(
    public readonly log: Logger,
    config: PlatformConfig,
    public readonly api: API,
  ) {
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
        this.discoverDevices()
        setInterval(() => {
          this.discoverDevices()
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
      `Loading accessory from cache: [%s] [id: %s] [uuid: %s]`,
      accessory.displayName,
      accessory.context.device.id,
      accessory.UUID,
    )

    new Accessory(this, accessory)

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory)
  }

  async discoverDevices() {
    try {
      this.log.info('Discovering devices')
      const allDevices = await this.lacrosse.getDevices()
      const locations = [...new Set(allDevices.map(device => `id: ${device.locationId}`))]
      this.log.debug(`Found ${locations.length} locations [${locations.join(', ')}]`)
      const devices = allDevices
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
            .rawWeatherData(device)
            .then(data => {
              this.log.info(
                'Ignoring discovered device excluded by incompatibility: [%s] [id: %s]',
                device.name,
                device.id,
              )
              this.log.info(
                'Please consider restarting homebridge in debug mode and opening an issue on github with the debug informations printed',
              )
              this.log.debug(`Device data %s`, JSON.stringify(device, null, 1))
              this.log.debug(`Raw weather data %s`, JSON.stringify(data, null, 1))
              this.log.info(
                'If you want to hide this message, add device [%s] to `devicesToExclude` configuration',
                device.id,
              )
            })
            .catch(e => this.log.error('Error while getting incompatible device data', e))
        })

      for (const device of devices) {
        const uuid = this.api.hap.uuid.generate(device.id)
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

        if (existingAccessory) {
          // the accessory already exists
          this.log.debug(
            '[%s] Existing Accessory found [id: %s] [uuid: %s]',
            existingAccessory.displayName,
            device.id,
            uuid,
          )

          // Update context accessory
          existingAccessory.context.device = device
          if (existingAccessory.displayName !== device.name) {
            this.log.debug(
              '[%s] Rename Accessory to %s [id: %s] [uuid: %s]',
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
          this.log.info('Adding new accessory: %s [id: %s] [uuid: %s]', device.name, device.id, uuid)

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
          this.log.debug(
            'Removing existing accessory: %s [id: %s] [uuid: %s]',
            accessory.displayName,
            accessory.context.device.id,
            accessory.UUID,
          )
        }
      }
    } catch (e) {
      this.log.error('Error while discover devices', e)
    }
  }

  private shouldIncludeDevice(device): boolean {
    return (
      !this.config.devicesToExclude.includes(device.id) && !this.config.locationsToExclude.includes(device.locationId)
    )
  }
}
