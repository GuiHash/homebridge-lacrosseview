import { Service, PlatformAccessory, Logger } from 'homebridge'
import LaCrosseAPI from './lacrosse'

import { LaCrosseViewPlatform } from './platform'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Accessory {
  private temperatureSensorService?: Service
  private humiditySensorService?: Service
  private fakeGatoHistoryService?
  private lacrosse: LaCrosseAPI
  private log: Logger

  constructor(
    private readonly platform: LaCrosseViewPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.lacrosse = platform.lacrosse
    this.log = platform.log

    const serialNumber = accessory.context?.device.sensor.serial

    // Fakego doesn't support `/` in accessory infos
    const normalizedDeviceName = accessory.context?.device.sensor.type.name.replace(/\//, '\\')

    // set accessory information
    accessory
      .getService(platform.Service.AccessoryInformation)!
      .setCharacteristic(platform.Characteristic.Manufacturer, 'LA CROSSE TECHNOLOGY')
      .setCharacteristic(platform.Characteristic.Model, normalizedDeviceName)
      .setCharacteristic(platform.Characteristic.SerialNumber, serialNumber)

    if (isTemperatureAccessory(accessory)) {
      // set service temperature
      this.temperatureSensorService =
        accessory.getService(platform.Service.TemperatureSensor) ||
        accessory.addService(platform.Service.TemperatureSensor)

      this.temperatureSensorService.setCharacteristic(platform.Characteristic.Name, accessory.displayName)
      this.temperatureSensorService.setCharacteristic(platform.Characteristic.StatusActive, 0)
    }

    if (isHumidityAccessory(accessory)) {
      // set service humidity
      this.humiditySensorService =
        accessory.getService(platform.Service.HumiditySensor) ||
        this.accessory.addService(platform.Service.HumiditySensor)

      this.humiditySensorService.setCharacteristic(platform.Characteristic.Name, accessory.displayName)
      this.humiditySensorService.setCharacteristic(platform.Characteristic.StatusActive, 0)
    }

    if (platform.config.fakeGatoEnabled) {
      this.fakeGatoHistoryService = new this.platform.FakeGatoHistoryService('weather', accessory, {
        filename: `fakegato-history_${serialNumber}.json`,
        log: this.log,
        path: platform.config.fakeGatoStoragePath,
        storage: 'fs',
      })
    }

    this.updateDataSensors()
    this.log.debug(`[%s] fireCharacteristicUpdateInterval [%s]`, accessory.displayName, platform.config.pollingInterval)
    setInterval(() => {
      this.updateDataSensors()
    }, platform.config.pollingInterval * 1000)
  }

  async updateDataSensors() {
    try {
      this.log.debug(`[%s] lacrosse.getWeatherData(%s)`, this.accessory.displayName, this.accessory.context.device)

      const { humidity, temperature } = await this.lacrosse.getDeviceWeatherData(this.accessory.context.device)

      if (humidity && this.humiditySensorService) {
        this.humiditySensorService.updateCharacteristic(this.platform.Characteristic.StatusActive, 1)
        this.humiditySensorService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, humidity)
        this.log.debug(`[%s] updateCharacteristic [%s] Humidity`, this.accessory.displayName, humidity)
      }

      if (temperature && this.temperatureSensorService) {
        this.temperatureSensorService.updateCharacteristic(this.platform.Characteristic.StatusActive, 1)
        this.temperatureSensorService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, temperature)
        this.log.debug(`[%s] updateCharacteristic [%s] Temperature`, this.accessory.displayName, temperature)
      }

      if (this.fakeGatoHistoryService && (humidity || temperature)) {
        this.fakeGatoHistoryService.addEntry({
          time: new Date().getTime() / 1000,
          temp: temperature,
          humidity,
        })
      }
    } catch (e) {
      this.log.error('[%s] %s', this.accessory.displayName, e)
      if (this.humiditySensorService) {
        this.humiditySensorService.updateCharacteristic(this.platform.Characteristic.StatusActive, 0)
      }
      if (this.temperatureSensorService) {
        this.temperatureSensorService.updateCharacteristic(this.platform.Characteristic.StatusActive, 0)
      }
    }
  }
}

export function isCompatibleDevice(device) {
  const accessory = { context: { device } }
  return isTemperatureAccessory(accessory) || isHumidityAccessory(accessory)
}

function isTemperatureAccessory(accessory) {
  return typeof getFields(accessory).Temperature === 'number'
}

function isHumidityAccessory(accessory) {
  return typeof getFields(accessory).Humidity === 'number'
}

function getFields(accessory) {
  return accessory.context.device.sensor.fields
}
