import { Service, PlatformAccessory, Logger } from 'homebridge'
import LaCrosseAPI from './lacrosse'

import { LaCrosseViewPlatform } from './platform'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class ExamplePlatformAccessory {
  private service: Service
  private humiditySensorService: Service
  private lacrosse: LaCrosseAPI
  private log: Logger

  constructor(private readonly platform: LaCrosseViewPlatform, private readonly accessory: PlatformAccessory) {
    this.lacrosse = platform.lacrosse
    this.log = platform.log

    // set accessory information
    accessory
      .getService(platform.Service.AccessoryInformation)!
      .setCharacteristic(platform.Characteristic.Manufacturer, 'LA CROSSE TECHNOLOGY')
      .setCharacteristic(platform.Characteristic.Model, accessory.context?.device.sensor.type.name)
      .setCharacteristic(platform.Characteristic.SerialNumber, accessory.context?.device.sensor.serial)

    // set service temperature
    this.service =
      accessory.getService(platform.Service.TemperatureSensor) ||
      accessory.addService(platform.Service.TemperatureSensor)

    this.service.setCharacteristic(platform.Characteristic.Name, accessory.displayName)
    this.service.setCharacteristic(platform.Characteristic.StatusActive, 0)

    // set service humidity
    this.humiditySensorService =
      accessory.getService(platform.Service.HumiditySensor) ||
      this.accessory.addService(platform.Service.HumiditySensor)

    this.humiditySensorService.setCharacteristic(platform.Characteristic.Name, accessory.displayName)
    this.humiditySensorService.setCharacteristic(platform.Characteristic.StatusActive, 0)

    this.updateDataSensors()
    this.log.debug(`[%s] fireCharacteristicUpdateInterval [%s]`, accessory.displayName, platform.config.pollingInterval)
    setInterval(async () => {
      await this.updateDataSensors()
    }, platform.config.pollingInterval * 1000)
  }

  async updateDataSensors() {
    this.log.debug(`[%s] lacrosse.getWeatherData(%s)`, this.accessory.displayName, this.accessory.context.device)

    this.service.updateCharacteristic(this.platform.Characteristic.StatusActive, 1)
    this.humiditySensorService.updateCharacteristic(this.platform.Characteristic.StatusActive, 1)
    const { humidity, temperature } = await this.lacrosse.getDeviceWeatherData(this.accessory.context.device)

    this.humiditySensorService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, humidity)
    this.humiditySensorService.updateCharacteristic(this.platform.Characteristic.StatusActive, 0)
    this.log.debug(`[%s] updateCharacteristic [%s] Humidity`, this.accessory.displayName, humidity)

    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, temperature)
    this.service.updateCharacteristic(this.platform.Characteristic.StatusActive, 0)
    this.log.debug(`[%s] updateCharacteristic [%s] Temperature`, this.accessory.displayName, temperature)
  }
}
