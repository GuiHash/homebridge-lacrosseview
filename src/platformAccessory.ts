import type { Service, PlatformAccessory, Logger } from 'homebridge'
import LaCrosseAPI, { deviceSchema } from './lacrosse.js'

import { LaCrosseViewPlatform } from './platform.js'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */

type Device = Awaited<ReturnType<LaCrosseAPI['getDevices']>>[number]

export type PlatformAccessoryWithContext = PlatformAccessory<{ device: Device }>

export class Accessory {
  private temperatureSensorService?: Service
  private humiditySensorService?: Service
  private fakeGatoHistoryService?
  private lacrosse: LaCrosseAPI
  private log: Logger

  constructor(
    private readonly platform: LaCrosseViewPlatform,
    private readonly accessory: PlatformAccessory<{ device: Device }>,
  ) {
    this.lacrosse = platform.lacrosse
    this.log = platform.log

    const serialNumber = accessory.context?.device.sensor.serial

    // Fakegato doesn't support `/` in accessory infos
    const normalizedDeviceName = accessory.context.device.sensor.type.name.replace(/\//, '\\')

    // set accessory information
    accessory
      .getService(platform.Service.AccessoryInformation)!
      .setCharacteristic(platform.Characteristic.Manufacturer, 'LA CROSSE TECHNOLOGY')
      .setCharacteristic(platform.Characteristic.Model, normalizedDeviceName)
      .setCharacteristic(platform.Characteristic.SerialNumber, serialNumber)

    if (isTemperatureAccessory(accessory.context.device)) {
      // set service temperature
      this.temperatureSensorService =
        accessory.getService(platform.Service.TemperatureSensor) ||
        accessory.addService(platform.Service.TemperatureSensor)

      this.temperatureSensorService.setCharacteristic(platform.Characteristic.Name, accessory.displayName)
      this.temperatureSensorService.setCharacteristic(platform.Characteristic.StatusActive, 0)
    }

    if (isHumidityAccessory(accessory.context.device)) {
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
      this.log.debug(
        `[%s] lacrosse.getDeviceStatus("%s")`,
        this.accessory.displayName,
        this.accessory.context.device.id,
      )

      const { humidity, temperature } = await this.lacrosse.getDeviceStatus(this.accessory.context.device.id)

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
      this.log.error(`[${this.accessory.displayName}] Updating accessory`, e)
      if (this.humiditySensorService) {
        this.humiditySensorService.updateCharacteristic(this.platform.Characteristic.StatusActive, 0)
      }
      if (this.temperatureSensorService) {
        this.temperatureSensorService.updateCharacteristic(this.platform.Characteristic.StatusActive, 0)
      }
    }
  }
}

export function assertPlatformAccessory(
  accessory: PlatformAccessory,
): asserts accessory is PlatformAccessoryWithContext {
  deviceSchema.parse(accessory.context.device)
}

export function isCompatibleDevice(device: Device) {
  return isTemperatureAccessory(device) || isHumidityAccessory(device)
}

function isTemperatureAccessory(device: Device) {
  return typeof getFields(device)?.Temperature === 'number'
}

function isHumidityAccessory(device: Device) {
  return typeof getFields(device)?.Humidity === 'number'
}

function getFields(device: Device) {
  return device.sensor.fields
}
