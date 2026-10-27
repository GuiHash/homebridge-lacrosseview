import type { Service, PlatformAccessory, Logger } from 'homebridge'
import { deviceSchema, type default as LaCrosseAPI } from './lacrosse.js'

import type { LaCrosseViewPlatform } from './platform.js'

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
  private windSpeedService?: Service
  private windyService?: Service
  private rainingService?: Service
  private rainAmountService?: Service
  private lastRainAt = 0
  private batterySensorService: Service
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

    if (isWindAccessory(accessory.context.device)) {
      // HomeKit has no wind speed service, so the speed is exposed through a light sensor:
      // the "lux" value shown in the Home app is the wind speed in the configured unit.
      const windName = `${accessory.displayName} Wind Speed`
      this.windSpeedService =
        accessory.getServiceById(platform.Service.LightSensor, WIND_SPEED_SUBTYPE) ||
        accessory.addService(platform.Service.LightSensor, windName, WIND_SPEED_SUBTYPE)
      this.windSpeedService.setCharacteristic(platform.Characteristic.Name, windName)
      this.windSpeedService.setCharacteristic(platform.Characteristic.StatusActive, 0)

      // Optional "Windy" occupancy sensor, detected while the speed is at or above the threshold.
      const existingWindy = accessory.getServiceById(platform.Service.OccupancySensor, WINDY_SUBTYPE)
      if (platform.config.windThreshold > 0) {
        const windyName = `${accessory.displayName} Windy`
        this.windyService =
          existingWindy || accessory.addService(platform.Service.OccupancySensor, windyName, WINDY_SUBTYPE)
        this.windyService.setCharacteristic(platform.Characteristic.Name, windyName)
        this.windyService.setCharacteristic(platform.Characteristic.StatusActive, 0)
      } else if (existingWindy) {
        accessory.removeService(existingWindy)
      }
    }

    if (isRainAccessory(accessory.context.device)) {
      // "Raining" occupancy sensor: detected while any rain fell in the configured rolling window.
      const rainingName = `${accessory.displayName} Raining`
      this.rainingService =
        accessory.getServiceById(platform.Service.OccupancySensor, RAINING_SUBTYPE) ||
        accessory.addService(platform.Service.OccupancySensor, rainingName, RAINING_SUBTYPE)
      this.rainingService.setCharacteristic(platform.Characteristic.Name, rainingName)
      this.rainingService.setCharacteristic(platform.Characteristic.StatusActive, 0)

      // Rain total over the last hour or 24 hours, exposed as a light sensor ("lux" = mm or inches).
      const existingAmount = accessory.getServiceById(platform.Service.LightSensor, RAIN_AMOUNT_SUBTYPE)
      if (platform.config.rainAmountSensor) {
        const amountName = `${accessory.displayName} Rain Amount`
        this.rainAmountService =
          existingAmount || accessory.addService(platform.Service.LightSensor, amountName, RAIN_AMOUNT_SUBTYPE)
        this.rainAmountService.setCharacteristic(platform.Characteristic.Name, amountName)
        this.rainAmountService.setCharacteristic(platform.Characteristic.StatusActive, 0)
      } else if (existingAmount) {
        accessory.removeService(existingAmount)
      }
    }

    this.batterySensorService =
      accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery)

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
      this.log.info(`[%s] lacrosse.getDeviceStatus("%s")`, this.accessory.displayName, this.accessory.context.device.id)

      const {
        humidity,
        temperature,
        windSpeed,
        rain,
        rainLast15Minutes,
        rainLast30Minutes,
        rainLastHour,
        rainLast24Hours,
        battery,
      } = await this.lacrosse.getDeviceStatus(this.accessory.context.device.id)

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

      if (typeof windSpeed === 'number' && this.windSpeedService) {
        const speed = convertFromKmh(windSpeed, this.platform.config.windSpeedUnit)
        // CurrentAmbientLightLevel has a minimum of 0.0001, so calm air is clamped to that.
        const lightLevel = Math.min(Math.max(Math.round(speed * 10) / 10, 0.0001), 100000)
        this.windSpeedService.updateCharacteristic(this.platform.Characteristic.StatusActive, 1)
        this.windSpeedService.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, lightLevel)
        this.log.debug(
          `[%s] updateCharacteristic [%s %s] Wind speed`,
          this.accessory.displayName,
          speed.toFixed(1),
          this.platform.config.windSpeedUnit,
        )

        if (this.windyService) {
          const windy = speed >= this.platform.config.windThreshold
          this.windyService.updateCharacteristic(this.platform.Characteristic.StatusActive, 1)
          this.windyService.updateCharacteristic(
            this.platform.Characteristic.OccupancyDetected,
            windy
              ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
              : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED,
          )
        }
      }

      if (this.rainingService && (typeof rain === 'number' || rainLast30Minutes !== undefined)) {
        const config = this.platform.config
        const windowTotal = {
          15: rainLast15Minutes,
          30: rainLast30Minutes,
          60: rainLastHour,
        }[config.rainWindowMinutes]

        let raining: boolean
        if (windowTotal !== undefined) {
          // Preferred: the API's own rolling total for the window. The latest single reading is
          // usually 0 even during steady rain, because the gauge only tips every ~0.25 mm.
          raining = windowTotal > 0
        } else {
          // Fallback when the API doesn't send aggregates: hold after the last non-zero reading.
          const now = Date.now()
          if (typeof rain === 'number' && rain > 0) {
            this.lastRainAt = now
          }
          raining = this.lastRainAt > 0 && now - this.lastRainAt <= config.rainWindowMinutes * 60 * 1000
        }

        this.rainingService.updateCharacteristic(this.platform.Characteristic.StatusActive, 1)
        this.rainingService.updateCharacteristic(
          this.platform.Characteristic.OccupancyDetected,
          raining
            ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
            : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED,
        )

        const periodTotal = config.rainAmountPeriod === 'hour' ? rainLastHour : rainLast24Hours
        const amountMm = periodTotal ?? rain ?? 0
        const amount = config.rainUnit === 'in' ? amountMm / 25.4 : amountMm
        this.log.debug(
          `[%s] updateCharacteristic Rain [raining: %s] [last %s min: %s mm] [last %s: %s %s]`,
          this.accessory.displayName,
          raining,
          config.rainWindowMinutes,
          windowTotal?.toFixed(2) ?? 'n/a',
          config.rainAmountPeriod === 'hour' ? 'hour' : '24 h',
          amount.toFixed(2),
          config.rainUnit,
        )

        if (this.rainAmountService) {
          const lightLevel = Math.min(Math.max(Math.round(amount * 100) / 100, 0.0001), 100000)
          this.rainAmountService.updateCharacteristic(this.platform.Characteristic.StatusActive, 1)
          this.rainAmountService.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, lightLevel)
        }
      }

      if (battery) {
        this.batterySensorService.updateCharacteristic(this.platform.Characteristic.BatteryLevel, battery)
        this.log.debug(`[%s] updateCharacteristic [%s] Battery`, this.accessory.displayName, battery)
        if (battery < 15) {
          this.batterySensorService.updateCharacteristic(
            this.platform.Characteristic.StatusLowBattery,
            this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW,
          )
        } else {
          this.batterySensorService.updateCharacteristic(
            this.platform.Characteristic.StatusLowBattery,
            this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
          )
        }
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
      if (this.windSpeedService) {
        this.windSpeedService.updateCharacteristic(this.platform.Characteristic.StatusActive, 0)
      }
      if (this.windyService) {
        this.windyService.updateCharacteristic(this.platform.Characteristic.StatusActive, 0)
      }
      if (this.rainingService) {
        this.rainingService.updateCharacteristic(this.platform.Characteristic.StatusActive, 0)
      }
      if (this.rainAmountService) {
        this.rainAmountService.updateCharacteristic(this.platform.Characteristic.StatusActive, 0)
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
  return (
    isTemperatureAccessory(device) || isHumidityAccessory(device) || isWindAccessory(device) || isRainAccessory(device)
  )
}

function isRainAccessory(device: Device) {
  return typeof getFields(device)?.Rain === 'number'
}

const RAINING_SUBTYPE = 'raining'
const RAIN_AMOUNT_SUBTYPE = 'rain-amount'

export type RainUnit = 'mm' | 'in'
export type RainWindowMinutes = 15 | 30 | 60
export type RainAmountPeriod = 'hour' | 'day'

function isWindAccessory(device: Device) {
  return typeof getFields(device)?.WindSpeed === 'number'
}

const WIND_SPEED_SUBTYPE = 'wind-speed'
const WINDY_SUBTYPE = 'windy'

export type WindSpeedUnit = 'kmh' | 'mph' | 'ms' | 'knots'

function convertFromKmh(kmh: number, unit: WindSpeedUnit) {
  switch (unit) {
    case 'mph':
      return kmh / 1.609344
    case 'ms':
      return kmh / 3.6
    case 'knots':
      return kmh / 1.852
    default:
      return kmh
  }
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
